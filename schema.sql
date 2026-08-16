-- =====================================================================
--  Parafia w Wiernej — schemat bazy danych (Supabase / PostgreSQL)
--  Uruchom CAŁY ten plik w panelu Supabase:  SQL Editor → New query → Run
--  Skrypt jest idempotentny — można go uruchamiać wielokrotnie.
-- =====================================================================

-- Rozszerzenie do generowania UUID (w Supabase zwykle już aktywne)
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILE / UPRAWNIENIA
--    Konto księdza tworzysz w Supabase → Authentication → Users,
--    a następnie nadajesz mu rolę 'admin' (instrukcja w WDROZENIE.md).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text,
  rola      text not null default 'admin',
  utworzono timestamptz not null default now()
);

-- Funkcja pomocnicza: czy zalogowany użytkownik jest adminem.
-- SECURITY DEFINER => omija RLS na tabeli profiles (brak rekurencji w politykach).
create or replace function public.jest_adminem()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and rola = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 2. AKTUALNOŚCI (wpisy / artykuły)
-- ---------------------------------------------------------------------
create table if not exists public.aktualnosci (
  id         uuid primary key default gen_random_uuid(),
  tytul      text not null,
  tresc      text,
  data       date,
  zdjecie    text,                 -- pełny publiczny URL zdjęcia
  zdjecie_sciezka text,            -- ścieżka w storage (do usuwania pliku)
  slug       text unique,
  publikacja boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists aktualnosci_data_idx on public.aktualnosci (data desc);

-- ---------------------------------------------------------------------
-- 3. OGŁOSZENIA
-- ---------------------------------------------------------------------
create table if not exists public.ogloszenia (
  id         uuid primary key default gen_random_uuid(),
  dzien      text,
  miesiac    text,
  tytul      text not null,
  tresc      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. INTENCJE MSZALNE
-- ---------------------------------------------------------------------
create table if not exists public.intencje (
  id         uuid primary key default gen_random_uuid(),
  data_dnia  date,                 -- właściwa data dnia (np. 2026-08-15) — pozwala planować z wyprzedzeniem
  dzien      text,                 -- dzień tygodnia, podpowiadany automatycznie (np. "Niedziela")
  data       text,                 -- data opisowo (np. "15 sierpnia 2026")
  godzina    text,                 -- np. "8:00"
  intencja   text not null,
  kolejnosc  integer not null default 0,
  created_at timestamptz not null default now()
);
-- dla istniejących baz: dołóż brakujące kolumny, jeśli ich nie ma
alter table public.intencje add column if not exists data_dnia date;
alter table public.intencje add column if not exists kolejnosc integer not null default 0;
create index if not exists intencje_data_idx on public.intencje (data_dnia);

-- ---------------------------------------------------------------------
-- 5. GALERIA
-- ---------------------------------------------------------------------
create table if not exists public.galeria (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,        -- pełny publiczny URL
  sciezka    text,                 -- ścieżka w storage (do usuwania pliku)
  opis       text,
  data       date default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. TREŚĆ STRONY (edytowalne elementy data-edit="...")
-- ---------------------------------------------------------------------
create table if not exists public.tresc (
  klucz      text primary key,     -- wartość atrybutu data-edit
  wartosc    text,                 -- HTML/treść elementu
  updated_at timestamptz not null default now()
);

-- =====================================================================
--  ROW LEVEL SECURITY
--  Reguła: każdy może CZYTAĆ treści publiczne,
--          tylko zalogowany admin może dodawać / edytować / usuwać.
-- =====================================================================

-- --- profiles ---------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);

-- --- pomocniczy makro-blok dla tabel treści ---------------------------
-- AKTUALNOŚCI (publiczne widzą tylko opublikowane; admin widzi wszystko)
alter table public.aktualnosci enable row level security;
drop policy if exists aktualnosci_read   on public.aktualnosci;
drop policy if exists aktualnosci_insert on public.aktualnosci;
drop policy if exists aktualnosci_update on public.aktualnosci;
drop policy if exists aktualnosci_delete on public.aktualnosci;
create policy aktualnosci_read   on public.aktualnosci for select
  using (publikacja = true or public.jest_adminem());
create policy aktualnosci_insert on public.aktualnosci for insert
  with check (public.jest_adminem());
create policy aktualnosci_update on public.aktualnosci for update
  using (public.jest_adminem()) with check (public.jest_adminem());
create policy aktualnosci_delete on public.aktualnosci for delete
  using (public.jest_adminem());

-- OGŁOSZENIA
alter table public.ogloszenia enable row level security;
drop policy if exists ogloszenia_read   on public.ogloszenia;
drop policy if exists ogloszenia_insert on public.ogloszenia;
drop policy if exists ogloszenia_update on public.ogloszenia;
drop policy if exists ogloszenia_delete on public.ogloszenia;
create policy ogloszenia_read   on public.ogloszenia for select using (true);
create policy ogloszenia_insert on public.ogloszenia for insert with check (public.jest_adminem());
create policy ogloszenia_update on public.ogloszenia for update using (public.jest_adminem()) with check (public.jest_adminem());
create policy ogloszenia_delete on public.ogloszenia for delete using (public.jest_adminem());

-- INTENCJE
alter table public.intencje enable row level security;
drop policy if exists intencje_read   on public.intencje;
drop policy if exists intencje_insert on public.intencje;
drop policy if exists intencje_update on public.intencje;
drop policy if exists intencje_delete on public.intencje;
create policy intencje_read   on public.intencje for select using (true);
create policy intencje_insert on public.intencje for insert with check (public.jest_adminem());
create policy intencje_update on public.intencje for update using (public.jest_adminem()) with check (public.jest_adminem());
create policy intencje_delete on public.intencje for delete using (public.jest_adminem());

-- GALERIA
alter table public.galeria enable row level security;
drop policy if exists galeria_read   on public.galeria;
drop policy if exists galeria_insert on public.galeria;
drop policy if exists galeria_update on public.galeria;
drop policy if exists galeria_delete on public.galeria;
create policy galeria_read   on public.galeria for select using (true);
create policy galeria_insert on public.galeria for insert with check (public.jest_adminem());
create policy galeria_update on public.galeria for update using (public.jest_adminem()) with check (public.jest_adminem());
create policy galeria_delete on public.galeria for delete using (public.jest_adminem());

-- TREŚĆ
alter table public.tresc enable row level security;
drop policy if exists tresc_read   on public.tresc;
drop policy if exists tresc_insert on public.tresc;
drop policy if exists tresc_update on public.tresc;
drop policy if exists tresc_delete on public.tresc;
create policy tresc_read   on public.tresc for select using (true);
create policy tresc_insert on public.tresc for insert with check (public.jest_adminem());
create policy tresc_update on public.tresc for update using (public.jest_adminem()) with check (public.jest_adminem());
create policy tresc_delete on public.tresc for delete using (public.jest_adminem());

-- =====================================================================
--  STORAGE — bucket na zdjęcia (galeria + zdjęcia aktualności)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('galeria', 'galeria', true)
on conflict (id) do nothing;

-- Polityki dla plików w buckecie 'galeria'
drop policy if exists galeria_obj_read   on storage.objects;
drop policy if exists galeria_obj_insert on storage.objects;
drop policy if exists galeria_obj_update on storage.objects;
drop policy if exists galeria_obj_delete on storage.objects;
create policy galeria_obj_read   on storage.objects for select
  using (bucket_id = 'galeria');
create policy galeria_obj_insert on storage.objects for insert
  with check (bucket_id = 'galeria' and public.jest_adminem());
create policy galeria_obj_update on storage.objects for update
  using (bucket_id = 'galeria' and public.jest_adminem());
create policy galeria_obj_delete on storage.objects for delete
  using (bucket_id = 'galeria' and public.jest_adminem());

-- =====================================================================
--  GOTOWE. Po uruchomieniu nadaj swojemu kontu rolę admina:
--
--  insert into public.profiles (id, email, rola)
--  select id, email, 'admin' from auth.users
--  where email = 'TWOJ-EMAIL@parafia.pl'
--  on conflict (id) do update set rola = 'admin';
-- =====================================================================
