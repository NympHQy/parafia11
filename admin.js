/* =====================================================================
   Panel administracyjny — Parafia w Wiernej
   Logowanie Supabase Auth + zarządzanie treścią (CRUD + storage).
   Konfiguracja taka sama jak w app.js — w razie zmiany projektu Supabase
   podmień adres i klucz w obu plikach.
===================================================================== */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ccewjbhlqgszqogzjind.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D-eARL7TPuEEVts4ft3oJQ_xL0lZljV";
const BUCKET = "galeria";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- skróty ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(v) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  } catch { return esc(v); }
}

const DNI_TYG = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
function dataNaDzien(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  const n = DNI_TYG[d.getDay()] || "";
  return n.charAt(0).toUpperCase() + n.slice(1);
}
function dataNaNapis(iso) {
  if (!iso) return "";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

function slugify(text) {
  const map = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
  return String(text || "")
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || `wpis-${Date.now()}`;
}

/* ---------- komunikaty ---------- */
function toast(type, text) {
  const wrap = $("#toastWrap");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2600);
}
const ok = (t = "Zapisano") => toast("ok", t);
const del = (t = "Usunięto") => toast("ok", t);
const err = (t = "Błąd — spróbuj ponownie") => toast("err", t);

function loginMsg(type, text) {
  $("#loginMsg").innerHTML = `<div class="msg ${type}">${esc(text)}</div>`;
}

/* =====================================================================
   LOGOWANIE / KONTROLA DOSTĘPU
===================================================================== */
async function init() {
  bindLogin();
  bindLogout();
  bindTabs();
  bindLightbox();

  const { data } = await sb.auth.getSession();
  if (data.session) {
    await wejdzDoPanelu();
  } else {
    pokazLogowanie();
  }
}

function pokazLogowanie() {
  $("#loginScreen").hidden = false;
  $("#app").hidden = true;
}

async function wejdzDoPanelu() {
  // Weryfikacja roli admina (RLS i tak zablokuje zapisy, ale ukrywamy panel).
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return pokazLogowanie();

  const { data: profil } = await sb
    .from("profiles").select("rola").eq("id", user.id).maybeSingle();

  if (!profil || profil.rola !== "admin") {
    await sb.auth.signOut();
    pokazLogowanie();
    loginMsg("err", "To konto nie ma uprawnień administratora.");
    return;
  }

  $("#loginScreen").hidden = true;
  $("#app").hidden = false;
  await odswiezWszystko();
}

function bindLogin() {
  const dolog = async () => {
    const email = $("#email").value.trim();
    const haslo = $("#haslo").value;
    if (!email || !haslo) return loginMsg("err", "Podaj e-mail i hasło.");
    $("#btnLogin").disabled = true;
    $("#btnLogin").textContent = "Logowanie…";
    const { error } = await sb.auth.signInWithPassword({ email, password: haslo });
    $("#btnLogin").disabled = false;
    $("#btnLogin").textContent = "Zaloguj się";
    if (error) return loginMsg("err", "Nie udało się zalogować. Sprawdź dane.");
    await wejdzDoPanelu();
  };
  $("#btnLogin").addEventListener("click", dolog);
  $("#haslo").addEventListener("keydown", (e) => { if (e.key === "Enter") dolog(); });
}

function bindLogout() {
  $("#btnLogout").addEventListener("click", async () => {
    await sb.auth.signOut();
    location.reload();
  });
}

/* =====================================================================
   ZAKŁADKI
===================================================================== */
function bindTabs() {
  $$("#tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$("#tabs .tab").forEach((t) => t.classList.remove("is-active"));
      $$(".panel").forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      $(`#tab-${tab.dataset.tab}`).classList.add("is-active");
    });
  });
}

async function odswiezWszystko() {
  await Promise.all([
    ladujAktualnosci(),
    ladujOgloszenia(),
    ladujIntencje(),
    ladujGalerie(),
    ladujTresc(),
  ]);
}

