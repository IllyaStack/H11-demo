-- ============================================================
-- H11 Neubau – Direkt-Bestellung (Abholung)
-- Migration 001: Tabellen, Funktionen, RLS, Realtime
-- Ausführen: Supabase Dashboard → SQL Editor → einfügen → Run
-- Danach: supabase/seed.sql ausführen (Speisekarte).
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- Speisekarte ----------
create table if not exists public.categories (
  id text primary key,
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists public.menu_items (
  id text primary key,                       -- stabiler Slug, z. B. "chicken-doener-dueruem"
  category_id text not null references public.categories(id) on delete cascade,
  name text not null,
  description text,
  price numeric(8,2) not null check (price >= 0),  -- tatsächlicher Bestellpreis (EUR)
  price_is_demo boolean not null default true,     -- true = vorläufiger Demo-Preis, NICHT bestätigt
  image_url text,
  active boolean not null default true,
  sold_out boolean not null default false,
  sort_order int not null default 0
);
create index if not exists menu_items_category_idx on public.menu_items(category_id, sort_order);

create table if not exists public.menu_option_groups (
  id text primary key,
  menu_item_id text not null references public.menu_items(id) on delete cascade,
  name text not null,
  required boolean not null default false,
  min_choices int not null default 0,
  max_choices int not null default 1,
  sort_order int not null default 0
);
create index if not exists menu_option_groups_item_idx on public.menu_option_groups(menu_item_id);

create table if not exists public.menu_options (
  id text primary key,
  option_group_id text not null references public.menu_option_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(8,2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0
);
create index if not exists menu_options_group_idx on public.menu_options(option_group_id);

-- ---------- Einstellungen (genau eine Zeile) ----------
create table if not exists public.restaurant_settings (
  id int primary key default 1 check (id = 1),
  ordering_enabled boolean not null default true,
  demo_mode boolean not null default true,   -- true erlaubt place_demo_order (Demo-Zahlung ohne Stripe)
  pickup_message text,
  restaurant_name text not null default 'H11 Neubau',
  address text not null default 'Neubaugasse 9, 1070 Wien'
);
insert into public.restaurant_settings (id) values (1) on conflict do nothing;

-- ---------- Personal ----------
create table if not exists public.staff_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_users where user_id = auth.uid());
$$;

-- ---------- Bestellungen ----------
create table if not exists public.order_counters (
  day date primary key,
  n int not null default 0
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_order_number text not null,                       -- z. B. "H142" (täglich neu gezählt)
  order_day date not null default ((now() at time zone 'Europe/Vienna')::date),
  tracking_token uuid not null default gen_random_uuid() unique,  -- geheimer Link-Token für den Kunden
  customer_name text not null,
  customer_phone text,
  customer_email text,
  customer_note text,
  subtotal numeric(10,2) not null,
  total numeric(10,2) not null,
  currency text not null default 'eur',
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  order_status text not null default 'new' check (order_status in ('new','preparing','ready','picked_up','cancelled')),
  is_demo boolean not null default false,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  unique (order_day, public_order_number)
);
create index if not exists orders_queue_idx on public.orders(payment_status, order_status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id text,
  name text not null,                 -- Snapshot: Name/Preis zum Bestellzeitpunkt
  unit_price numeric(8,2) not null,
  quantity int not null check (quantity > 0),
  selected_options jsonb not null default '[]',
  note text,
  total_price numeric(10,2) not null
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- Idempotenz für Stripe-Webhooks: jede Event-ID wird nur einmal verarbeitet
create table if not exists public.stripe_events (
  id text primary key,
  type text,
  received_at timestamptz not null default now()
);

-- Zeitstempel automatisch setzen, wenn sich der Küchenstatus ändert
create or replace function public.orders_status_timestamps() returns trigger
language plpgsql as $$
begin
  if new.order_status is distinct from old.order_status then
    if new.order_status = 'preparing' then new.preparing_at := now(); end if;
    if new.order_status = 'ready' then new.ready_at := now(); end if;
    if new.order_status = 'picked_up' then new.collected_at := now(); end if;
    if new.order_status = 'cancelled' then new.cancelled_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_status_ts on public.orders;
create trigger orders_status_ts before update on public.orders
  for each row execute function public.orders_status_timestamps();

-- ---------- Bestellnummer: H101, H102 … (pro Tag, Wien) ----------
create or replace function public.next_order_number(p_day date) returns text
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into order_counters(day, n) values (p_day, 1)
  on conflict (day) do update set n = order_counters.n + 1
  returning n into v;
  return 'H' || (100 + v)::text;
end $$;

-- ---------- Kernfunktion: Warenkorb serverseitig prüfen + Bestellung anlegen ----------
-- Der Client sendet NUR IDs und Mengen. Preise kommen ausschließlich aus der Datenbank.
create or replace function public.create_order_from_cart(payload jsonb, p_paid boolean, p_demo boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s restaurant_settings;
  v_name text; v_phone text; v_email text; v_note text;
  it jsonb; mi menu_items; grp menu_option_groups;
  v_qty int; opt_ids text[]; cnt int;
  unit numeric; line_total numeric; v_sub numeric := 0;
  sel jsonb; lines jsonb := '[]'::jsonb;
  v_day date := (now() at time zone 'Europe/Vienna')::date;
  v_order orders;
begin
  select * into s from restaurant_settings where id = 1;
  if not s.ordering_enabled then raise exception 'ordering_paused'; end if;

  v_name  := btrim(coalesce(payload->'customer'->>'name', ''));
  v_phone := btrim(coalesce(payload->'customer'->>'phone', ''));
  v_email := btrim(coalesce(payload->'customer'->>'email', ''));
  v_note  := btrim(coalesce(payload->'customer'->>'note', ''));
  if length(v_name) < 1 or length(v_name) > 60 then raise exception 'invalid_input:name'; end if;
  if length(v_phone) > 30 or length(v_note) > 300 then raise exception 'invalid_input:text'; end if;
  if length(v_email) > 120 or (v_email <> '' and v_email !~ '^\S+@\S+\.\S+$') then raise exception 'invalid_input:email'; end if;
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') not between 1 and 30 then
    raise exception 'invalid_input:items';
  end if;

  for it in select * from jsonb_array_elements(payload->'items') loop
    begin v_qty := (it->>'qty')::int; exception when others then v_qty := null; end;
    if v_qty is null or v_qty < 1 or v_qty > 20 then raise exception 'invalid_input:items'; end if;

    select * into mi from menu_items where id = it->>'id' and active;
    if not found then raise exception 'invalid_item'; end if;
    if mi.sold_out then raise exception 'sold_out:%', mi.name; end if;

    opt_ids := array(select jsonb_array_elements_text(coalesce(it->'options', '[]'::jsonb)));
    if (select count(distinct x) from unnest(opt_ids) x) <> coalesce(array_length(opt_ids, 1), 0) then
      raise exception 'invalid_option';
    end if;
    -- jede Option muss aktiv sein und zu GENAU diesem Artikel gehören
    if exists (select 1 from unnest(opt_ids) x where not exists (
        select 1 from menu_options mo join menu_option_groups gr on gr.id = mo.option_group_id
        where mo.id = x and mo.active and gr.menu_item_id = mi.id)) then
      raise exception 'invalid_option';
    end if;
    for grp in select * from menu_option_groups where menu_item_id = mi.id loop
      select count(*) into cnt from menu_options mo where mo.option_group_id = grp.id and mo.id = any(opt_ids);
      if cnt > grp.max_choices or cnt < (case when grp.required then greatest(grp.min_choices, 1) else grp.min_choices end) then
        raise exception 'invalid_option:%', grp.name;
      end if;
    end loop;

    unit := mi.price + coalesce((select sum(price_delta) from menu_options where id = any(opt_ids)), 0);
    sel := coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price_delta', price_delta) order by sort_order)
                     from menu_options where id = any(opt_ids)), '[]'::jsonb);
    line_total := unit * v_qty;
    v_sub := v_sub + line_total;
    lines := lines || jsonb_build_object('menu_item_id', mi.id, 'name', mi.name, 'unit_price', unit, 'quantity', v_qty,
      'selected_options', sel, 'note', left(coalesce(it->>'note', ''), 140), 'total_price', line_total);
  end loop;

  insert into orders (public_order_number, order_day, customer_name, customer_phone, customer_email, customer_note,
                      subtotal, total, payment_status, is_demo, paid_at)
  values (next_order_number(v_day), v_day, v_name, nullif(v_phone, ''), nullif(v_email, ''), nullif(v_note, ''),
          v_sub, v_sub, case when p_paid then 'paid' else 'pending' end, p_demo, case when p_paid then now() end)
  returning * into v_order;

  insert into order_items (order_id, menu_item_id, name, unit_price, quantity, selected_options, note, total_price)
  select v_order.id, l.menu_item_id, l.name, l.unit_price, l.quantity, l.selected_options, nullif(l.note, ''), l.total_price
  from jsonb_to_recordset(lines) as l(menu_item_id text, name text, unit_price numeric, quantity int, selected_options jsonb, note text, total_price numeric);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.public_order_number,
    'tracking_token', v_order.tracking_token, 'total', v_order.total, 'items', lines);
