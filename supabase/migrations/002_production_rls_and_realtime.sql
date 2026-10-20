-- ============================================================
-- H11 Neubau – Migration 002: Production Hardening, RLS, Realtime & Menu Sync
-- Additiv & idempotent: sicher auf bestehenden und neuen Datenbanken ausführbar.
-- Ausführen: Supabase Dashboard → SQL Editor → nach 001_init.sql ausführen.
-- ============================================================

-- ---------- 1. Additive Spalten für Produktion ----------
alter table public.menu_items
  add column if not exists price_cents int,
  add column if not exists source_ref text,
  add column if not exists source_order int,
  add column if not exists image_source_url text,
  add column if not exists updated_at timestamptz not null default now();

update public.menu_items
set price_cents = round(price * 100)::int
where price_cents is null and price is not null;

alter table public.menu_options
  add column if not exists price_delta_cents int;

update public.menu_options
set price_delta_cents = round(price_delta * 100)::int
where price_delta_cents is null and price_delta is not null;

alter table public.restaurant_settings
  add column if not exists postal_code text not null default '1070',
  add column if not exists city text not null default 'Wien',
  add column if not exists pickup_enabled boolean not null default true,
  add column if not exists opening_hours jsonb,
  add column if not exists online_ordering_hours jsonb,
  add column if not exists hours_confirmed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

insert into public.restaurant_settings (id, restaurant_name, address, postal_code, city, ordering_enabled, pickup_enabled, demo_mode)
values (1, 'H11 Neubau', 'Neubaugasse 9, 1070 Wien', '1070', 'Wien', true, true, true)
on conflict (id) do nothing;

alter table public.staff_users
  add column if not exists email text,
  add column if not exists created_at timestamptz not null default now();

alter table public.orders
  alter column customer_name drop not null,
  alter column customer_name drop default;

-- ---------- 2. Bestellnummer im Format H11-101 ----------
create or replace function public.next_order_number(p_day date) returns text
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into order_counters(day, n) values (p_day, 1)
  on conflict (day) do update set n = order_counters.n + 1
  returning n into v;
  return 'H11-' || (100 + v)::text;
end $$;

-- ---------- 3. Serverseitige Warenkorb-Validierung ----------
-- Unterstützt sowohl Gast-Checkout ohne Personendaten als auch optionale Kundendaten.
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
  if not coalesce(s.ordering_enabled, true) or not coalesce(s.pickup_enabled, true) then
    raise exception 'ordering_paused';
  end if;

  v_name  := btrim(coalesce(payload->'customer'->>'name', ''));
  v_phone := btrim(coalesce(payload->'customer'->>'phone', ''));
  v_email := btrim(coalesce(payload->'customer'->>'email', ''));
  v_note  := btrim(coalesce(payload->>'note', payload->'customer'->>'note', ''));
  if length(v_name) > 60 then raise exception 'invalid_input:name'; end if;
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
    if mi.price is null or mi.price <= 0 then raise exception 'invalid_item'; end if;

    opt_ids := array(select jsonb_array_elements_text(coalesce(it->'options', '[]'::jsonb)));
    if (select count(distinct x) from unnest(opt_ids) x) <> coalesce(array_length(opt_ids, 1), 0) then
      raise exception 'invalid_option';
    end if;
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
  values (next_order_number(v_day), v_day, nullif(v_name, ''), nullif(v_phone, ''), nullif(v_email, ''), nullif(v_note, ''),
          v_sub, v_sub, case when p_paid then 'paid' else 'pending' end, p_demo, case when p_paid then now() end)
  returning * into v_order;

  insert into order_items (order_id, menu_item_id, name, unit_price, quantity, selected_options, note, total_price)
  select v_order.id, l.menu_item_id, l.name, l.unit_price, l.quantity, l.selected_options, nullif(l.note, ''), l.total_price
  from jsonb_to_recordset(lines) as l(menu_item_id text, name text, unit_price numeric, quantity int, selected_options jsonb, note text, total_price numeric);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.public_order_number,
    'tracking_token', v_order.tracking_token, 'total', v_order.total, 'items', lines);
end $$;

revoke all on function public.create_order_from_cart(jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.create_order_from_cart(jsonb, boolean, boolean) to service_role;

-- ---------- 4. Öffentlicher Bestellstatus per Token ----------
create or replace function public.get_order_by_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_token uuid; o orders;
begin
  begin v_token := p_token::uuid; exception when others then return null; end;
  select * into o from orders where tracking_token = v_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'public_order_number', o.public_order_number,
    'customer_name', o.customer_name,
    'customer_note', o.customer_note,
    'payment_status', o.payment_status,
    'order_status', o.order_status,
    'total', o.total,
    'created_at', o.created_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'name', name, 'quantity', quantity, 'selected_options', selected_options, 'note', note
    )) from order_items where order_id = o.id), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_order_by_token(text) from public;
grant execute on function public.get_order_by_token(text) to anon, authenticated;

