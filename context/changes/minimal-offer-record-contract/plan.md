# Minimalny kontrakt oferty i decyzji — Implementation Plan

## Overview

Dodać pierwszy kontrakt danych ScopeGuard w Supabase: dane należące do pojedynczego wykonawcy, powiązane oferty i zmiany oraz trwałe decyzje klienta. Fundament przygotowuje bezpieczne kontrakty bazy, nie gotowy przepływ użytkownika.

## Current State Analysis

- Supabase jest skonfigurowany, ale `supabase/` nie zawiera migracji ani schematu.
- Klient serwerowy korzysta z sesji cookie w `src/lib/supabase.ts:5-20`, a middleware umieszcza użytkownika w `Astro.locals`.
- `public` jest wystawionym schematem Supabase, więc RLS jest obowiązkowe (`supabase/config.toml:7-18`).
- Obecny smoke test obejmuje wyłącznie Auth (`scripts/smoke.mjs:38-58`).

## Desired End State

Lokalne Supabase może zastosować jedną migrację, która tworzy izolowane dane domenowe oraz dwie wąskie funkcje bazy: bezpieczny odczyt oferty po tokenie i atomowe zapisanie decyzji po PIN-ie. Żaden anonimowy lub obcy wykonawca nie odczyta tabel bez dozwolonego kontraktu.

### Key Discoveries:

- `src/lib/supabase.ts:5-20` tworzy cookie-aware klienta serwerowego; późniejsze trasy mogą polegać na `auth.uid()` i RLS, bez service-role.
- `supabase/config.toml:53-65` włącza migracje, ale repozytorium nie ma jeszcze katalogu migracji.
- `.github/workflows/ci.yml:27-55` uruchamia lokalny Supabase, więc jest właściwym miejscem dla testu kontraktu.

## What We're NOT Doing

- Tras Astro, ekranów dashboardu lub strony współdzielonej.
- Zarządzania lub resetowania PIN-u.
- Kont klientów, CRM, zespołów i service-role access w aplikacji.
- Pełnych snapshotów lub porównywania wersji ofert.

## Implementation Approach

Przechowywać ofertę bazową oraz niezmienne rekordy zmian i decyzji. Aktywny zakres, cena i termin są wyprowadzane z oferty bazowej i zaakceptowanych/uzgodnionych zmian; odrzucona zmiana nigdy nie zmienia stanu aktywnego. Wszystkie tabele wymuszają ownership przez `contractor_id`, RLS oraz relacje kompozytowe. Publiczne zachowania będą dostępne wyłącznie przez ograniczone funkcje `SECURITY DEFINER`, bez polityk umożliwiających anonowi bezpośredni odczyt tabel.

## Critical Implementation Details

Idempotencja wymaga pojedynczej transakcji RPC: musi ona sprawdzić token, hash PIN-u i stan `pending`, zwrócić istniejącą decyzję przy ponowieniu oraz nie dopuścić do sprzecznej drugiej decyzji. Sam unikalny indeks nie wystarcza do utrzymania spójnego statusu oferty i zmiany.

## Phase 1: Model danych i izolacja RLS

### Overview

Utworzyć minimalne tabele, relacje i polityki, które są wspólną granicą danych dla wszystkich późniejszych slice'ów.

### Changes Required:

#### 1. Migracja domenowa

**File**: `supabase/migrations/<timestamp>_minimal_offer_record_contract.sql`

**Intent**: Utworzyć minimalne, trwałe rekordy `customers`, `offers`, `offer_changes` i `change_decisions`, aby S-01–S-07 współdzieliły jeden kontrakt własności i historii.

**Contract**: Wszystkie rekordy należą do `contractor_id` odwołującego się do `auth.users`; relacje dziecka potwierdzają tego samego właściciela. Oferta przechowuje klienta, bazowy zakres, bazową kwotę w minor units, kod ISO waluty, bazowy termin, bieżący status, unikalny `share_token`, czas unieważnienia linku oraz nullable `pin_hash`. Zmiana przechowuje opis, opcjonalną niezerową deltę ceny i/lub terminu oraz status `pending`, `accepted`, `rejected` albo `agreed`; tylko jedna wpływająca zmiana może być `pending`. Decyzja zapisuje wynik, wymagany komentarz odrzucenia i timestamp, a jedna zmiana ma najwyżej jedną decyzję. Włączyć i wymusić RLS, bez anonimowych polityk tabelowych.

### Success Criteria:

#### Automated Verification:

- Lokalny Supabase stosuje migrację od zera bez błędów.
- Ograniczenia odrzucają niespójny ownership, zero-deltę wpływającej zmiany, drugą decyzję i drugą zmianę `pending`.

#### Manual Verification:

- W Studio można potwierdzić obecność czterech tabel, indeksów i włączonego RLS bez przechowywania surowego PIN-u.

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręcznym potwierdzeniu przed kolejną fazą.

---

## Phase 2: Publiczny kontrakt odczytu i decyzji

### Overview

Przygotować jedyne publiczne ścieżki wymagane przez późniejszy link klienta, zachowując pełną izolację tabel.

### Changes Required:

#### 1. Ograniczone funkcje PostgreSQL

**File**: `supabase/migrations/<timestamp>_minimal_offer_record_contract.sql`

**Intent**: Udostępnić bezpieczny odczyt oferty po tokenie i atomową decyzję po PIN-ie bez dodawania UI lub tras HTTP.