/* =====================================================================
   STORAGE — upload / usuwanie plików
===================================================================== */
async function uploadPlik(file, folder) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const sciezka = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(sciezka, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const url = sb.storage.from(BUCKET).getPublicUrl(sciezka).data.publicUrl;
  return { url, sciezka };
}

async function usunPlik(sciezka) {
  if (!sciezka) return;
  try { await sb.storage.from(BUCKET).remove([sciezka]); } catch (e) { /* plik mógł już nie istnieć */ }
}

/* =====================================================================
   AKTUALNOŚCI
===================================================================== */
const aktForm = $("#aktForm");

async function ladujAktualnosci() {
  const { data, error } = await sb.from("aktualnosci").select("*").order("data", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const box = $("#aktList");
  if (error) { box.innerHTML = `<p class="empty">Nie udało się wczytać.</p>`; return; }
  if (!data.length) { box.innerHTML = `<p class="empty">Brak wpisów. Dodaj pierwszy powyżej.</p>`; return; }

  box.innerHTML = data.map((a) => `
    <div class="row">
      ${a.zdjecie ? `<img class="row-thumb" src="${esc(a.zdjecie)}" alt="">` : ""}
      <div class="row-main">
        <div class="meta">${esc(fmtDate(a.data || a.created_at))}</div>
        <div class="title">${esc(a.tytul)}
          <span class="badge ${a.publikacja ? "pub" : "draft"}">${a.publikacja ? "Opublikowany" : "Szkic"}</span>
        </div>
        <div class="sub">${esc((a.tresc || "").slice(0, 110))}${(a.tresc || "").length > 110 ? "…" : ""}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${esc(a.id)}">Edytuj</button>
        <button class="btn btn-danger btn-sm" data-del="${esc(a.id)}">Usuń</button>
      </div>
    </div>`).join("");

  $$("#aktList [data-edit]").forEach((b) => b.addEventListener("click", () => edytujAkt(data.find((x) => x.id === b.dataset.edit))));
  $$("#aktList [data-del]").forEach((b) => b.addEventListener("click", () => usunAkt(b.dataset.del)));
}

function edytujAkt(a) {
  if (!a) return;
  $("#aktId").value = a.id;
  $("#aktTytul").value = a.tytul || "";
  $("#aktTresc").value = a.tresc || "";
  $("#aktData").value = a.data || "";
  $("#aktSlug").value = a.slug || "";
  $("#aktPub").value = a.publikacja ? "true" : "false";
  $("#aktFormTytul").textContent = "Edycja wpisu";
  $("#aktReset").hidden = false;
  $("#aktCurrentImg").innerHTML = a.zdjecie
    ? `<small>Aktualne zdjęcie (wybierz nowe, aby zmienić)</small><img src="${esc(a.zdjecie)}" alt="">`
    : "";
  aktForm.dataset.sciezka = a.zdjecie_sciezka || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetAkt() {
  aktForm.reset();
  $("#aktId").value = "";
  $("#aktFormTytul").textContent = "Nowy wpis";
  $("#aktReset").hidden = true;
  $("#aktCurrentImg").innerHTML = "";
  delete aktForm.dataset.sciezka;
}
$("#aktReset").addEventListener("click", resetAkt);

aktForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#aktId").value;
  const tytul = $("#aktTytul").value.trim();
  if (!tytul) return err("Podaj tytuł wpisu.");

  const btn = aktForm.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = "Zapisywanie…";

  try {
    const rec = {
      tytul,
      tresc: $("#aktTresc").value.trim(),
      data: $("#aktData").value || null,
      slug: $("#aktSlug").value.trim() || slugify(tytul),
      publikacja: $("#aktPub").value === "true",
    };

    const file = $("#aktFile").files[0];
    if (file) {
      const { url, sciezka } = await uploadPlik(file, "aktualnosci");
      rec.zdjecie = url;
      rec.zdjecie_sciezka = sciezka;
      if (aktForm.dataset.sciezka) await usunPlik(aktForm.dataset.sciezka);
    }

    let res;
    if (id) res = await sb.from("aktualnosci").update(rec).eq("id", id);
    else res = await sb.from("aktualnosci").insert(rec);

    if (res.error) {
      // konflikt unikalnego slug — dołóż sufiks i ponów
      if (res.error.code === "23505") {
        rec.slug = `${rec.slug}-${Math.random().toString(36).slice(2, 6)}`;
        res = id ? await sb.from("aktualnosci").update(rec).eq("id", id) : await sb.from("aktualnosci").insert(rec);
      }
      if (res.error) throw res.error;
    }

    ok();
    resetAkt();
    await ladujAktualnosci();
  } catch (e2) {
    console.error(e2); err(`Błąd zapisu. ${e2.message || ""}`);
  } finally {
    btn.disabled = false; btn.textContent = "Zapisz wpis";
  }
});

