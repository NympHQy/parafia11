/* =====================================================================
   Konfiguracja panelu kancelarii
   W razie przeniesienia strony do innego projektu Supabase podmień
   poniższy adres i publiczny klucz anon.
===================================================================== */
const SUPABASE_URL = "https://ccewjbhlqgszqogzjind.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D-eARL7TPuEEVts4ft3oJQ_xL0lZljV";

const cfg = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let sb = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const hasOgl = Boolean($("#ogloszenia"));
const hasInt = Boolean($("#intencje"));
const hasAkt = Boolean($("#aktualnosci"));
const hasGal = Boolean($("#galeria"));
const hasOglRot = Boolean($("#oglRotator"));
const isWpis = Boolean($("#wpis"));

const fallbackAktualnosci = [];

const fallbackIntencje = [
  {
    dzien: "Niedziela",
    data: "bieżący tydzień",
    rows: [
      { godzina: "8:00", intencja: "Za parafian i dobrodziejów naszej wspólnoty" },
      { godzina: "10:00", intencja: "O Boże błogosławieństwo dla rodzin naszej parafii" },
      { godzina: "12:00", intencja: "W intencji dzieci i młodzieży" },
      { godzina: "15:00", intencja: "Za zmarłych polecanych w wypominkach" },
    ],
  },
  {
    dzien: "Dni powszednie",
    data: "poniedziałek - sobota",
    rows: [
      { godzina: "17:00", intencja: "Intencje przyjmowane w kancelarii parafialnej" },
    ],
  },
];

const fallbackOgloszenia = [];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return esc(value);
  }
}

