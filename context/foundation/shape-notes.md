---
project: "ScopeGuard"
context_type: greenfield
created: 2026-09-18
updated: 2026-09-18
product_type: web-app
target_scale:
  users: medium
timeline_budget:
  mvp_weeks: 1
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "główna natura problemu"
      decision: "Brak formalnego potwierdzenia ustaleń jest głównym problemem; wpływ zmiany na cenę i termin jest również ważny."
    - topic: "zakres person w MVP"
      decision: "Głównym użytkownikiem jest wykonawca; klient w MVP ma dostęp wyłącznie do przeglądania i akceptacji konkretnej zmiany."
    - topic: "wartość względem obecnego sposobu pracy"
      decision: "Końcowe ustalenia mają być zebrane w jednym miejscu, mimo że komunikacja może pozostać rozproszona."
    - topic: "dostęp wykonawcy"
      decision: "Wykonawca zakłada konto; szczegółowy sposób logowania pozostaje do doprecyzowania."
    - topic: "zakres pierwszego przepływu MVP"
      decision: "Jedna oferta z bazowym zakresem oraz osobne propozycje zmian z wpływem na cenę i termin, akceptowane lub odrzucane przez klienta; bez pełnego wersjonowania i porównywania całej oferty."
    - topic: "kryterium dodatkowe"
      decision: "Generowanie oferty jako PDF jest dodatkowym osiągnięciem, nie wymaganiem MVP."
    - topic: "spójność ofert klienta"
      decision: "Wiele ofert dla tego samego klienta musi być grupowanych przez jego identyfikator."
    - topic: "zakres modyfikacji oferty"
      decision: "Modyfikacja w MVP obejmuje wyłącznie opis oraz wpływ na cenę i termin."
    - topic: "dostęp klienta przez link"
      decision: "Klient może przez stały link przeglądać ofertę; akceptacja albo odrzucenie wymaga 6-cyfrowego PIN-u przypisanego do klienta albo zlecenia."
    - topic: "zarządzanie PIN-em"
      decision: "PIN nadaje wykonawca i może go zresetować."
    - topic: "reguła zmian zakresu"
      decision: "Wykonawca klasyfikuje zmianę jako wpływającą albo niewpływającą na koszt i termin; tylko zmiana wpływająca wymaga akceptacji klienta przed wejściem do zakresu."
    - topic: "historia zmian"
      decision: "Zmiany niewpływające oraz odrzucone propozycje pozostają w historii zlecenia; nie oznacza to pełnego wersjonowania całej oferty."
  frs_drafted: 8
  quality_check_status: accepted
---

## Vision & Problem Statement

Właściciele małych ekip remontowych i jednoosobowych działalności fachowych napotykają problem podczas realizacji remontu lub montażu, gdy klient zgłasza zmiany albo uwagi. Bez formalnego potwierdzenia ustaleń powstaje rozjazd między tym, co klient uznaje za zawarte w początkowo ustalonej cenie, a tym, co wykonawca uznaje za zmianę wpływającą na cenę lub termin z powodu dodatkowej pracy, materiałów albo czasu.

Rozmowy i wiadomości mogą pozostać rozproszone między urządzeniami i komunikatorami, ale końcowy wniosek oraz uzgodnienia powinny być zebrane w jednym miejscu. ScopeGuard ma utrwalać formalne potwierdzenie zmiany i jej wpływu na koszt oraz termin.

## User & Persona

### Primary persona

Właściciel małej ekipy remontowej lub jednoosobowej działalności fachowej. W trakcie realizacji zlecenia otrzymuje od klienta zmianę lub uwagę i potrzebuje ustalić, czy wykracza ona poza pierwotny zakres oraz jaki ma wpływ na cenę i termin.

### Secondary persona

Klient wykonawcy. W MVP przegląda i akceptuje konkretną zmianę; szerszy dostęp oraz możliwość wprowadzania zmian pozostają poza obecnym zakresem.

## Access Control

