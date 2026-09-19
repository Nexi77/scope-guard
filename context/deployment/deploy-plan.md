# Pierwsze wdrożenie produkcyjne ScopeGuard

## Podsumowanie

Opublikować istniejący SSR Astro jako Cloudflare Worker `scope-guard` pod domyślnym adresem `workers.dev`, z hostowanym Supabase i natywnym automatycznym deployem Cloudflare po merge do `master`.

## Kluczowe działania

- Zachować obecny runtime Workers (`@astrojs/cloudflare`, `output: "server"`, KV `SESSION`, `nodejs_compat`); nie tworzyć projektu Cloudflare Pages ani nie migrować adaptera.
- Przed publikacją uruchomić `npm run lint`, `npm run build` oraz lokalny preview z testem smoke; naprawić wyłącznie błędy blokujące produkcyjne uruchomienie.
- W Cloudflare ustawić wyłącznie sekrety runtime `SUPABASE_URL` i `SUPABASE_KEY`; nie dodawać ich do `wrangler.jsonc`, repozytorium ani logów.
- W Cloudflare Workers Builds potwierdzić połączenie z `Nexi77/scope-guard`, gałąź produkcyjną `master` oraz komendę budowania zgodną z `npm run build`; wykorzystać ten istniejący natywny mechanizm zamiast dodawać deploy do GitHub Actions.
- Wykonać pierwszy release z Cloudflare, zapisać adres `workers.dev`, sprawdzić status release’u i krótko obserwować logi bez ujawniania sekretów, cookies ani PIN-ów.
- W Supabase dodać adres Workera do Site URL / dozwolonych redirect URLs, utworzyć pierwsze konto wykonawcy, zweryfikować logowanie, a następnie wyłączyć publiczne email sign-ups. Klienci nie otrzymują kont.
- Sprawdzić na produkcji: strona główna, przekierowanie anonimowego `/dashboard`, logowanie, dostęp do dashboardu po zalogowaniu i wylogowanie.
- Zachować procedurę awaryjną: przed rollbackiem sprawdzić `wrangler deployments list`; rollback Workera nie cofa danych ani przyszłych migracji Supabase.

## Interfejsy i konfiguracja

- Brak zmian publicznego API ani modelu danych.
- Sekrety Workera: `SUPABASE_URL`, `SUPABASE_KEY`.
- Produkcyjny adres: tymczasowo `https://scope-guard.kolasakonrad1.workers.dev`; własna domena jest osobnym krokiem.

## Test plan

- Lokalnie: lint, build, preview i `npm run smoke` z działającym Supabase.
- Produkcja: ręczny test sesji wykonawcy oraz kontrola release’u i logów.
- Po kolejnym merge do `master`: potwierdzić, że Workers Builds automatycznie tworzy nowy release.

## Założenia

- Hostowany projekt Supabase już istnieje i jego region jest właściwy dla pierwszych klientów.
- Istniejąca integracja Cloudflare–GitHub ma uprawnienia do odczytu repozytorium i publikacji Workera.
- `context/foundation/infrastructure.md` jest obecnie nieśledzonym plikiem; nie będzie modyfikowany ani dodawany do commita w ramach samego wdrożenia.