**Contract**: RPC odczytu przyjmuje wyłącznie token oferty i zwraca bezpieczną projekcję jednej nieunieważnionej oferty wraz z aktywnym zakresem oraz historią zmian; nie zwraca `pin_hash`, danych innych ofert ani danych wykonawcy. RPC decyzji przyjmuje token, sześciocyfrowy PIN, identyfikator oczekującej zmiany, wynik i wymagany komentarz odrzucenia. W jednej transakcji weryfikuje token/PIN/status, zapisuje co najwyżej jedną decyzję oraz aktualizuje status zmiany i oferty. Przy ponowieniu zwraca istniejący wynik, a sprzeczna późniejsza próba nie zmienia pierwszej decyzji. Funkcje `SECURITY DEFINER` mają ustalony bezpieczny `search_path` i minimalne granty `EXECUTE`.

### Success Criteria:

#### Automated Verification:

- Anonimowe wywołanie nie może odczytać tabel, ale RPC odczytu zwraca wyłącznie ofertę wskazaną ważnym tokenem.
- Błędny PIN i unieważniony token nie zapisują decyzji.
- Dwa identyczne wywołania decyzji tworzą jeden rekord i zachowują ten sam wynik oraz aktywny zakres po odrzuceniu.

#### Manual Verification:

- Ręczna inspekcja odpowiedzi RPC potwierdza brak hashy PIN-u i danych innego wykonawcy.

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręcznym potwierdzeniu przed kolejną fazą.

---

## Phase 3: Testy kontraktu i CI

### Overview

Dodać powtarzalny dowód zachowania migracji, RLS i RPC przeciwko lokalnemu Supabase.

### Changes Required:

#### 1. Test integracyjny bazy

**Files**: `scripts/offer-contract.mjs`, `package.json`

**Intent**: Dodać niezależny test kontraktu bazy zamiast opierać bezpieczeństwo wyłącznie na ręcznej inspekcji migracji.

**Contract**: Skrypt korzysta z efemerycznych użytkowników testowych i publicznego klucza do testów RLS. Klucz service-role, jeśli potrzebny do przygotowania fixture'ów, istnieje wyłącznie w lokalnym/CI środowisku testowym, nigdy w kodzie aplikacji ani repozytoryjnych plikach środowiskowych.

#### 2. Integracja CI

**File**: `.github/workflows/ci.yml`

**Intent**: Uruchamiać test kontraktu po starcie lokalnego Supabase, obok istniejącego smoke testu Auth.

**Contract**: Job przekazuje wyłącznie efemeryczne zmienne z `supabase status`; migracja jest zastosowana przed testem, a istniejący smoke pozostaje niezależny.

### Success Criteria:

#### Automated Verification:

- Test obejmuje izolację dwóch wykonawców, brak anonowego dostępu tabelowego, ważność/unieważnienie tokenu oraz brak wycieku PIN-u.
- Test obejmuje akceptację, odrzucenie, niezmienność aktywnego stanu po odrzuceniu i idempotentne ponowienie decyzji.
- `npm run lint`, `npx astro check`, `npm run build` oraz job lokalnego Supabase przechodzą.

#### Manual Verification:

- Przegląd diffu potwierdza, że F-01 nie dodaje widoków, tras HTTP ani service-role do aplikacji.

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręcznym potwierdzeniu przed zamknięciem zmiany.

---

## Testing Strategy

### Unit Tests:

- Walidacja ograniczeń migracji i statusów przez test integracyjny lokalnego Supabase.

### Integration Tests:

- RLS dla dwóch wykonawców i anonowego klienta.
- Bezpieczna projekcja tokenu, PIN, unieważnienie linku i idempotencja decyzji.

### Manual Testing Steps:

1. Zastosować migrację na świeżej lokalnej bazie.
2. Sprawdzić w Studio polityki RLS, indeksy i brak surowego PIN-u.
3. Przejrzeć odpowiedzi RPC pod kątem projekcji tylko przypisanej oferty.

## Performance Considerations

Kontrakt operuje na pojedynczej ofercie i jej zmianach. Unikalne indeksy dla tokenu, decyzji zmiany i zmiany `pending` ograniczają skany oraz chronią reguły spójności bez dodatkowego cache.

## Migration Notes

Migracja jest addytywna: środowisko nie ma dotychczasowych danych domenowych. Nie dodawać seedów ani danych demonstracyjnych. W razie rollbacku usuwać wyłącznie obiekty utworzone przez tę migrację, w odwrotnej kolejności zależności.

## References

- `context/foundation/prd.md`
- `context/foundation/roadmap.md`
- `src/lib/supabase.ts:5-20`
- `supabase/config.toml:7-18`
- `.github/workflows/ci.yml:27-55`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Model danych i izolacja RLS

#### Automated

- [x] 1.1 Lokalna migracja stosuje kontrakt danych od zera — cd5bd60
- [x] 1.2 Ograniczenia modelu odrzucają niespójne dane — cd5bd60

#### Manual

- [x] 1.3 Zweryfikowano tabele, indeksy, RLS i brak surowego PIN-u — cd5bd60

### Phase 2: Publiczny kontrakt odczytu i decyzji

#### Automated

- [x] 2.1 RPC odczytu izoluje ofertę i ukrywa dane wrażliwe — 9dec304
- [x] 2.2 RPC decyzji odrzuca zły PIN i unieważniony token — 9dec304
- [x] 2.3 RPC decyzji jest idempotentne i zachowuje aktywny zakres po odrzuceniu — 9dec304

#### Manual

- [x] 2.4 Zweryfikowano minimalne granty i bezpieczną projekcję RPC — 9dec304

### Phase 3: Testy kontraktu i CI

#### Automated

- [ ] 3.1 Test integracyjny obejmuje RLS, token, PIN i historię decyzji
- [ ] 3.2 CI uruchamia test kontraktu z lokalnym Supabase
- [ ] 3.3 Lint, Astro check i build przechodzą

#### Manual

- [ ] 3.4 Zweryfikowano brak UI, tras i service-role w aplikacji