function excerpt(text, length = 140) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length).trim()}...` : clean;
}

function paragraphs(text) {
  return esc(text || "")
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function intencjaHTML(text) {
  const safe = esc(text);
  const splitAt = safe.indexOf(" — ");
  return splitAt === -1 ? safe : `${safe.slice(0, splitAt)} <em>${safe.slice(splitAt + 3)}</em>`;
}

function bindNavigation() {
  const toggle = $(".nav-toggle");
  const links = $(".nav-links");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });

  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      links.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function markActiveNav() {
  const page = location.pathname.split("/").pop() || "index.html";
  $$(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const linkPage = href.split("#")[0];
    if (linkPage && (linkPage === page || (page === "index.html" && linkPage === "parafia.html"))) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
}

function renderOgloszenia(rows = fallbackOgloszenia) {
  const box = $("#ogloszenia .news-list");
  if (!box) return;
  const data = rows && rows.length ? rows : fallbackOgloszenia;
  if (!data.length) {
    box.innerHTML = '<p style="padding:28px 30px;color:var(--stone)">Obecnie brak ogłoszeń.</p>';
    return;
  }
  box.innerHTML = data
    .map(
      (o) => `
      <article class="news-item">
        <div class="date"><b>${esc(o.dzien)}</b><span>${esc(o.miesiac)}</span></div>
        <div><h3>${esc(o.tytul)}</h3><p>${esc(o.tresc)}</p></div>
      </article>`
    )
    .join("");
}

function renderOglRotator(rows) {
  const box = $("#oglRotator");
  if (!box) return;
  const body = $(".ogl-rot-body", box);
  if (!body) return;

  const data = (rows && rows.length ? rows : fallbackOgloszenia).slice(0, 3);
  if (box._timer) clearInterval(box._timer);

  if (!data.length) {
    body.innerHTML = '<p style="color:rgba(255,248,234,.82)">Aktualnie brak ogłoszeń.</p>';
    return;
  }

  const render = (idx, immediate) => {
    const o = data[idx];
    const html = `
      <h3>${esc(o.tytul)}</h3>
      <p>${esc(o.tresc || "")}</p>
      <div class="ogl-rot-dots">${data.map((_, k) => `<span class="${k === idx ? "on" : ""}"></span>`).join("")}</div>`;
    if (immediate) {
      body.innerHTML = html;
      body.style.opacity = "1";
      return;
    }
    body.style.opacity = "0";
    setTimeout(() => {
      body.innerHTML = html;
      body.style.opacity = "1";
    }, 250);
  };

  let i = 0;
  render(0, true);
  if (data.length > 1) {
    box._timer = setInterval(() => {
      i = (i + 1) % data.length;
      render(i);
    }, 5000);
  }
}

function renderIntencje(rows) {
  const box = $("#intencje .int-table");
  if (!box) return;

  let groups;
  if (!rows || !rows.length) {
    groups = fallbackIntencje;
  } else {
    groups = [];
    let cur = null;
    rows.forEach((item) => {
      const key = `${item.dzien || ""}|${item.data || ""}`;
      if (!cur || cur.key !== key) {
        cur = { key, dzien: item.dzien, data: item.data, rows: [] };
        groups.push(cur);
      }
      cur.rows.push(item);
    });
  }

  box.innerHTML = groups
    .map(
      (group) => `
      <div class="int-day">
        <div class="int-day-head"><b>${esc(group.dzien)}</b><span>${esc(group.data)}</span></div>
        ${(() => {
          const byTime = [];
          group.rows.forEach((item) => {
            const last = byTime[byTime.length - 1];
            if (last && last.godzina === item.godzina) last.list.push(item.intencja);
            else byTime.push({ godzina: item.godzina, list: [item.intencja] });
          });
          return byTime
            .map(
              (t) => `
          <div class="int-row">
            <div class="hr">${esc(t.godzina)}</div>
            <div class="desc">${t.list.map((int) => `<div class="int-line">${intencjaHTML(int)}</div>`).join("")}</div>
          </div>`
            )
            .join("");
        })()}
      </div>`
    )
    .join("");
}

function renderAktualnosci(rows = fallbackAktualnosci) {
  const box = $("#aktualnosci .akt-grid");
  if (!box) return;
  const data = rows && rows.length ? rows : fallbackAktualnosci;
  if (!data.length) {
    box.innerHTML = '<p class="akt-empty">Obecnie brak aktualności.</p>';
    return;
  }

  box.innerHTML = data
    .map((item) => {
      const href = String(item.id || "").startsWith("start-")
        ? "aktualnosci"
        : item.slug
        ? `wpis?slug=${encodeURIComponent(item.slug)}`
        : `wpis?id=${encodeURIComponent(item.id)}`;
      return `
      <a class="akt-card" href="${href}">
        ${
          item.zdjecie
            ? `<span class="akt-thumb"><img src="${esc(item.zdjecie)}" alt="${esc(item.tytul)}" loading="lazy"></span>`
            : ""
        }
        <span class="akt-body">
          <span class="akt-date">${fmtDate(item.data || item.created_at)}</span>
          <span class="akt-title">${esc(item.tytul)}</span>
          <span class="akt-exc">${esc(excerpt(item.tresc))}</span>
          <span class="akt-more">Czytaj dalej</span>
        </span>
      </a>`;
    })
    .join("");
}

function renderGaleria(rows = []) {
  const box = $("#galeria .gal-grid");
  if (!box) return;
  if (!rows.length) {
    box.innerHTML =
      '<p class="akt-empty">Galeria jest w przygotowaniu — wkrótce pojawią się zdjęcia z życia parafii.</p>';
    return;
  }

  box.innerHTML = rows
    .map(
      (g) => `
      <button class="gal-item" data-full="${esc(g.url)}" data-cap="${esc(g.opis || "")}">
        <img src="${esc(g.url)}" alt="${esc(g.opis || "Zdjęcie z życia parafii")}" loading="lazy">
      </button>`
    )
    .join("");
  bindLightbox();
}

function bindLightbox() {
  let lb = $("#lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "lightbox";
    lb.className = "lightbox";
    lb.innerHTML = '<button class="lb-close" aria-label="Zamknij">×</button><img alt=""><div class="lb-cap"></div>';
    document.body.appendChild(lb);
    lb.addEventListener("click", (event) => {
      if (event.target === lb || event.target.classList.contains("lb-close")) lb.classList.remove("open");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") lb.classList.remove("open");
    });
  }

  $$("#galeria .gal-item").forEach((item) => {
    item.addEventListener("click", () => {
      $("img", lb).src = item.dataset.full;
      $(".lb-cap", lb).textContent = item.dataset.cap || "";
      lb.classList.add("open");
    });
  });
}

function renderInitialFallbacks() {
  if (hasAkt) renderAktualnosci();
  if (hasGal) renderGaleria();
  if (hasOglRot) renderOglRotator(fallbackOgloszenia);
}

async function connectSupabase() {
  if (!cfg) return;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await applyTresc();
    await loadPublic();
    if (isWpis) await renderWpis();
  } catch (error) {
    console.warn("[Kancelaria] Nie udało się połączyć z Supabase:", error);
  }
}

async function loadPublic() {
  if (!sb) return;
  try {
    if (hasOgl) {
      const { data } = await sb.from("ogloszenia").select("*").order("created_at", { ascending: false });
      if (data) renderOgloszenia(data);
    }
    if (hasInt) {
      const now = new Date();
      const dzis = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const { data } = await sb
        .from("intencje")
        .select("*")
        .or(`data_dnia.gte.${dzis},data_dnia.is.null`)
        .order("data_dnia", { ascending: true, nullsFirst: false })
        .order("kolejnosc", { ascending: true });
      if (data) renderIntencje(data);
    }
    if (hasAkt) {
      const { data } = await sb
        .from("aktualnosci")
        .select("*")
        .eq("publikacja", true)
        .order("data", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (data) renderAktualnosci(data);
    }
    if (hasGal) {
      const { data } = await sb.from("galeria").select("*").order("created_at", { ascending: false });
      if (data) renderGaleria(data);
    }
    if (hasOglRot) {
      const { data } = await sb.from("ogloszenia").select("*").order("created_at", { ascending: false }).limit(3);
      renderOglRotator(data || []);
    }
  } catch (error) {
    console.warn("[Kancelaria] Odczyt treści:", error);
  }
}

async function renderWpis() {
  const box = $("#wpis");
  if (!box) return;
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const slug = params.get("slug");
  if ((!id && !slug) || !sb) {
    box.innerHTML = `
      <article class="wpis-art">
        <a class="wpis-back" href="aktualnosci">← Wszystkie aktualności</a>
        <span class="akt-date">Parafia w Wiernej</span>
        <h1>Wybierz wpis z listy aktualności</h1>
        <div class="wpis-body"><p>Przejdź do listy aktualności i wybierz interesujący Cię wpis.</p></div>
      </article>`;
    return;
  }

  try {
    const zapytanie = sb.from("aktualnosci").select("*");
    const { data } = await (slug ? zapytanie.eq("slug", slug) : zapytanie.eq("id", id)).single();
    if (!data) throw new Error("Brak wpisu");
    document.title = `${data.tytul} - Parafia w Wiernej`;
    box.innerHTML = `
      <article class="wpis-art">
        <a class="wpis-back" href="aktualnosci">← Wszystkie aktualności</a>
        <span class="akt-date">${fmtDate(data.data || data.created_at)}</span>
        <h1>${esc(data.tytul)}</h1>
        ${data.zdjecie ? `<img class="wpis-img" src="${esc(data.zdjecie)}" alt="${esc(data.tytul)}">` : ""}
        <div class="wpis-body">${paragraphs(data.tresc)}</div>
      </article>`;
  } catch {
    box.innerHTML = `
      <article class="wpis-art">
        <a class="wpis-back" href="aktualnosci">← Wszystkie aktualności</a>
        <h1>Nie znaleziono wpisu</h1>
        <div class="wpis-body"><p>Wpis mógł zostać usunięty albo link jest nieaktualny.</p></div>
      </article>`;
  }
}

const kanc = $("#kanc");

function bindPanel() {
  $("#kancOpen")?.addEventListener("click", openPanel);
  $("#kancClose")?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && kanc?.classList.contains("open")) closePanel();
  });
  if (location.hash === "#kancelaria") openPanel();
}

function openPanel() {
  if (!kanc) return;
  kanc.classList.add("open");
  kanc.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
  routePanel();
}

function closePanel() {
  if (!kanc) return;
  kanc.classList.remove("open");
  kanc.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
}

async function routePanel() {
  if (!cfg || !sb) return showSetup();
  const { data } = await sb.auth.getSession();
  if (data.session) showManager();
  else showLogin();
}

function showSetup() {
  const body = $("#kancBody");
  if (!body) return;
  body.innerHTML = `
    <div class="kanc-setup">
      <p><b>Panel kancelarii jest gotowy, ale połączenie z bazą nie jest obecnie aktywne.</b></p>
      <p style="margin-top:10px">Jeżeli strona jest już podpięta pod Supabase, sprawdź połączenie z internetem i ustawienia projektu. Bez bazy publiczne podstrony dalej pokazują treści startowe.</p>
      <p style="margin-top:10px">W kodzie pliku <code>app.js</code> znajdują się pola <code>SUPABASE_URL</code> oraz <code>SUPABASE_ANON_KEY</code>.</p>
    </div>`;
}

function showLogin() {
  const body = $("#kancBody");
  if (!body) return;
  body.innerHTML = `
    <div class="kanc-login">
      <h3>Logowanie</h3>
      <p>Dostęp do panelu dla kancelarii parafialnej.</p>
      <div id="loginMsg"></div>
      <div class="kanc-field"><label>E-mail</label><input id="logEmail" type="email" autocomplete="username"></div>
      <div class="kanc-field"><label>Hasło</label><input id="logPass" type="password" autocomplete="current-password"></div>
      <button class="btn btn-primary" id="logBtn" style="width:100%;margin-top:16px">Zaloguj się</button>
    </div>`;
  $("#logBtn")?.addEventListener("click", doLogin);
  $("#logPass")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") doLogin();
  });
}

async function doLogin() {
  const email = $("#logEmail")?.value.trim();
  const password = $("#logPass")?.value;
  if (!sb || !email || !password) return msg("#loginMsg", "err", "Podaj e-mail i hasło.");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return msg("#loginMsg", "err", "Nie udało się zalogować. Sprawdź dane.");
  showManager();
}

function msg(selector, type, text) {
  const el = $(selector);
  if (el) el.innerHTML = `<div class="kanc-msg ${type}">${esc(text)}</div>`;
}

async function showManager() {
  const body = $("#kancBody");
  if (!body || !sb) return;
  let ogRows = [];
  let itRows = [];
  let aktRows = [];
  let galRows = [];

  if (hasOgl) ogRows = (await sb.from("ogloszenia").select("*").order("created_at", { ascending: false })).data || [];
  if (hasInt) itRows = (await sb.from("intencje").select("*").order("created_at", { ascending: true })).data || [];
  if (hasAkt) aktRows = (await sb.from("aktualnosci").select("*").order("created_at", { ascending: false })).data || [];
  if (hasGal) galRows = (await sb.from("galeria").select("*").order("created_at", { ascending: false })).data || [];

  const editPanel = `
    <div class="kanc-panel" style="display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap">
      <div>
        <h3 style="margin:0 0 4px">Treść tej strony</h3>
        <p style="margin:0">Teksty, godziny i dane kontaktowe można poprawić bezpośrednio na stronie.</p>
      </div>
      <button class="btn btn-primary" id="editStart">Edytuj stronę</button>
    </div>`;

  const ogPanel = !hasOgl
    ? ""
    : `
    <div class="kanc-panel">
      <h3>Ogłoszenia</h3>
      <div id="ogMsg"></div>
      <div class="kanc-row2">
        <div class="kanc-field"><label>Dzień</label><input id="ogDzien" placeholder="12"></div>
        <div class="kanc-field"><label>Miesiąc / opis</label><input id="ogMiesiac" placeholder="Czerwca"></div>
      </div>
      <div class="kanc-field"><label>Tytuł</label><input id="ogTytul" placeholder="Odpust parafialny"></div>
      <div class="kanc-field"><label>Treść</label><textarea id="ogTresc" placeholder="Suma odpustowa o godz. 11:00..."></textarea></div>
      <button class="btn btn-primary" id="ogAdd">Dodaj ogłoszenie</button>
      <div class="kanc-list" id="ogList">${listOg(ogRows)}</div>
    </div>`;

  const itPanel = !hasInt
    ? ""
    : `
    <div class="kanc-panel">
      <h3>Intencje mszalne</h3>
      <div id="itMsg"></div>
      <div class="kanc-field"><label>Dzień tygodnia</label><input id="itDzien" placeholder="Niedziela"></div>
      <div class="kanc-field"><label>Data i opis</label><input id="itData" placeholder="12 czerwca - Uroczystość NSPJ"></div>
      <div class="kanc-row2">
        <div class="kanc-field"><label>Godzina</label><input id="itGodz" placeholder="8:00"></div>
        <div class="kanc-field"><label>Intencja</label><textarea id="itTresc" placeholder="Za parafian"></textarea></div>
      </div>
      <button class="btn btn-primary" id="itAdd">Dodaj intencję</button>
      <div class="kanc-list" id="itList">${listIt(itRows)}</div>
    </div>`;

  const aktPanel = !hasAkt
    ? ""
    : `
    <div class="kanc-panel">
      <h3>Aktualności</h3>
      <div id="aktMsg"></div>
      <div class="kanc-field"><label>Tytuł</label><input id="aktTytul" placeholder="Odpust parafialny"></div>
      <div class="kanc-field"><label>Treść wpisu</label><textarea id="aktTresc" style="min-height:130px" placeholder="Pełny tekst wpisu. Pusta linia rozdziela akapity."></textarea></div>
      <div class="kanc-row2">
        <div class="kanc-field"><label>Data</label><input id="aktData" type="date"></div>
        <div class="kanc-field"><label>Zdjęcie</label><input id="aktFile" type="file" accept="image/*"></div>
      </div>
      <button class="btn btn-primary" id="aktAdd">Dodaj wpis</button>
      <div class="kanc-list" id="aktList">${listAkt(aktRows)}</div>
    </div>`;

  const galPanel = !hasGal
    ? ""
    : `
    <div class="kanc-panel">
      <h3>Galeria</h3>
      <div id="galMsg"></div>
      <div class="kanc-field"><label>Zdjęcia</label><input id="galFile" type="file" accept="image/*" multiple></div>
      <div class="kanc-field"><label>Podpis</label><input id="galOpis" placeholder="Procesja Bożego Ciała"></div>
      <button class="btn btn-primary" id="galAdd">Dodaj zdjęcia</button>
      <div class="kanc-list" id="galList">${listGal(galRows)}</div>
    </div>`;

  const hint = hasOgl || hasInt || hasAkt || hasGal
    ? ""
    : '<div class="kanc-panel"><p style="margin:0">Ogłoszenia, intencje, aktualności i galerię dodaje się na odpowiednich podstronach.</p></div>';

  body.innerHTML =
    editPanel +
    aktPanel +
    ogPanel +
    itPanel +
    galPanel +
    hint +
    '<div style="margin-top:22px;text-align:right"><button class="btn btn-ghost" id="logout">Wyloguj się</button></div>';

  $("#editStart")?.addEventListener("click", () => {
    closePanel();
    enableEdit();
  });
  $("#logout")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    showLogin();
  });
  $("#ogAdd")?.addEventListener("click", addOg);
  $("#itAdd")?.addEventListener("click", addIt);
  $("#aktAdd")?.addEventListener("click", addAkt);
  $("#galAdd")?.addEventListener("click", addGal);
  bindDeletes();
}

function listOg(rows) {
  if (!rows.length) return '<div class="kanc-empty">Brak ogłoszeń. Dodaj pierwsze powyżej.</div>';
  return rows
    .map(
      (o) => `
      <div class="kanc-list-item">
        <div class="txt"><small>${esc(o.dzien)} ${esc(o.miesiac)}</small>${esc(o.tytul)}</div>
        <button class="btn-del" data-t="ogloszenia" data-id="${esc(o.id)}">Usuń</button>
      </div>`
    )
    .join("");
}

function listIt(rows) {
  if (!rows.length) return '<div class="kanc-empty">Brak intencji. Dodaj pierwszą powyżej.</div>';
  return rows
    .map(
      (it) => `
      <div class="kanc-list-item">
        <div class="txt"><small>${esc(it.dzien)} - ${esc(it.godzina)}</small>${esc(it.intencja)}</div>
        <button class="btn-del" data-t="intencje" data-id="${esc(it.id)}">Usuń</button>
      </div>`
    )
    .join("");
}

function listAkt(rows) {
  if (!rows.length) return '<div class="kanc-empty">Brak wpisów. Dodaj pierwszy powyżej.</div>';
  return rows
    .map(
      (a) => `
      <div class="kanc-list-item">
        <div class="txt"><small>${fmtDate(a.data || a.created_at)}</small>${esc(a.tytul)}</div>
        <button class="btn-del" data-t="aktualnosci" data-id="${esc(a.id)}">Usuń</button>
      </div>`
    )
    .join("");
}

function listGal(rows) {
  if (!rows.length) return '<div class="kanc-empty">Brak zdjęć. Dodaj pierwsze powyżej.</div>';
  return rows
    .map(
      (g) => `
      <div class="kanc-list-item">
        <div class="txt" style="display:flex;align-items:center;gap:10px">
          <img src="${esc(g.url)}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:4px">
          <span>${esc(g.opis) || "<small>bez podpisu</small>"}</span>
        </div>
        <button class="btn-del" data-t="galeria" data-id="${esc(g.id)}">Usuń</button>
      </div>`
    )
    .join("");
}

function bindDeletes() {
  $$("#kancBody .btn-del").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!sb) return;
      if (!confirm("Usunąć ten wpis?")) return;
      const { error } = await sb.from(button.dataset.t).delete().eq("id", button.dataset.id);
      if (!error) {
        await showManager();
        await loadPublic();
      }
    });
  });
}

async function addOg() {
  const rec = {
    dzien: $("#ogDzien")?.value.trim(),
    miesiac: $("#ogMiesiac")?.value.trim(),
    tytul: $("#ogTytul")?.value.trim(),
    tresc: $("#ogTresc")?.value.trim(),
  };
  if (!rec.tytul) return msg("#ogMsg", "err", "Podaj przynajmniej tytuł ogłoszenia.");
  const { error } = await sb.from("ogloszenia").insert(rec);
  if (error) return msg("#ogMsg", "err", "Nie udało się zapisać ogłoszenia.");
  await showManager();
  await loadPublic();
}

async function addIt() {
  const rec = {
    dzien: $("#itDzien")?.value.trim(),
    data: $("#itData")?.value.trim(),
    godzina: $("#itGodz")?.value.trim(),
    intencja: $("#itTresc")?.value.trim(),
  };
  if (!rec.intencja) return msg("#itMsg", "err", "Wpisz treść intencji.");
  const { error } = await sb.from("intencje").insert(rec);
  if (error) return msg("#itMsg", "err", "Nie udało się zapisać intencji.");
  await showManager();
  await loadPublic();
}

async function uploadImage(file, folder) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from("galeria").upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return sb.storage.from("galeria").getPublicUrl(path).data.publicUrl;
}

async function addAkt() {
  const tytul = $("#aktTytul")?.value.trim();
  const tresc = $("#aktTresc")?.value.trim();
  const data = $("#aktData")?.value;
  const file = $("#aktFile")?.files[0];
  if (!tytul) return msg("#aktMsg", "err", "Podaj tytuł wpisu.");

  const button = $("#aktAdd");
  if (button) {
    button.disabled = true;
    button.textContent = "Dodawanie...";
  }

  try {
    const rec = { tytul, tresc, zdjecie: file ? await uploadImage(file, "aktualnosci") : null };
    if (data) rec.data = data;
    const { error } = await sb.from("aktualnosci").insert(rec);
    if (error) throw error;
    await showManager();
    await loadPublic();
  } catch (error) {
    msg("#aktMsg", "err", `Nie udało się zapisać. ${error.message || ""}`);
    if (button) {
      button.disabled = false;
      button.textContent = "Dodaj wpis";
    }
  }
}

async function addGal() {
  const files = $("#galFile")?.files || [];
  const opis = $("#galOpis")?.value.trim();
  if (!files.length) return msg("#galMsg", "err", "Wybierz przynajmniej jedno zdjęcie.");

  const button = $("#galAdd");
  if (button) {
    button.disabled = true;
    button.textContent = "Wgrywanie...";
  }

  try {
    for (const file of files) {
      const url = await uploadImage(file, "galeria");
      const { error } = await sb.from("galeria").insert({ url, opis });
      if (error) throw error;
    }
    await showManager();
    await loadPublic();
  } catch (error) {
    msg("#galMsg", "err", `Nie udało się wgrać zdjęć. ${error.message || ""}`);
    if (button) {
      button.disabled = false;
      button.textContent = "Dodaj zdjęcia";
    }
  }
}

function stripScripts(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, "");
}

async function applyTresc() {
  if (!sb) return;
  try {
    const { data } = await sb.from("tresc").select("*");
    (data || []).forEach((row) => {
      const el = document.querySelector(`[data-edit="${CSS.escape(row.klucz)}"]`);
      if (el && row.wartosc != null) el.innerHTML = stripScripts(row.wartosc);
    });
  } catch (error) {
    console.warn("[Treść]", error);
  }
}

let editOrig = null;

function bindEditBar() {
  $("#editCancel")?.addEventListener("click", cancelEdit);
  $("#editSave")?.addEventListener("click", saveEdit);
}

function enableEdit() {
  editOrig = {};
  $$("[data-edit]").forEach((el) => {
    editOrig[el.getAttribute("data-edit")] = el.innerHTML;
    el.setAttribute("contenteditable", "true");
    el.classList.add("editable-on");
  });
  $("#editBar")?.classList.add("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function disableEdit() {
  $$("[data-edit]").forEach((el) => {
    el.removeAttribute("contenteditable");
    el.classList.remove("editable-on");
  });
  $("#editBar")?.classList.remove("show");
  editOrig = null;
}

function cancelEdit() {
  if (editOrig) {
    Object.keys(editOrig).forEach((key) => {
      const el = document.querySelector(`[data-edit="${CSS.escape(key)}"]`);
      if (el) el.innerHTML = editOrig[key];
    });
  }
  disableEdit();
}

async function saveEdit() {
  if (!editOrig || !sb) return disableEdit();
  const changes = [];
  $$("[data-edit]").forEach((el) => {
    const key = el.getAttribute("data-edit");
    const value = el.innerHTML.trim();
    if (editOrig[key] !== undefined && value !== editOrig[key].trim()) {
      changes.push({ klucz: key, wartosc: value });
    }
  });
  if (!changes.length) return disableEdit();
  const { error } = await sb.from("tresc").upsert(changes);
  if (error) {
    alert("Nie udało się zapisać zmian. Spróbuj ponownie.");
    return;
  }
  disableEdit();
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  markActiveNav();
  bindPanel();
  bindEditBar();
  renderInitialFallbacks();
  connectSupabase();
});
