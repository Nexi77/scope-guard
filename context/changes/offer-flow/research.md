---
date: 2026-09-24T14:49:16+02:00
researcher: Codex
git_commit: eaa38f4
branch: master
repository: ScopeGuard
topic: "Czytelność przepływu ofert"
tags: [research, ui, offers]
status: partial
last_updated: 2026-09-24
last_updated_by: Codex
---

# Research: przepływ ofert

## Pytanie

Jak rozdzielić tworzenie, przeglądanie i zmianę ofert oraz uczynić listę klientów/ofert czytelną bez naruszenia reguł produktu?

## Ustalenia i lista charges

| Kategoria                | Dowód                                                                                    | Skutek dla użytkownika                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accidental architecture  | `src/pages/offers/[offerId].astro:199-456`                                               | Podgląd pierwotnej oferty, historia wersji, aktualny zakres, korekta pozycji, zastąpienie oczekującej oferty i formularz zmiany występują jeden pod drugim; odszukanie jednej czynności wymaga długiego przewijania. |
| Accidental architecture  | `src/pages/offers/index.astro:198-315`                                                   | Klient i oferty zajmują osobne kolumny; przed wyborem klienta druga kolumna nie przedstawia ofert, a oferta jest dużą kartą zamiast porównywalnym wierszem.                                                          |
| Accidental architecture  | `src/components/offers/CreateOfferForm.tsx:317-379`                                      | Szablon pozycji jest wybierany w oddzielnej sekcji nad edytorem, co rozłącza wybór szablonu i edytowane nim pola.                                                                                                    |
| Missing shared component | `src/pages/offers/index.astro:149-174`, `src/components/ui/button.tsx:1`                 | Akcje listy mają własne klasy przycisku zamiast istniejącego komponentu, więc stany hover/focus/disabled mogą się rozjechać.                                                                                         |
| Missing semantics        | `src/components/ui/field.tsx:12-34`, `src/components/offers/OfferItemsEditor.tsx:98-200` | Obowiązkowe pola nie mają widocznej gwiazdki ani jednego kontraktu `required`; użytkownik rozpoznaje wymagalność dopiero po błędzie.                                                                                 |

## Kontrakt i ograniczenia

- Źródłem wartości są `:root` i `.dark` w `src/styles/global.css:6-92`, publikowane w `@theme inline` w tym samym pliku. Istnieją `Button`, `Field` i `DropdownMenu` w `src/components/ui/`; projekt powinien je rozszerzyć, bez drugiego zestawu prymitywów.
- W przejrzanej ścieżce `src/pages/offers/[offerId].astro:166-171` korekta pozycji jest dostępna przy statusie `pending` i braku historii zmian. Formularz nowej zmiany jest renderowany dla statusów `accepted` i `agreed` (`src/pages/offers/[offerId].astro:436-456`). Nowe routy muszą weryfikować te warunki po stronie serwera.
- Obecna lista klientów pobiera stronę po `page`, a ofertę wybranego klienta po kursorze `before`/`beforeId` (`src/pages/offers/index.astro:25-95`). Funkcja `list_customer_offers` sortuje po `created_at, id` i nie zwraca liczby wszystkich ofert (`supabase/migrations/20260923000000_browse_client_offers.sql:1-86`). Numerowana paginacja ofert wymaga zmiany kontraktu zapytania.
- `src/middleware.ts:4-21` chroni ścieżki `/offers`, a zapytanie szczegółów filtruje po `contractor_id` (`src/pages/offers/[offerId].astro:80-90`). Każdy nowy route szczegółów ma zachować ten filtr i neutralny stan niedostępności.
- Reguły zakresu, decyzji klienta i PIN-u są opisane w `context/foundation/prd.md` (FR-001–FR-009 i Business Logic). Zmiana UI nie może wprowadzać odrzuconych zmian do aktywnego zakresu ani omijać akceptacji zmiany ceny/terminu.

## Luka dowodowa

Nie wykonano zrzutu zalogowanego widoku: lokalny serwer nie działał pod `localhost:4321` w czasie audytu, a widoki ofert wymagają sesji. Zrzuty desktop i mobile oraz kontrola stanów są bramką przed wdrożeniem, nie dowodem niniejszego audytu.