- Wykonawca zakłada konto i ma dostęp do swoich zleceń. Sposób logowania pozostaje do doprecyzowania.
- Klient nie zakłada konta. Używa stałego, spersonalizowanego linku do oferty, aby ją przeglądać. Akceptacja albo odrzucenie zmiany wymaga 6-cyfrowego PIN-u przypisanego do klienta albo zlecenia; PIN nadaje i może zresetować wykonawca.
- Szerszy dostęp klienta oraz możliwość tworzenia przez niego zmian nie należą do MVP.

## Success Criteria

### Primary

- Wykonawca może utworzyć zlecenie z pierwotnym zakresem, przypisać je do klienta tak, aby oferty tego klienta były grupowane, dodać osobną propozycję zmiany z wpływem na cenę i termin oraz uzyskać od klienta jej akceptację albo odrzucenie przez stały link bez konta, po podaniu PIN-u.
- Wykonawca widzi aktualną ofertę oraz historię zmian i decyzji klienta.

### Secondary

- Wykonawca może wygenerować ofertę jako PDF.

### Guardrails

- Każda zmiana wpływająca na koszt albo termin wymaga nowego przejścia przez akceptację klienta.
- Wykonawca zawsze ma dostęp do aktualnej oferty oraz historii zmian i decyzji klienta.

## Functional Requirements

### Klienci i oferty

- FR-001: Wykonawca może utworzyć klienta oraz ofertę przypisaną do tego klienta. Priority: must-have
  > Socrates: Counter-argument considered: dane klienta można byłoby wpisać tylko w ofercie. Resolution: osobny klient pozostaje wymagany, ponieważ umożliwia grupowanie ofert.
- FR-002: Wykonawca może przeglądać oferty klienta, ich status, koszt i termin realizacji. Priority: must-have
  > Socrates: Counter-argument considered: lista mogłaby pokazywać tylko status. Resolution: koszt i termin pozostają widoczne, ponieważ są potrzebne do szybkiego zarządzania ofertami.

### Zmiany i historia

- FR-003: Wykonawca może dodać do oferty modyfikację, sklasyfikować jej wpływ na koszt i termin oraz podać opis tego wpływu. Priority: must-have
  > Socrates: Counter-argument considered: "modyfikacja" jest zbyt szeroka. Resolution: ograniczono ją do klasyfikacji wpływu na koszt i termin oraz opisu tego wpływu.
- FR-004: Wykonawca może wyświetlić aktualną ofertę oraz historię zmian i decyzji klienta. Priority: must-have
  > Socrates: Counter-argument considered: pełna historia nie jest potrzebna od pierwszej wersji. Resolution: historia zmian i decyzji jest wymagana przez regułę biznesową, ale nie obejmuje pełnego wersjonowania całej oferty.
- FR-005: System pokazuje aktualny status oferty zgodny z decyzją klienta. Priority: must-have
  > Socrates: Counter-argument considered: statusy oferty i zmian mogłyby być rozdzielone. Resolution: oferta ma jeden aktualny status.

### Dostęp klienta

- FR-006: Klient może przez stały link do oferty przeglądać jej aktualny status. Priority: must-have
  > Socrates: Counter-argument considered: stały link może dawać zbyt szeroki dostęp. Resolution: link służy wyłącznie do podglądu wskazanej oferty.
- FR-007: Klient może przez stały link, po podaniu 6-cyfrowego PIN-u, zaakceptować oczekującą zmianę albo ją odrzucić z komentarzem. Priority: must-have
  > Socrates: Counter-argument considered: decyzja bez dodatkowego potwierdzenia tożsamości może być niewystarczająca. Resolution: decyzja wymaga 6-cyfrowego PIN-u przypisanego do klienta albo zlecenia.
- FR-008: Wykonawca może nadać oraz zresetować 6-cyfrowy PIN klienta albo zlecenia. Priority: must-have

## User Stories

### US-01: Klient podejmuje decyzję o ofercie

- **Given** oferta po utworzeniu ma status oczekujący na akceptację
- **When** wykonawca udostępnia klientowi wygenerowany link do oferty, a klient otwiera go, przegląda ofertę i akceptuje ją albo odrzuca z komentarzem
- **Then** system zmienia status oferty na zaakceptowany albo odrzucony i prezentuje wykonawcy wynik decyzji