async function usunAkt(id) {
  if (!confirm("Usunąć ten wpis na stałe?")) return;
  const { data: row } = await sb.from("aktualnosci").select("zdjecie_sciezka").eq("id", id).maybeSingle();
  const { error } = await sb.from("aktualnosci").delete().eq("id", id);
  if (error) return err();
  if (row?.zdjecie_sciezka) await usunPlik(row.zdjecie_sciezka);
  del();
  await ladujAktualnosci();
}

/* =====================================================================
   OGŁOSZENIA
===================================================================== */
const oglForm = $("#oglForm");

async function ladujOgloszenia() {
  const { data, error } = await sb.from("ogloszenia").select("*").order("created_at", { ascending: false });
  const box = $("#oglList");
  if (error) { box.innerHTML = `<p class="empty">Nie udało się wczytać.</p>`; return; }
  if (!data.length) { box.innerHTML = `<p class="empty">Brak ogłoszeń.</p>`; return; }

  box.innerHTML = data.map((o) => `
    <div class="row">
      <div class="row-main">
        <div class="meta">${esc(o.dzien)} ${esc(o.miesiac)}</div>
        <div class="title">${esc(o.tytul)}</div>
        <div class="sub">${esc(o.tresc || "")}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${esc(o.id)}">Edytuj</button>
        <button class="btn btn-danger btn-sm" data-del="${esc(o.id)}">Usuń</button>
      </div>
    </div>`).join("");

  $$("#oglList [data-edit]").forEach((b) => b.addEventListener("click", () => edytujOgl(data.find((x) => x.id === b.dataset.edit))));
  $$("#oglList [data-del]").forEach((b) => b.addEventListener("click", () => usunOgl(b.dataset.del)));
}

function edytujOgl(o) {
  if (!o) return;
  $("#oglId").value = o.id;
  $("#oglDzien").value = o.dzien || "";
  $("#oglMiesiac").value = o.miesiac || "";
  $("#oglTytul").value = o.tytul || "";
  $("#oglTresc").value = o.tresc || "";
  $("#oglFormTytul").textContent = "Edycja ogłoszenia";
  $("#oglReset").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function resetOgl() {
  oglForm.reset(); $("#oglId").value = "";
  $("#oglFormTytul").textContent = "Nowe ogłoszenie";
  $("#oglReset").hidden = true;
}
$("#oglReset").addEventListener("click", resetOgl);

oglForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tytul = $("#oglTytul").value.trim();
  if (!tytul) return err("Podaj tytuł ogłoszenia.");
  const rec = {
    dzien: $("#oglDzien").value.trim(),
    miesiac: $("#oglMiesiac").value.trim(),
    tytul,
    tresc: $("#oglTresc").value.trim(),
  };
  const id = $("#oglId").value;
  const res = id ? await sb.from("ogloszenia").update(rec).eq("id", id) : await sb.from("ogloszenia").insert(rec);
  if (res.error) return err();
  ok(); resetOgl(); await ladujOgloszenia();
});