end $$;

-- Nur der Server (Edge Function mit service_role) darf diese Funktion direkt aufrufen.
revoke all on function public.create_order_from_cart(jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.create_order_from_cart(jsonb, boolean, boolean) to service_role;

-- Demo-Zahlung: nur erlaubt, solange restaurant_settings.demo_mode = true (im Echtbetrieb auf false setzen!)
create or replace function public.place_demo_order(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not coalesce((select demo_mode from restaurant_settings where id = 1), false) then
    raise exception 'demo_disabled';
  end if;
  r := create_order_from_cart(payload, true, true);
  return r - 'items';
end $$;
revoke all on function public.place_demo_order(jsonb) from public;
grant execute on function public.place_demo_order(jsonb) to anon, authenticated;

-- Öffentlicher Bestellstatus: nur mit geheimem Token, nur nicht-sensible Felder
create or replace function public.get_order_by_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_token uuid; o orders;
begin
  begin v_token := p_token::uuid; exception when others then return null; end;
  select * into o from orders where tracking_token = v_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'public_order_number', o.public_order_number, 'customer_name', o.customer_name,
    'payment_status', o.payment_status, 'order_status', o.order_status, 'total', o.total, 'created_at', o.created_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity,
              'selected_options', selected_options, 'note', note)) from order_items where order_id = o.id), '[]'::jsonb));
