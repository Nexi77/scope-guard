# ScopeGuard — wstępne MVP

## Główny problem

Małe ekipy remontowe i fachowcy często ustalają początkowy zakres prac z klientem, a później pojawiają się dodatkowe prace, zmiany materiałów lub przesunięcia terminu. Ustalenia rozpraszają się między rozmowami, telefonami i wiadomościami, przez co trudno potwierdzić, co było objęte pierwotną ceną, a co wymaga dodatkowego kosztu albo czasu.

ScopeGuard tworzy jedną, czytelną historię zakresu zlecenia i jego zmian. Każda zmiana zawiera wpływ na koszt i termin oraz decyzję klienta.

## Najmniejszy zestaw funkcjonalności wymaganych na MVP

- Logowanie wykonawcy i dostęp tylko do jego zleceń.
- Utworzenie zlecenia z nazwą klienta, opisem pierwotnie uzgodnionego zakresu, początkową ceną i terminem.
- Widok szczegółów zlecenia z chronologiczną historią zakresu i zmian.
- Dodanie propozycji zmiany: opis, różnica w cenie, wpływ na termin oraz status oczekujący na decyzję.
- Udostępnienie klientowi prostego linku do konkretnej zmiany.
- Akceptacja albo odrzucenie zmiany przez klienta oraz zapis daty i decyzji.
- Aktualne podsumowanie zaakceptowanych zmian: końcowy zakres, łączna zmiana ceny i terminu.

## Co NIE wchodzi w zakres MVP

- Faktury, płatności i rozliczenia księgowe.
- Magazyn, materiały, zakupy i zarządzanie dostawcami.
- Rozbudowany CRM, lejki sprzedażowe i zarządzanie relacjami z klientami.
- Harmonogramowanie ekip, kalendarze i zarządzanie zadaniami na budowie.
- Wieloosobowa organizacja, zaawansowane role i uprawnienia pracowników.
- Powiadomienia e-mail, SMS lub push.
- Integracje z zewnętrznymi systemami.
- Eksport PDF, choć może być późniejszym rozszerzeniem.

## Kryteria sukcesu

- Wykonawca potrafi zarejestrować pierwotny zakres prac w nowym zleceniu.
- Wykonawca potrafi dodać zmianę z konkretnym wpływem na koszt i termin.
- Klient może samodzielnie otworzyć otrzymany link i jednoznacznie zaakceptować albo odrzucić zmianę.
- Obie strony widzą status każdej zmiany oraz chronologiczną historię ustaleń dla zlecenia.
- Podsumowanie zlecenia uwzględnia wyłącznie zaakceptowane zmiany, więc jasno pokazuje aktualny koszt i termin.
- Główny przepływ — od utworzenia zlecenia do akceptacji zmiany — jest objęty co najmniej jednym testem z perspektywy użytkownika.