async function usunOgl(id) {
  if (!confirm("Usunąć to ogłoszenie?")) return;
  const { error } = await sb.from("ogloszenia").delete().eq("id", id);
  if (error) return err();
  del(); await ladujOgloszenia();
}

/* =====================================================================
   INTENCJE
===================================================================== */
const intForm = $("#intForm");

async function ladujIntencje() {
  const { data, error } = await sb.from("intencje").select("*")
    .order("data_dnia", { ascending: true, nullsFirst: false })
    .order("kolejnosc", { ascending: true });
  const box = $("#intList");
  if (error) { box.innerHTML = `<p class="empty">Nie udało się wczytać.</p>`; return; }
  if (!data.length) { box.innerHTML = `<p class="empty">Brak intencji.</p>`; return; }

  // grupowanie po dacie (starsze wpisy bez daty trafiają do grup tekstowych)
  const grupy = new Map();
  data.forEach((it) => {
    const klucz = it.data_dnia || `legacy|${it.dzien || ""}|${it.data || ""}`;
    if (!grupy.has(klucz)) grupy.set(klucz, { data_dnia: it.data_dnia, dzien: it.dzien, data: it.data, rows: [] });
    grupy.get(klucz).rows.push(it);
  });

  box.innerHTML = [...grupy.values()].map((g) => {
    g.rows.sort((a, b) => (a.kolejnosc - b.kolejnosc));
    const naglowek = g.data_dnia
      ? `${esc(dataNaDzien(g.data_dnia))} · ${esc(dataNaNapis(g.data_dnia))}`
      : `${esc(g.dzien || "Bez daty")}${g.data ? ` — ${esc(g.data)}` : ""}`;
    const wiersze = g.rows.map((it) => `
      <div class="row">
        <div class="row-main">
          <div class="meta">${esc(it.godzina || "—")}</div>
          <div class="sub">${esc(it.intencja)}</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${esc(it.id)}">Edytuj</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(it.id)}">Usuń</button>
        </div>
      </div>`).join("");
    return `<div class="list-group-title">${naglowek}</div>${wiersze}`;
  }).join("");

  $$("#intList [data-edit]").forEach((b) => b.addEventListener("click", () => edytujInt(data.find((x) => x.id === b.dataset.edit))));
  $$("#intList [data-del]").forEach((b) => b.addEventListener("click", () => usunInt(b.dataset.del)));
}

function edytujInt(it) {
  if (!it) return;
  $("#intId").value = it.id;
  $("#intData").value = it.data_dnia || "";
  $("#intGodz").value = it.godzina || "";
  $("#intKol").value = it.kolejnosc ?? 0;
  $("#intTresc").value = it.intencja || "";
  $("#intFormTytul").textContent = "Edycja intencji";
  $("#intReset").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function resetInt() {
  intForm.reset(); $("#intId").value = ""; $("#intKol").value = "0";
  $("#intFormTytul").textContent = "Nowa intencja";
  $("#intReset").hidden = true;
}
$("#intReset").addEventListener("click", resetInt);

intForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const intencja = $("#intTresc").value.trim();
  const dataDnia = $("#intData").value;
  if (!dataDnia) return err("Wybierz datę intencji.");
  if (!intencja) return err("Wpisz treść intencji.");
  const rec = {
    data_dnia: dataDnia,
    dzien: dataNaDzien(dataDnia),
    data: dataNaNapis(dataDnia),
    godzina: $("#intGodz").value.trim(),
    intencja,
    kolejnosc: parseInt($("#intKol").value, 10) || 0,
  };
  const id = $("#intId").value;
  const res = id ? await sb.from("intencje").update(rec).eq("id", id) : await sb.from("intencje").insert(rec);
  if (res.error) return err();
  ok(); resetInt(); await ladujIntencje();
});

async function usunInt(id) {
  if (!confirm("Usunąć tę intencję?")) return;
  const { error } = await sb.from("intencje").delete().eq("id", id);
  if (error) return err();
  del(); await ladujIntencje();
}

/* =====================================================================
   GALERIA
===================================================================== */
const galForm = $("#galForm");

