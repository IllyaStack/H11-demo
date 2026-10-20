(function () {
  const C = window.H11;
  const O = window.H11_ORDERING;
  const euro = (n) => "€ " + Number(n).toFixed(2).replace(".", ",");
  const $ = (s) => document.querySelector(s);
  const el = (h) => {
    const t = document.createElement("template");
    t.innerHTML = h.trim();
    return t.content.firstChild;
  };
  const esc = window.H11UI.esc;

  const hasPrice = (i) => i && typeof i.price === "number" && !Number.isNaN(i.price) && i.price > 0;
  // Preisanzeige: bestätigter Anzeigetext, sonst numerischer Preis (mit * nur solange Demo-Preise aktiv sind)
  const priceLabel = (i) =>
    i.displayPrice || (hasPrice(i) ? euro(i.price) + (O.pricesAreDemo ? "*" : "") : "Preis folgt");
  const soldOut = (i) => i.sold_out || !i.active;

  // Favorites (Name → Katalogeintrag aus Supabase bzw. Fallback, damit Preis & Bestellung zum Menü passen)
  function renderFavs() {
    $("#favGrid").replaceChildren(
      ...C.favorites.map((f) => {
        const it = C.catalog.byName[f.name];
        const out = it && soldOut(it);
        const orderable = it && hasPrice(it);
        return el(`
      <article class="card reveal in">
        <img src="${esc((it && it.image) || f.img || "assets/hero.jpg")}" alt="${esc(f.name)}" loading="lazy" decoding="async">
        <div class="card__body">
          <h3>${esc(f.name)}</h3><p>${esc((it && it.desc) || f.desc)}</p>
          <div class="card__row">
            <span class="tag">${out ? "Heute ausverkauft" : it ? priceLabel(it) : "Preis folgt"}</span>
            ${orderable ? `<button class="mini" type="button" data-add="${esc(it.id)}" ${out ? "disabled" : ""}>Hinzufügen</button>` : ""}
          </div>
        </div>
      </article>`);
      })
    );
  }
  $("#favGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b) window.H11Shop.openProduct(b.dataset.add);
  });

  // Menu (aus Supabase-Kategorien & menu_items geladen, mit Demo-Fallback)
  const tabs = $("#tabs"),
    list = $("#menuList");
  let current = C.menu[0] ? C.menu[0].id : "";

  function show(id) {
    if (!C.menu.length) return;
    const cat = C.menu.find((c) => c.id === id) || C.menu[0];
    current = cat.id;
    tabs.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.id === current;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on);
    });
    list.innerHTML = cat.items
      .map((i) => {
        const out = soldOut(i);
        const orderable = hasPrice(i);
        const thumb = i.image
          ? `<img class="mi__img" src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy" decoding="async">`
          : `<div class="mi__img mi__img--ph" aria-hidden="true"><span>H11</span></div>`;
        return `<li class="${out ? "mi--out" : ""}">${thumb}<div class="mi__body"><h3>${esc(i.name)}</h3><p>${esc(i.desc)}</p></div>
        <div class="mi__r"><span class="pr">${out ? "Heute ausverkauft" : priceLabel(i)}</span>
        ${
          orderable
            ? `<button class="add" type="button" data-add="${esc(i.id)}" ${out ? "disabled" : ""} aria-label="${esc(i.name)} hinzufügen">Hinzufügen</button>`
            : ""
        }</div></li>`;
      })
      .join("");
  }

  function renderTabs() {
    tabs.replaceChildren(
      ...C.menu.map((c) => {
        const b = el(`<button role="tab" data-id="${esc(c.id)}">${esc(c.label)}</button>`);
        b.onclick = () => show(c.id);
        return b;
      })
    );
    if (!C.menu.some((c) => c.id === current) && C.menu[0]) {
      current = C.menu[0].id;
    }
    show(current);
    const pn = $("#priceNote");
    if (pn) pn.hidden = !O.pricesAreDemo;
  }

  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b && !b.disabled) return window.H11Shop.openProduct(b.dataset.add);
    const li = e.target.closest("li");
    const a = li && li.querySelector("[data-add]");
    if (a && !a.disabled) window.H11Shop.openProduct(a.dataset.add);
  });

  // Tab-Navigation: Pfeile, Drag-to-scroll, aktiver Tab im Blick
  const wrap = el(
    '<div class="tabs-wrap"><button class="tabs-arrow prev" aria-label="Zurück" hidden>‹</button><button class="tabs-arrow next" aria-label="Weiter">›</button></div>'
  );
  tabs.before(wrap);
  wrap.insertBefore(tabs, wrap.querySelector(".next"));
  const [prev, next] = wrap.querySelectorAll(".tabs-arrow");
  const upd = () => {
    prev.hidden = tabs.scrollLeft < 8;
    next.hidden = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 8;
  };
  prev.onclick = () => tabs.scrollBy({ left: -tabs.clientWidth * 0.7, behavior: "smooth" });
  next.onclick = () => tabs.scrollBy({ left: tabs.clientWidth * 0.7, behavior: "smooth" });
  tabs.addEventListener("scroll", upd, { passive: true });
  window.addEventListener("resize", upd);
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && !moved) b.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  });
  let down = false,
    sx = 0,
    sl = 0,
    moved = false;
  tabs.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    down = true;
    moved = false;
    sx = e.clientX;
    sl = tabs.scrollLeft;
  });
  window.addEventListener("pointermove", (e) => {
    if (!down) return;
    const d = e.clientX - sx;
    if (Math.abs(d) > 5) moved = true;
    tabs.scrollLeft = sl - d;
  });
  window.addEventListener("pointerup", () => {
    down = false;
    setTimeout(() => (moved = false));
  });
  tabs.addEventListener(
    "click",
    (e) => {
      if (moved) e.stopPropagation();
    },
    true
  );

  renderTabs();
  renderFavs();
  upd();

  document.addEventListener("h11:catalog", () => {
    renderTabs();
    renderFavs();
    renderLocationInfo();
    setTimeout(upd, 50);
  });
  document.addEventListener("h11:menu", () => {
    show(current);
    renderFavs();
    const pn = $("#priceNote");
    if (pn) pn.hidden = !O.pricesAreDemo;
  });

  // Externe Plattformen (nur Zweitoption)
  const platforms = [
    ["wolt", "Wolt"],
    ["lieferando", "Lieferando"],
    ["foodora", "Foodora"],
  ];
  $("#orders").append(
    ...platforms.map(([k, n]) =>
      el(`<a class="order-card reveal" href="${C.orderLinks[k]}" target="_blank" rel="noopener"><span>${n}</span><b>Zur Plattform →</b></a>`)
    )
  );
  $("#fOrder").append(...platforms.map(([k, n]) => el(`<a href="${C.orderLinks[k]}" target="_blank" rel="noopener">${n}</a>`)));

  // Gallery
  $("#gallery").append(...C.gallery.map((g, i) => el(`<figure class="g g${i + 1} reveal"><img src="${g.src}" alt="${g.alt}" loading="lazy"></figure>`)));

  // Location & Öffnungszeiten (synchronisiert mit restaurant_settings aus Supabase)
  function renderLocationInfo() {
    const s = C.settings || {};
    const addrText = s.address || `${C.address.street}, ${C.address.zip} ${C.address.city}`;
    $("#addr").textContent = addrText.replace(",", " ·");
    $("#fAddr").textContent = addrText;
    $("#hours").innerHTML = C.hours.map((h) => `<li><span>${esc(h.day)}</span><span>${esc(h.time)}</span></li>`).join("");
    $("#hoursNote").textContent = C.hoursConfirmed ? "" : "Öffnungszeiten werden noch ergänzt.";
    $("#hours").classList.toggle("tbd", !C.hoursConfirmed);
  }
  renderLocationInfo();

  const q = encodeURIComponent(C.mapQuery);
  $("#map").src = `https://www.google.com/maps?q=${q}&output=embed`;
  $("#route").href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(C.routeQuery)}`;

  // Footer
  const ig = $("#insta");
  if (C.social.instagram) {
    ig.href = C.social.instagram;
    ig.target = "_blank";
    ig.rel = "noopener";
  } else {
    ig.classList.add("ph");
    ig.setAttribute("aria-disabled", "true");
  }
  $("#yr").textContent = new Date().getFullYear();

  // Mobile nav
  const burger = $("#burger"),
    nav = $("#nav");
  const close = () => {
    nav.classList.remove("open");
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", false);
  };
  burger.onclick = () => {
    const o = nav.classList.toggle("open");
    burger.classList.toggle("open", o);
    burger.setAttribute("aria-expanded", o);
  };
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));

  // Reveal on scroll
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal:not(.in)").forEach((n) => io.observe(n));
})();