end $$;
revoke all on function public.get_order_by_token(text) from public;
grant execute on function public.get_order_by_token(text) to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_option_groups enable row level security;
alter table public.menu_options enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.staff_users enable row level security;
alter table public.order_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stripe_events enable row level security;

-- Speisekarte & Einstellungen: öffentlich lesbar, nur Personal darf ändern
drop policy if exists "menu read" on public.categories;
create policy "menu read" on public.categories for select using (true);
drop policy if exists "menu read" on public.menu_items;
create policy "menu read" on public.menu_items for select using (true);
drop policy if exists "menu read" on public.menu_option_groups;
create policy "menu read" on public.menu_option_groups for select using (true);
drop policy if exists "menu read" on public.menu_options;
create policy "menu read" on public.menu_options for select using (true);
drop policy if exists "settings read" on public.restaurant_settings;
create policy "settings read" on public.restaurant_settings for select using (true);

drop policy if exists "staff write" on public.categories;
create policy "staff write" on public.categories for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff write" on public.menu_items;
create policy "staff write" on public.menu_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff write" on public.menu_option_groups;
create policy "staff write" on public.menu_option_groups for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff write" on public.menu_options;
create policy "staff write" on public.menu_options for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff update" on public.restaurant_settings;
create policy "staff update" on public.restaurant_settings for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Bestellungen: NUR Personal darf lesen/ändern. Kunden haben keinen direkten Tabellenzugriff.
drop policy if exists "staff read" on public.orders;
create policy "staff read" on public.orders for select to authenticated using (public.is_staff());
drop policy if exists "staff update" on public.orders;
create policy "staff update" on public.orders for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff read" on public.order_items;
create policy "staff read" on public.order_items for select to authenticated using (public.is_staff());
-- staff_users, order_counters, stripe_events: kein öffentlicher Zugriff

-- ---------- Realtime ----------
do $$
declare
  t text;
begin
  foreach t in array array['orders', 'restaurant_settings', 'menu_items', 'categories'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