async function ladujGalerie() {
  const { data, error } = await sb.from("galeria").select("*").order("created_at", { ascending: false });
  const grid = $("#galGrid");
  if (error) { grid.innerHTML = `<p class="empty">Nie udało się wczytać.</p>`; return; }
  if (!data.length) { grid.innerHTML = `<p class="empty">Brak zdjęć.</p>`; return; }

  grid.innerHTML = data.map((g) => `
    <div class="gal-cell">
      <img src="${esc(g.url)}" alt="${esc(g.opis || "")}" data-full="${esc(g.url)}" data-cap="${esc(g.opis || "")}">
      <div class="cap"><b>${esc(fmtDate(g.data || g.created_at))}</b>${esc(g.opis || "bez podpisu")}</div>
      <button class="btn btn-danger btn-sm" data-del="${esc(g.id)}">Usuń</button>
    </div>`).join("");

  $$("#galGrid img[data-full]").forEach((img) => img.addEventListener("click", () => otworzLightbox(img.dataset.full, img.dataset.cap)));
  $$("#galGrid [data-del]").forEach((b) => b.addEventListener("click", () => usunGal(b.dataset.del, data.find((x) => x.id === b.dataset.del)?.sciezka)));
}

galForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const files = [...$("#galFile").files];
  if (!files.length) return err("Wybierz przynajmniej jedno zdjęcie.");
  const opis = $("#galOpis").value.trim();

  const btn = galForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  const prog = $("#galProgress");
  let licz = 0;

  try {
    for (const file of files) {
      licz++;
      prog.textContent = `Wgrywanie ${licz} z ${files.length}…`;
      const { url, sciezka } = await uploadPlik(file, "galeria");
      const { error } = await sb.from("galeria").insert({ url, sciezka, opis });
      if (error) throw error;
    }
    prog.textContent = "";
    ok(`Dodano zdjęcia: ${files.length}`);
    galForm.reset();
    await ladujGalerie();
  } catch (e2) {
    console.error(e2); prog.textContent = ""; err(`Błąd wgrywania. ${e2.message || ""}`);
  } finally {
    btn.disabled = false;
  }
});

async function usunGal(id, sciezka) {
  if (!confirm("Usunąć to zdjęcie?")) return;
  const { error } = await sb.from("galeria").delete().eq("id", id);
  if (error) return err();
  if (sciezka) await usunPlik(sciezka);
  del(); await ladujGalerie();
}

/* ---------- Lightbox ---------- */
function bindLightbox() {
  const lb = $("#lightbox");
  lb.addEventListener("click", (e) => {
    if (e.target === lb || e.target.classList.contains("lb-close")) lb.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.classList.remove("open"); });
}
function otworzLightbox(url, cap) {
  const lb = $("#lightbox");
  $("img", lb).src = url;
  $(".lb-cap", lb).textContent = cap || "";
  lb.classList.add("open");
}

/* =====================================================================
   TREŚCI STRONY (elementy data-edit z podstron)
   Pobieramy realne podstrony, czytamy z nich domyślne teksty,
   nakładamy zapisane wartości z tabeli "tresc" i pozwalamy edytować.
===================================================================== */
const STRONY = [
  { plik: "parafia.html", nazwa: "Strona główna" },
  { plik: "msze.html", nazwa: "Msze Święte" },
  { plik: "historia.html", nazwa: "Historia parafii" },
  { plik: "duszpasterze.html", nazwa: "Duszpasterze" },
  { plik: "kontakt.html", nazwa: "Kontakt" },
  { plik: "aktualnosci.html", nazwa: "Aktualności (nagłówek)" },
  { plik: "ogloszenia.html", nazwa: "Ogłoszenia (nagłówek)" },
  { plik: "intencje.html", nazwa: "Intencje (nagłówek)" },
  { plik: "kancelaria.html", nazwa: "Kancelaria" },
  { plik: "sakramenty.html", nazwa: "Sakramenty" },
  { plik: "galeria.html", nazwa: "Galeria (nagłówek)" },
];