#### Acceptance Criteria

- Status oferty zmienia się zgodnie z decyzją klienta.
- Akceptacja albo odrzucenie zmiany wymaga podania 6-cyfrowego PIN-u.
- Wykonawca widzi jasno przedstawiony powód odrzucenia oferty przez klienta.
- Klient może przez udostępniony link wyświetlić kartę oferty w dowolnym momencie.

## Open Questions

Brak otwartych pytań na zakończenie sesji planistycznej.

## Business Logic

Każda zmiana względem zaakceptowanego zakresu jest klasyfikowana przez wykonawcę jako wpływająca albo niewpływająca na koszt i termin, a zmiana wpływająca wymaga ponownej akceptacji klienta, zanim stanie się częścią zlecenia.

Wykonawca podaje opis zmiany oraz jej wpływ na koszt i termin. Klient podejmuje decyzję wyłącznie o przedstawionych konsekwencjach, nie klasyfikuje technicznego skutku zmiany.

Zmiana niewpływająca na koszt ani termin wchodzi od razu do zakresu i jest zapisywana jako uzgodniona korekta. Odrzucona zmiana nie staje się częścią aktualnego zakresu, ale pozostaje w historii zlecenia wraz z datą, opisem i decyzją klienta.

## Non-Functional Requirements

- Klient korzystający z udostępnionego mu mechanizmu dostępu może zobaczyć wyłącznie wskazane zlecenie i nie uzyskuje dostępu do innych ofert; wykonawca może unieważnić ten dostęp.
- Podgląd może działać przez link, ale akceptacja i odrzucenie zmiany wymagają podania 6-cyfrowego PIN-u; każda decyzja jest zapisana z datą i godziną.
- Na ekranie oferty jednoznacznie widać aktualny zakres oraz status każdej zmiany: oczekująca, zaakceptowana albo odrzucona.
- Kluczowe przepływy są wygodne na telefonie i działają poprawnie także na desktopie.
- Podstawowe widoki oferty, zmian i historii odpowiadają bez zauważalnego opóźnienia.
- Ponowne wysłanie tej samej decyzji nie tworzy duplikatu ani niespójnego stanu zlecenia.
- Aplikacja obsługuje aktualne wersje Chrome, Safari, Edge i Firefox; kluczowe akcje nie opierają się wyłącznie na kolorze i są dostępne z klawiatury.

## Forward: future scope

- Konto klienta z dostępem wyłącznie do jego ofert może w przyszłości zastąpić dostęp przez stały link; nie należy do MVP.

## Forward: tech-stack

- Produkt może zostać rozszerzony do PWA, jeśli dostęp z telefonu i częściowa praca offline okażą się istotne.
- Frontend i backend mogą być rozwijane w jednym monorepo.

## Forward: scale

- Przy większej skali mogą być potrzebne szablony lub reguły automatycznej klasyfikacji typowych zmian.
- Przy wielu aktywnych ofertach zarządzanie stałymi linkami i ich unieważnianiem może wymagać kont klientów albo centralnego portalu klienta.

## Non-Goals

- Konto klienta i portal klienta — w MVP klient korzysta z mechanizmu udostępnienia oferty.
- Pełne wersjonowanie i porównywanie całych wersji oferty — MVP zachowuje wyłącznie historię zmian i decyzji.
- Faktury, płatności, magazyn, zakupy i CRM — nie służą głównemu przepływowi kontroli zmian zakresu.
- PWA i praca offline — zostają do oceny po sprawdzeniu potrzeb użytkowników mobilnych.
- Wieloosobowe organizacje, zaawansowane role i planowanie ekip — MVP obsługuje pojedynczego wykonawcę.
- Automatyczne generowanie wycen przez AI — wykonawca ręcznie tworzy ofertę i klasyfikuje zmiany.
- Integracje z systemami księgowymi lub ERP — nie są potrzebne do podstawowego przepływu.
- Rozbudowane powiadomienia wielokanałowe — poza zakresem pierwszej wersji.
- Zaawansowana analityka i raportowanie — poza zakresem pierwszej wersji.
