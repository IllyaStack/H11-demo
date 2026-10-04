(function () {
  const C = window.H11;
  const $ = (s) => document.querySelector(s);
  const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
  const price = (p) => (p == null ? "Preis folgt" : "€ " + Number(p).toFixed(2).replace(".", ","));
  const full = `${C.address.street}, ${C.address.zip} ${C.address.city}`;

  // Favorites
  $("#favGrid").append(...C.favorites.map((f) => el(`
    <article class="card reveal">
      <img src="${f.img}" alt="${f.name}" loading="lazy">
      <div class="card__body">
        <h3>${f.name}</h3><p>${f.desc}</p>
        <span class="tag">${price(f.price)}</span>
      </div>
    </article>`)));

  // Menu
  const tabs = $("#tabs"), list = $("#menuList");
  function show(id) {
    tabs.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.id === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on);
    });
    const cat = C.menu.find((c) => c.id === id);
    list.innerHTML = cat.items.map((i) => `
      <li><div><h3>${i.name}</h3><p>${i.desc}</p></div><span class="${i.price == null ? "pr pr--tbd" : "pr"}">${price(i.price)}</span></li>`).join("");
  }
  C.menu.forEach((c) => {
    const b = el(`<button role="tab" data-id="${c.id}">${c.label}</button>`);
    b.onclick = () => show(c.id); tabs.append(b);
  });
  show(C.menu[0].id);

  // Orders
  const platforms = [["wolt", "Wolt"], ["lieferando", "Lieferando"], ["foodora", "Foodora"]];
  $("#orders").append(...platforms.map(([k, n]) => el(
    `<a class="order-card reveal" href="${C.orderLinks[k]}" target="_blank" rel="noopener"><span>${n}</span><b>Jetzt bestellen →</b></a>`)));
  $("#fOrder").append(...platforms.map(([k, n]) => el(`<a href="${C.orderLinks[k]}" target="_blank" rel="noopener">${n}</a>`)));

  // Gallery
  $("#gallery").append(...C.gallery.map((g, i) => el(
    `<figure class="g g${i + 1} reveal"><img src="${g.src}" alt="${g.alt}" loading="lazy"></figure>`)));

  // Location
  $("#addr").innerHTML = `${C.address.street} · ${C.address.zip} ${C.address.city}`;
  $("#hours").innerHTML = C.hours.map((h) => `<li><span>${h.day}</span><span>${h.time}</span></li>`).join("");
  $("#hoursNote").textContent = C.hoursConfirmed ? "" : "Öffnungszeiten werden noch ergänzt.";
  if (!C.hoursConfirmed) $("#hours").classList.add("tbd");
  const q = encodeURIComponent(C.mapQuery);
  $("#map").src = `https://www.google.com/maps?q=${q}&output=embed`;
  $("#route").href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(C.routeQuery)}`;

  // Footer
  $("#fAddr").textContent = full;
  const ig = $("#insta");
  if (C.social.instagram) { ig.href = C.social.instagram; ig.target = "_blank"; ig.rel = "noopener"; }
  else { ig.classList.add("ph"); ig.setAttribute("aria-disabled", "true"); }
  $("#yr").textContent = new Date().getFullYear();

  // Mobile nav
  const burger = $("#burger"), nav = $("#nav");
  const close = () => { nav.classList.remove("open"); burger.classList.remove("open"); burger.setAttribute("aria-expanded", false); };
  burger.onclick = () => {
    const o = nav.classList.toggle("open"); burger.classList.toggle("open", o); burger.setAttribute("aria-expanded", o);
  };
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));

  // Reveal on scroll
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((n) => io.observe(n));
})();