// Zrozumiałe opisy pól edytowanych na stronie (zamiast kodów typu "hero-1")
const ETYKIETY = {
  // Strona główna
  "hero-1": "Nagłówek — górna etykieta (diecezja i rok)",
  "hero-2": "Nagłówek — opis pod tytułem",
  "hero-3": "Kafelek 1 — liczba (rok erygowania)",
  "hero-4": "Kafelek 1 — podpis",
  "hero-5": "Kafelek 2 — liczba (konsekracja)",
  "hero-6": "Kafelek 2 — podpis",
  "hero-7": "Kafelek 3 — skrót (patron)",
  "hero-8": "Kafelek 3 — podpis",
  "quick-1": "Pasek informacji — godziny w niedziele",
  "quick-2": "Pasek informacji — godziny w dni powszednie",
  "quick-4": "Pasek informacji — telefon",
  "loc-1": "Lokalizacja — adres pod mapą",
  // Msze Święte
  "mszh-eb": "Nagłówek strony — etykieta",
  "mszh-pl": "Nagłówek strony — opis",
  "msze-1": "Sekcja — etykieta",
  "msze-2": "Sekcja — tytuł",
  "msze-3": "Sekcja — opis",
  "msze-4": "Kościół — tytuł karty",
  "msze-5": "Kościół — dzień 1 (niedziele)",
  "msze-6": "Kościół — godziny w niedziele",
  "msze-7": "Kościół — dzień 2 (powszednie)",
  "msze-8": "Kościół — godziny w powszednie",
  "msze-9": "Kościół — dzień 3 (pierwszy piątek)",
  "msze-10": "Kościół — godzina pierwszego piątku",
  "msze-11": "Druga karta — tytuł",
  "msze-12": "Kaplica w Miedziance — nazwa",
  "msze-13": "Kaplica w Miedziance — godzina",
  "msze-14": "Spowiedź — nazwa",
  "msze-15": "Spowiedź — informacja",
  "msze-16": "Chrzty — nazwa",
  "msze-17": "Chrzty — informacja",
  "msze-18": "Odwiedziny chorych — nazwa",
  "msze-19": "Odwiedziny chorych — informacja",
  // Historia
  "histh-eb": "Nagłówek strony — etykieta",
  "histh-pl": "Nagłówek strony — opis",
  "hist-1": "Sekcja — etykieta",
  "hist-2": "Sekcja — tytuł",
  "hist-3": "Sekcja — opis",
  "hist-4": "Wydarzenie 1 — rok",
  "hist-5": "Wydarzenie 1 — tytuł",
  "hist-6": "Wydarzenie 1 — opis",
  "hist-7": "Wydarzenie 2 — rok",
  "hist-8": "Wydarzenie 2 — tytuł",
  "hist-9": "Wydarzenie 2 — opis",
  "hist-10": "Wydarzenie 3 — rok",
  "hist-11": "Wydarzenie 3 — tytuł",
  "hist-12": "Wydarzenie 3 — opis",
  "hist-13": "Wydarzenie 4 — rok",
  "hist-14": "Wydarzenie 4 — tytuł",
  "hist-15": "Wydarzenie 4 — opis",
  // Duszpasterze
  "duszh-eb": "Nagłówek strony — etykieta",
  "duszh-pl": "Nagłówek strony — opis",
  "kler-1": "Sekcja — etykieta",
  "kler-2": "Sekcja — tytuł",
  "kler-3": "Ksiądz 1 — funkcja",
  "kler-4": "Ksiądz 1 — imię i nazwisko",
  "kler-5": "Ksiądz 1 — rok święceń",
  "kler-6": "Ksiądz 1 — w parafii od",
  "kler-7": "Ksiądz 2 — funkcja",
  "kler-8": "Ksiądz 2 — imię i nazwisko",
  "kler-9": "Ksiądz 2 — rok święceń",
  "kler-10": "Ksiądz 2 — w parafii od",
  "kler-11": "Kaplica — etykieta",
  "kler-12": "Kaplica — nazwa miejscowości",
  "kler-13": "Kaplica — opis",
  "kler-14": "Kaplica — dodatkowa informacja",
  "kler-15": "Dom zakonny — etykieta",
  "kler-16": "Dom zakonny — nazwa",
  "kler-17": "Dom zakonny — opis / adres",
  "kler-18": "Dom zakonny — telefon",
  "her-1": "Cytat — tytuł",
  "her-2": "Cytat — treść",
  "her-3": "Cytat — podpis",
  "her-4": "Dom Samotnej Matki — etykieta",
  "her-5": "Dom Samotnej Matki — tytuł",
  "her-6": "Dom Samotnej Matki — opis (część 1)",
  "her-7": "Dom Samotnej Matki — opis (część 2)",
  // Kontakt
  "konth-eb": "Nagłówek strony — etykieta",
  "konth-pl": "Nagłówek strony — opis",
  "kont-1": "Etykieta „Kontakt”",
  "kont-2": "Tytuł (nazwa parafii)",
  "kont-3": "Adres — nazwa pola",
  "kont-4": "Adres — treść",
  "kont-5": "Telefon — nazwa pola",
  "kont-6": "Telefon — numer",
  "kont-7": "E-mail — nazwa pola",
  "kont-8": "E-mail — adres",
  // Aktualności (nagłówek)
  "akth-eb": "Nagłówek strony — etykieta",
  "akth-pl": "Nagłówek strony — opis",
  // Ogłoszenia (nagłówek)
  "oglh-1": "Nagłówek strony — etykieta",
  "oglh-2": "Nagłówek strony — opis",
  "ogl-1": "Sekcja — etykieta",
  "ogl-2": "Sekcja — tytuł",
  "ogl-3": "Sekcja — opis",
  // Intencje (nagłówek)
  "inth-1": "Nagłówek strony — etykieta",
  "inth-2": "Nagłówek strony — opis",
  "int-1": "Sekcja — etykieta",
  "int-2": "Sekcja — tytuł",
  "int-3": "Sekcja — opis",
  "int-4": "Uwaga pod tabelą intencji",
  // Kancelaria
  "kanch-eb": "Nagłówek strony — etykieta",
  "kanch-pl": "Nagłówek strony — opis",
  "kanc-1": "Karta 1 — tytuł",
  "kanc-3": "Karta 1 — opis",
  "kanc-4": "Karta 2 — tytuł",
  "kanc-5": "Karta 2 — opis",
  "kanc-6": "Karta 3 — tytuł",
  "kanc-7": "Karta 3 — opis",
  // Sakramenty
  "sakrh-eb": "Nagłówek strony — etykieta",
  "sakrh-pl": "Nagłówek strony — opis",
  "sakr-1": "Chrzest — tytuł",
  "sakr-2": "Chrzest — opis",
  "sakr-3": "Bierzmowanie — tytuł",
  "sakr-4": "Bierzmowanie — opis",
  "sakr-5": "Małżeństwo — tytuł",
  "sakr-6": "Małżeństwo — opis",
  "sakr-7": "Namaszczenie chorych — tytuł",
  "sakr-8": "Namaszczenie chorych — opis",
  "sakr-9": "Pogrzeb — tytuł",
  "sakr-10": "Pogrzeb — opis",
  // Galeria (nagłówek)
  "galh-eb": "Nagłówek strony — etykieta",
  "galh-pl": "Nagłówek strony — opis",
};

