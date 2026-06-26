# Wdrożenie strony parafii z panelem (CMS)

Instrukcja krok po kroku: **Supabase → GitHub → Vercel**.
Nie wymaga znajomości programowania — wystarczy klikać po kolei.

---

## Struktura plików

```
aaaaaaaaa/
├── index.html            # przekierowanie na parafia.html
├── parafia.html          # strona główna
├── aktualnosci.html      # lista wpisów
├── wpis.html             # pojedynczy wpis (?slug=... lub ?id=...)
├── ogloszenia.html
├── intencje.html
├── kancelaria.html
├── sakramenty.html
├── galeria.html
├── styl.css              # wygląd strony publicznej (bez zmian)
├── app.js                # logika strony publicznej (+ obsługa publikacja/slug)
│
├── admin.html            # NOWE — panel administracyjny (logowanie)
├── admin.css             # NOWE — wygląd panelu
├── admin.js              # NOWE — logika panelu (CRUD + storage)
│
├── supabase/
│   └── schema.sql        # NOWE — tabele, RLS, storage
│
└── WDROZENIE.md          # ten plik
```

Panel jest dostępny pod adresem **`/admin.html`** (np. `https://twoja-domena.pl/admin.html`).

---

## KROK 1 — Supabase (baza danych + logowanie)

1. Wejdź na <https://supabase.com> → **New project**.
   - Nazwa: np. `parafia-wierna`
   - **Database Password** — zapisz je sobie.
   - Region: **Frankfurt (eu-central-1)**.
2. Po utworzeniu projektu otwórz **SQL Editor** (ikona `</>` z lewej) → **New query**.
3. Skopiuj **całą** zawartość pliku `supabase/schema.sql`, wklej i kliknij **Run**.
   Powinno pojawić się „Success”. Skrypt tworzy tabele, zabezpieczenia (RLS) i bucket na zdjęcia.
4. Utwórz konto dla księdza: **Authentication → Users → Add user → Create new user**.
   - Wpisz e-mail i hasło.
   - **Zaznacz „Auto Confirm User”** (żeby nie trzeba było potwierdzać mailem).
5. Nadaj temu kontu rolę administratora. Wróć do **SQL Editor → New query**, wklej i uruchom
   (podmień e-mail na ten z punktu 4):

   ```sql
   insert into public.profiles (id, email, rola)
   select id, email, 'admin' from auth.users
   where email = 'ksiadz@parafia.pl'
   on conflict (id) do update set rola = 'admin';
   ```

6. Pobierz dane połączenia: **Project Settings → API**.
   - `Project URL` — np. `https://xxxx.supabase.co`
   - `anon public` (klucz API).

> Projekt jest już wstępnie skonfigurowany na istniejący Supabase
> (`jddflasgemogftulljsk`). Jeśli zakładasz **nowy** projekt, podmień
> `SUPABASE_URL` i `SUPABASE_ANON_KEY` **w dwóch plikach**: `app.js` oraz `admin.js`
> (na samej górze każdego z nich).

> **Uwaga o kluczu anon:** to klucz publiczny — może być w kodzie.
> Bezpieczeństwo zapewnia RLS (zapis tylko dla zalogowanego admina). Nigdy nie
> wklejaj do kodu klucza `service_role`.

---

## KROK 2 — GitHub (repozytorium z kodem)

1. Załóż konto na <https://github.com> (jeśli nie masz) i kliknij **New repository**.
   - Nazwa: `parafia-wierna`, widoczność **Private** lub **Public** — dowolnie.
   - **Nie** zaznaczaj „Add a README”.
2. Wgraj pliki. Najprościej przez stronę GitHub:
   **Add file → Upload files** → przeciągnij **wszystkie** pliki i folder `supabase/` → **Commit changes**.

   Lub z linii poleceń (w folderze projektu):

   ```bash
   git init
   git add .
   git commit -m "Strona parafii + panel CMS"
   git branch -M main
   git remote add origin https://github.com/TWOJ-LOGIN/parafia-wierna.git
   git push -u origin main
   ```

---

## KROK 3 — Vercel (publikacja w internecie)

1. Wejdź na <https://vercel.com> → **Sign up** → zaloguj się **przez GitHub**.
2. **Add New… → Project** → wybierz repozytorium `parafia-wierna` → **Import**.
3. Ustawienia zostaw domyślne:
   - Framework Preset: **Other**
   - Build Command: *(puste)*
   - Output Directory: *(puste)*
   To jest zwykła strona statyczna — bez budowania.
4. Kliknij **Deploy**. Po chwili dostaniesz adres typu `https://parafia-wierna.vercel.app`.
5. (Opcjonalnie) **Settings → Domains** → dodaj własną domenę (np. `parafiawierna.pl`)
   i ustaw rekordy DNS według instrukcji Vercela.

### Domena
Docelowa domena to **`parafiawiernarzeka.pl`** — jest już wpisana w znacznikach
`canonical` we wszystkich plikach `*.html`. W Vercel: **Settings → Domains → Add**,
wpisz `parafiawiernarzeka.pl` (i `www.parafiawiernarzeka.pl`) oraz ustaw rekordy DNS
u rejestratora domeny zgodnie z instrukcją Vercela. Znaczniki `og:image` używają
ścieżki względnej, więc działają niezależnie od domeny.

---

## KROK 4 — Pierwsze logowanie do panelu

1. Wejdź na `https://twoj-adres/admin.html`.
2. Zaloguj się e-mailem i hasłem utworzonym w Supabase (Krok 1.4).
3. Zobaczysz 5 zakładek:
   - **Aktualności** — wpisy (tytuł, treść, data, zdjęcie, adres/slug, publikacja TAK/NIE),
   - **Ogłoszenia** — ogłoszenia duszpasterskie (od najnowszych),
   - **Intencje** — intencje mszalne (grupowane wg dni),
   - **Galeria** — wgrywanie wielu zdjęć naraz, podpis, podgląd, usuwanie,
   - **Treści strony** — teksty hero, godziny mszy, kontakt, kancelaria itd.

Każda zmiana zapisuje się od razu do bazy i pojawia na stronie publicznej po odświeżeniu.

---

## Najczęstsze pytania

**Nie mogę się zalogować / „brak uprawnień”.**
Upewnij się, że wykonałeś Krok 1.5 (wpis do `profiles` z rolą `admin`) dla właściwego e-maila.

**Zakładka „Treści strony” mówi, że nie może wczytać treści.**
Działa tylko na opublikowanej stronie (Vercel), a nie po otwarciu pliku `admin.html` z dysku.

**Zdjęcia się nie wgrywają.**
Sprawdź, czy w Supabase istnieje bucket **`galeria`** (Storage). Tworzy go `schema.sql`.

**Chcę zmienić projekt Supabase.**
Podmień `SUPABASE_URL` i `SUPABASE_ANON_KEY` w `app.js` **i** `admin.js`, uruchom `schema.sql`
w nowym projekcie i ponów Krok 1.4–1.5.