-- ---------- 5. Menü-Import-RPC (nur service_role, überschreibt NIEMALS sold_out) ----------
create or replace function public.import_menu(payload jsonb, p_deactivate_unlisted boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  it jsonb;
  v_cats int := 0;
  v_items int := 0;
  seen_ids text[] := array[]::text[];
begin
  for c in select * from jsonb_array_elements(coalesce(payload->'categories', '[]'::jsonb)) loop
    insert into public.categories (id, name, slug, sort_order, active)
    values (c->>'id', c->>'name', coalesce(c->>'slug', c->>'id'), coalesce((c->>'sort_order')::int, 0), true)
    on conflict (id) do update set
      name = excluded.name,
      sort_order = excluded.sort_order,
      active = true;
    v_cats := v_cats + 1;
  end loop;

  for it in select * from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) loop
    insert into public.menu_items (
      id, category_id, name, description, price, price_cents, price_is_demo,
      image_url, image_source_url, source_ref, source_order, sort_order, active
    )
    values (
      it->>'id',
      it->>'category_id',
      it->>'name',
      nullif(it->>'description', ''),
      round(coalesce((it->>'price_cents')::numeric, 0) / 100.0, 2),
      (it->>'price_cents')::int,
      false,
      nullif(it->>'image_url', ''),
      nullif(it->>'image_source_url', ''),
      nullif(it->>'source_ref', ''),
      coalesce((it->>'source_order')::int, 0),
      coalesce((it->>'sort_order')::int, 0),
      coalesce((it->>'price_cents')::int, 0) > 0
    )
    on conflict (id) do update set
      category_id = excluded.category_id,
      name = excluded.name,
      description = excluded.description,
      price = excluded.price,
      price_cents = excluded.price_cents,
      price_is_demo = false,
      image_url = coalesce(excluded.image_url, public.menu_items.image_url),
      image_source_url = excluded.image_source_url,
      source_ref = excluded.source_ref,
      source_order = excluded.source_order,
      sort_order = excluded.sort_order,
      updated_at = now();
    seen_ids := array_append(seen_ids, it->>'id');
    v_items := v_items + 1;
  end loop;

  if p_deactivate_unlisted and array_length(seen_ids, 1) > 0 then
    update public.menu_items set active = false, updated_at = now()
    where not (id = any(seen_ids));
  end if;

  return jsonb_build_object('categories', v_cats, 'items', v_items);
end $$;

revoke all on function public.import_menu(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_menu(jsonb, boolean) to service_role;

-- ---------- 6. Strikte RLS & Tabellen-Rechte (Defense in Depth) ----------
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

alter table public.orders force row level security;
alter table public.order_items force row level security;
alter table public.staff_users force row level security;
alter table public.order_counters force row level security;
alter table public.stripe_events force row level security;

-- Anonyme Nutzer dürfen NIEMALS Bestellungen auflisten, lesen oder direkt anlegen:
revoke all on table public.orders from anon;
revoke all on table public.order_items from anon;
revoke all on table public.staff_users from anon;
revoke all on table public.order_counters from anon, authenticated;
revoke all on table public.stripe_events from anon, authenticated;

-- Kein direktes INSERT/DELETE auf orders oder order_items für Client-Rollen
-- (Bestellungen entstehen ausschließlich über die Checkout Edge Function / Server-RPC):
revoke insert, delete, truncate on table public.orders from authenticated;
revoke insert, update, delete, truncate on table public.order_items from authenticated;

-- Öffentliches Menü & Einstellungen: für anon nur SELECT
revoke insert, update, delete, truncate on table
  public.categories,
  public.menu_items,
  public.menu_option_groups,
  public.menu_options,
  public.restaurant_settings
from anon;

grant select on table
  public.categories,
  public.menu_items,
  public.menu_option_groups,
  public.menu_options,
  public.restaurant_settings
to anon, authenticated;

grant select, update on table public.orders to authenticated;
grant select on table public.order_items to authenticated;
grant select on table public.staff_users to authenticated;
grant select, insert, update, delete on table
  public.categories,
  public.menu_items,
  public.menu_option_groups,
  public.menu_options
to authenticated;
grant select, update on table public.restaurant_settings to authenticated;

grant execute on function public.is_staff() to anon, authenticated;

-- RLS-Policies (idempotent)
drop policy if exists "menu read" on public.categories;
create policy "menu read" on public.categories for select to anon, authenticated using (true);

drop policy if exists "menu read" on public.menu_items;
create policy "menu read" on public.menu_items for select to anon, authenticated using (true);

drop policy if exists "menu read" on public.menu_option_groups;
create policy "menu read" on public.menu_option_groups for select to anon, authenticated using (true);

drop policy if exists "menu read" on public.menu_options;
create policy "menu read" on public.menu_options for select to anon, authenticated using (true);

drop policy if exists "settings read" on public.restaurant_settings;
create policy "settings read" on public.restaurant_settings for select to anon, authenticated using (true);

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

drop policy if exists "staff self read" on public.staff_users;
create policy "staff self read" on public.staff_users for select to authenticated using (user_id = auth.uid());

drop policy if exists "staff read" on public.orders;
create policy "staff read" on public.orders for select to authenticated using (public.is_staff());

drop policy if exists "staff update" on public.orders;
create policy "staff update" on public.orders for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff read" on public.order_items;
create policy "staff read" on public.order_items for select to authenticated using (public.is_staff());

-- ---------- 7. Realtime (Replica Identity + Publication) ----------
alter table public.orders replica identity full;
alter table public.menu_items replica identity full;
alter table public.restaurant_settings replica identity full;
alter table public.categories replica identity full;

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
