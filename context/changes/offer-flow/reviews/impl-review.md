<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Offer Flow

- **Plan**: `context/changes/offer-flow/plan.md`
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-09-27
- **Verdict**: PASS
- **Findings**: 0 critical, 0 remaining warnings, 0 observations

## Verdicts

| Dimension | Verdict |
| --- | --- |
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification

- `npm run lint`: PASS.
- `npm run build`: PASS (Wrangler could not write its sandboxed log, but Astro completed with exit code 0).
- `npm run offer-contract`: PASS against local Supabase.
- `npm run smoke`: PASS against the local production preview.
- Manual Progress is complete for phases 1–6. Supplemental desktop and mobile screenshots use the original customer and offer for the list, current state, history, and pending edit routes.

## Findings

### F1 — Historia pomija część zapisanych szczegółów wyceny zmiany

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/pages/offers/[offerId]/history.astro:188`
- **Detail**: Plan wymaga rozwijanych pełnych szczegółów zmiany i wyjaśnienia. Widok pokazuje opis, sumaryczne skutki ceny i terminu, efekty pozycji oraz opcjonalny powód korekty handlowej, lecz pomija zapisane w `estimate_snapshot` konsekwencje, fakty z miejsca prac i rozliczenie kredytów. Warunek dla `estimate_snapshot.explanation` w linii 200 jest nieosiągalny dla nowych zmian, ponieważ producent snapshotu w `src/lib/offer-change-estimator.ts:247` nie zapisuje takiego pola.
- **Fix**: Wyświetlić rzeczywiście zapisywane składniki snapshotu w rozwijanym wpisie historii i usunąć albo poprawnie zmapować martwy warunek `explanation`.
  - Strength: Historia pozwoli odtworzyć uzasadnienie i skutki zapisanej propozycji zgodnie z planem.
  - Tradeoff: Dłuższy widok historii i potrzeba obsługi starszych wersji snapshotu.
  - Confidence: HIGH — porównano pola producenta snapshotu z renderowaniem historii.
  - Blind spot: Nie zweryfikowano wszystkich starszych rekordów snapshotu.
- **Decision**: FIXED (recommended fix; `npm run lint` and `npm run build` pass).

### F2 — Stronicowanie klientów agreguje oferty przed ograniczeniem strony

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20261004000000_numbered_offer_browse_pages.sql:54`
- **Detail**: Materializowany `customer_summaries` grupuje wszystkich pasujących klientów i ich oferty, a `LIMIT/OFFSET` pojawia się dopiero po agregacji w liniach 75–78. Koszt każdej strony rośnie wraz z całą historią kontrahenta, choć plan przewiduje ograniczone zapytania dla widoku listy.
- **Fix**: Najpierw wybrać identyfikatory klientów dla żądanej strony, następnie policzyć `offer_count` i `last_activity` tylko dla tych klientów.
  - Strength: Koszt agregacji odpowiada rozmiarowi strony zamiast całej historii ofert.
  - Tradeoff: Nowa migracja i rozszerzenie testu kontraktowego dla porządku oraz liczników.
  - Confidence: HIGH — `MATERIALIZED` i położenie `LIMIT` wymuszają tę kolejność operacji.
  - Blind spot: Nie zmierzono planu wykonania na produkcyjnej wielkości danych.
- **Decision**: FIXED (page customers before aggregation; local migration, `npm run offer-contract`, and `npm run smoke` pass).

### F3 — Zrzuty po zmianie nie stanowią porównania tego samego rekordu i rozmiaru okna

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/offer-flow/visual-baseline.md:25`
- **Detail**: Punkt 6.5 był oznaczony jako zaliczony, ale zrzuty po zmianie używają innego klienta i oferty. Pierwotna oferta nadal istnieje lokalnie, lecz jej klient jest niedostępny dla bieżącej sesji i odczyt klienta zwraca `42501`. Zrzuty przed zmianą są pełnostronicowe, a po zmianie pokazują viewport; opis został poprawiony, a zrzut desktopowy odświeżono do 1440 × 900. Porównanie tego samego rekordu nadal pozostaje do wykonania.
- **Fix**: Dodać porównanie tych samych danych w identycznych szerokościach i wysokościach okna; jeśli oryginalny rekord jest niedostępny, jawnie skorygować kryterium i jego status zamiast oznaczać pełne porównanie jako zaliczone.
  - Strength: Dowód wizualny będzie odpowiadał kryterium planu i pozwoli oddzielić zmianę UI od zmiany danych.
  - Tradeoff: Może wymagać odtworzenia lokalnego konta i stanu sprzed zmian.
  - Confidence: HIGH — notatka podaje różne identyfikatory, a rozmiary zweryfikowano z plików.
  - Blind spot: Nie sprawdzono, czy dostęp do pierwotnego lokalnego konta da się odzyskać.
- **Decision**: FIXED (signed into the original local test account and captured full-page desktop and mobile screenshots of the same customer and offer at matching 1440 × 900 and 390 × 844 viewport sizes; Progress 6.5 is complete).

## Confirmed contracts

- Wspólny odczyt i trasy szczegółów filtrują ofertę po właścicielu; obce i nieznane identyfikatory mają neutralny wynik.
- Warunek edycji oczekującej oferty bez historii zmian jest egzekwowany w widoku, API i transakcji bazy.
- Aktywne wartości pomijają oczekujące i odrzucone zmiany; akcje w wierszach odpowiadają statusowi oferty.
- `last_activity = max(offers.updated_at)` jest świadomym kontraktem planu; brak przesunięcia daty po oczekującej propozycji nie jest findings.