function etykieta(klucz, domyslna) {
  if (ETYKIETY[klucz]) return ETYKIETY[klucz];
  const podglad = String(domyslna || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return podglad ? `„${podglad.slice(0, 45)}${podglad.length > 45 ? "…" : ""}”` : klucz;
}

let trescDomyslne = {};   // klucz -> { domyslna, nazwaStrony }

async function ladujTresc() {
  const lista = $("#trescList");
  try {
    // 1. zbierz domyślne teksty ze wszystkich podstron
    trescDomyslne = {};
    const grupy = [];
    for (const s of STRONY) {
      try {
        const html = await (await fetch(s.plik, { cache: "no-store" })).text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const pola = [];
        doc.querySelectorAll("[data-edit]").forEach((el) => {
          const klucz = el.getAttribute("data-edit");
          if (trescDomyslne[klucz]) return; // unikaj duplikatów (nawigacja itp.)
          const domyslna = el.innerHTML.trim();
          trescDomyslne[klucz] = { domyslna, nazwaStrony: s.nazwa };
          pola.push({ klucz, domyslna });
        });
        if (pola.length) grupy.push({ nazwa: s.nazwa, pola });
      } catch { /* pomiń niedostępną stronę */ }
    }

    // 2. pobierz zapisane wartości
    const { data } = await sb.from("tresc").select("*");
    const zapisane = {};
    (data || []).forEach((r) => { zapisane[r.klucz] = r.wartosc; });

    // 3. zbuduj formularz
    if (!grupy.length) {
      lista.innerHTML = `<p class="empty">Nie udało się wczytać treści podstron. Uruchom panel na serwerze (Vercel), nie z pliku lokalnego.</p>`;
      return;
    }
    lista.innerHTML = grupy.map((g) => `
      <div class="tresc-page">
        <div class="tresc-page-title">${esc(g.nazwa)}</div>
        ${g.pola.map((p) => {
          const wart = zapisane[p.klucz] !== undefined ? zapisane[p.klucz] : p.domyslna;
          return `
          <div class="tresc-item" data-klucz="${esc(p.klucz)}">
            <label>
              <span class="k">${esc(etykieta(p.klucz, p.domyslna))}</span>
              <textarea rows="2" data-domyslna="${esc(p.domyslna)}">${esc(wart)}</textarea>
            </label>
          </div>`;
        }).join("")}
      </div>`).join("");

    // podświetlenie zmienionych
    $$("#trescList textarea").forEach((ta) => {
      const start = ta.value;
      ta.addEventListener("input", () => {
        ta.closest(".tresc-item").classList.toggle("changed", ta.value !== start);
      });
    });
  } catch (e) {
    console.error(e);
    lista.innerHTML = `<p class="empty">Nie udało się wczytać treści.</p>`;
  }
}

// wyszukiwarka
$("#trescSzukaj").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  $$("#trescList .tresc-item").forEach((it) => {
    const label = it.querySelector(".k") ? it.querySelector(".k").textContent : "";
    const txt = (label + " " + it.querySelector("textarea").value).toLowerCase();
    it.style.display = txt.includes(q) ? "" : "none";
  });
});

// zapis wszystkich zmian
$("#trescSave").addEventListener("click", async () => {
  const zmiany = [];
  $$("#trescList .tresc-item").forEach((it) => {
    const klucz = it.dataset.klucz;
    const ta = it.querySelector("textarea");
    const wartosc = ta.value;
    const domyslna = trescDomyslne[klucz]?.domyslna ?? "";
    // zapisz, jeśli różni się od wartości domyślnej (czyli świadoma zmiana)
    if (wartosc.trim() !== domyslna.trim()) {
      zmiany.push({ klucz, wartosc, updated_at: new Date().toISOString() });
    }
  });
  if (!zmiany.length) return toast("info", "Brak zmian do zapisania.");

  const btn = $("#trescSave");
  btn.disabled = true; btn.textContent = "Zapisywanie…";
  const { error } = await sb.from("tresc").upsert(zmiany, { onConflict: "klucz" });
  btn.disabled = false; btn.textContent = "Zapisz wszystkie zmiany";
  if (error) { console.error(error); return err(); }
  ok(`Zapisano zmiany: ${zmiany.length}`);
  $$("#trescList .tresc-item").forEach((it) => it.classList.remove("changed"));
});

/* ---------- start ---------- */
init();
