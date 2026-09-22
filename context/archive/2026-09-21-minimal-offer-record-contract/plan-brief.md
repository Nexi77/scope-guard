# Minimalny kontrakt oferty i decyzji — Plan Brief

> Full plan: `context/changes/minimal-offer-record-contract/plan.md`

## What & Why

F-01 tworzy trwały, bezpieczny fundament Supabase dla klientów, ofert, zmian i decyzji. Kolejne slice'y będą budować na nim UI i trasy bez ponownego projektowania granic własności, współdzielonego linku i idempotentnej decyzji.

## Starting Point

Aplikacja ma cookie-based Supabase Auth i chroniony dashboard, ale nie ma migracji, tabel domenowych ani RLS. Publiczny schemat Supabase jest wystawiony, więc izolacja danych musi być wymuszona w bazie.

## Desired End State

Jedna migracja tworzy izolowane dane domenowe oraz ograniczone RPC do bezpiecznego odczytu po tokenie i atomowego zapisu decyzji po PIN-ie. Anon ani inny wykonawca nie mogą czytać tabel bez dozwolonego kontraktu.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Currency | ISO code per offer plus integer minor units | Pozwala na wielowalutowe oferty bez błędów zaokrągleń. | Plan |
| Change impact | Optional non-zero price and deadline deltas | Jednoznacznie opisuje wpływ i pozwala wyliczać stan aktywny. | Plan |
| PIN scope | Per offer, hash only | Granica odpowiada pojedynczemu linkowi i izolacji oferty. | Plan |
| Pending changes | One impacting pending change per offer | Utrzymuje jednoznaczny status akceptacji. | Plan |
| Rejection | Offer remains accepted; rejected change stays in history | Odrzucona propozycja nie może unieważniać aktywnego zakresu. | Plan |
| History | Active scope plus complete rejected change | Pokazuje stan sprzed propozycji bez pełnego wersjonowania. | Plan |
| Public access | RLS plus limited RPCs | Przygotowuje bezpieczny kontrakt bez UI i tras HTTP. | Plan |

## Scope

**In scope:**

- Migracja z modelami, ograniczeniami, RLS i funkcjami RPC.
- Test kontraktu bazy oraz uruchamianie go w lokalnym jobie Supabase w CI.

**Out of scope:**

- UI, endpointy Astro, tworzenie ofert i klientów oraz zarządzanie PIN-em.
- Konta klientów, service-role access w aplikacji i pełne wersjonowanie ofert.

## Architecture / Approach

Oferta przechowuje wartości bazowe, a zmiany i decyzje są trwałymi rekordami. Aktywny zakres, cena i termin są wyprowadzane z oferty bazowej oraz zaakceptowanych/uzgodnionych zmian. RLS ogranicza dane do `contractor_id`; anon uzyskuje tylko minimalne projekcje przez utwardzone RPC.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Model and RLS | Migracja, relacje, ograniczenia i izolacja wykonawcy | Dostęp między wykonawcami |
| 2. Public RPCs | Odczyt po tokenie i atomowa decyzja | Ujawnienie danych/PIN-u lub niespójna decyzja |
| 3. Contract tests | Testy integracyjne oraz CI | Brak rzeczywistego dowodu izolacji |

**Prerequisites:** lokalne Supabase dostępne dla testów i zmienne CI z `supabase status`.
**Estimated effort:** ~2–3 sesje w trzech fazach.

## Open Risks & Assumptions

- Wartości aktywnej oferty będą wyprowadzane z danych bazowych i zmian, a nie snapshotów pełnej oferty.
- Funkcje `SECURITY DEFINER` wymagają minimalnych grantów i stałego bezpiecznego `search_path`.

## Success Criteria (Summary)

- Migracja stosuje model, ograniczenia oraz RLS na świeżym lokalnym Supabase.
- RPC nie ujawniają danych wrażliwych, weryfikują PIN i zachowują idempotencję decyzji.
- CI uruchamia test kontraktu razem z istniejącą weryfikacją aplikacji.
