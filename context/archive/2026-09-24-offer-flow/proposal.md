# Propozycja przebudowy przepływu ofert

## Zasada nawigacji

Jeden ekran odpowiada na jedno pytanie użytkownika. Podgląd pokazuje bieżący stan; historia pokazuje wcześniejsze decyzje; edycja i propozycja zmiany mają własne strony. Linki do tych miejsc są stabilne, więc po odświeżeniu lub wejściu z zakładki użytkownik wraca do tego samego zadania.

| Route                           | Zadanie                  | Zawartość                                                                                                                                                          |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/offers`                       | Znajdź klienta i ofertę  | Jedna tabela z rozwijanymi grupami klientów i wierszami ofert.                                                                                                     |
| `/offers/new`                   | Utwórz ofertę            | Klient, zakres i termin, pozycje, podsumowanie/zapis w jednym formularzu z czytelnymi sekcjami.                                                                    |
| `/offers/[offerId]`             | Sprawdź stan             | Status, aktualnie obowiązujący zakres, cena, termin, pozycje; osobno widoczna informacja o propozycji czekającej na decyzję.                                       |
| `/offers/[offerId]/history`     | Prześledź decyzje        | Chronologiczna historia wersji bazowych, zmian, decyzji i powodów odrzucenia; szczegóły rozwijane na żądanie.                                                      |
| `/offers/[offerId]/changes/new` | Zaproponuj zmianę        | Formularz zmiany z kalkulacją i potwierdzeniem skutku.                                                                                                             |
| `/offers/[offerId]/edit`        | Popraw oczekującą ofertę | Jeden formularz zastąpienia wersji oczekującej, obejmujący opis, termin i pozycje. Nie eksponować równocześnie osobnej korekty pozycji i zastąpienia całej oferty. |

W szczegółach oferty umieścić pod nagłówkiem prostą nawigację **Aktualny stan / Historia**. „Zaproponuj zmianę” jest osobną akcją prowadzącą do route formularza, a nie zakładką ukrywającą formularz w podglądzie. „Popraw oczekującą ofertę” pojawia się wyłącznie, gdy pozwala na to status i historia zmian. Zmiana z wpływem na cenę lub termin zachowuje wymóg decyzji klienta; zmiana odrzucona jest widoczna w historii i nie zmienia aktywnego zakresu.

Stan `pending` pierwszej oferty pokazywać jako **ofertę czekającą na akceptację**, bez nagłówka sugerującego uzgodniony zakres. Przy `accepted`/`agreed` pokazywać uzgodnioną kwotę i termin. Jeśli istnieje nowa propozycja czekająca na klienta, dodać osobny, krótki komunikat z linkiem do jej szczegółów w historii; jej skutków nie doliczać do liczb aktualnego zakresu. Przy `rejected` pokazać decyzję i powód oraz jasne dalsze działanie dostępne w obecnym kontrakcie produktu.

## Lista klientów i ofert

Tabela na desktopie: **Klient / Liczba ofert / Ostatnia aktywność / Akcje** w wierszu klienta. Rozwinięta grupa dociąga oferty danego klienta i wyświetla **Zakres (krótki tytuł) / Status / Aktualna kwota / Termin / Utworzono / Akcje**. Kliknięcie tytułu otwiera szczegóły; rozwinięcie klienta odbywa się przyciskiem z `aria-expanded`, nie przez kliknięcie całego wiersza. Menu `…` używa istniejącego `DropdownMenu` i zawiera tylko dostępne akcje: „Otwórz”, „Historia”, „Zaproponuj zmianę” dla uzgodnionej oferty, „Popraw” dla oczekującej. Zarządzanie PIN-em umieścić w szczegółach lub osobnej stronie dostępu; nie wyświetlać PIN-u w wierszu tabeli.

Pod tabelą klientów: klasyczna paginacja z bieżącą stroną, poprzednią/następną i liczbą stron. Po rozwinięciu grupy: niezależna paginacja ofert tego klienta. Parametry URL `q`, `page`, `customer`, `offerPage` zachowują wyszukiwanie i otwartą grupę. Wybranie nowego klienta zeruje `offerPage`; zmiana wyszukiwania zeruje `page` i zamyka grupę. Aby pokazać liczbę stron ofert, zapytanie serwerowe musi zwrócić liczbę pasujących rekordów oraz deterministyczną stronę sortowaną po `(created_at, id)`; obecna funkcja kursorowa tego nie robi. Na telefonie ten sam zestaw danych i akcji pokazuje się jako zwarte wiersze/karty, bez poziomego przewijania szerokiej tabeli. Filtrów na razie nie dodawać, ale zostawić miejsce obok wyszukiwania.

## Tworzenie i pozycje pracy

Formularz ma kolejność: **1. Klient → 2. Zakres i termin → 3. Pozycje → 4. Podsumowanie**. Sekcje mogą być na jednej stronie; nie tworzyć wieloetapowego kreatora bez zapisu szkicu, bo nawigacja między krokami grozi utratą wpisanych danych. Podsumowanie z kwotą i przyciskiem zapisu pozostaje łatwo dostępne na dole formularza.

Wybór szablonu przenieść do nagłówka każdej karty pozycji, bezpośrednio nad nazwą i parametrami. Wybranie szablonu wypełnia tylko tę pozycję i pokazuje jej wskazówki w tej samej karcie. Zmiana szablonu przy już wpisanych wartościach wymaga jasnego potwierdzenia nadpisania pól. Przyciskiem „Dodaj pozycję” wstawiać nową kartę na początku listy, z trwałym kluczem UUID niezależnym od indeksu; po wstawieniu ustawić fokus na wyborze szablonu lub nazwie. Nagłówek karty pokazuje nazwę albo „Nowa pozycja” i kwotę pozycji. Wcześniejsze pozycje mogą być zwinięte do krótkiego podsumowania z akcją „Edytuj”, by nowy formularz pozostawał blisko przycisku dodania. Zmiana kolejności w UI nie może przypadkowo zmienić znaczenia zapisanej pozycji ani zgubić jej identyfikatora.

Rozszerzyć `Field` o `required` i renderować widoczną gwiazdkę z tekstem dla czytnika ekranu; przekazywać też `required`/`aria-required` do kontrolki. Oznaczyć klienta, opis zakresu, termin oraz wymagane pola pozycji zgodnie z walidacją w `src/lib/offer-items.ts`. Szablon pozostaje opcjonalny. Błędy pokazują się przy polu i w krótkim komunikacie na początku formularza z fokusem po nieudanym zapisie.

## Zakres wdrożeń i bramki

1. **Szczegóły (ta zmiana `offer-flow`)**: wydzielić historię, formularz zmiany i edycję do routów; zostawić w `/offers/[offerId]` stan bieżący oraz właściwe akcje. Wspólny serwerowy loader z kontrolą właściciela i statusu. Sprawdzić wejście bez sesji, obcy/nieistniejący ID, statusy pending/accepted/agreed/rejected oraz zmianę oczekującą.
2. **Tworzenie**: przenieść szablon do karty pozycji, dodawać nową pozycję u góry, oznaczyć wymagane pola i zachować poprawną walidację. Osobna zmiana `10x-ui` dla `/offers/new`.
3. **Lista**: zbudować grupowaną tabelę i menu na istniejących komponentach, a zapytanie klientów/ofert przystosować do numerowanej paginacji. Osobna zmiana `10x-ui` dla `/offers`.

Każde wdrożenie kończy się widokiem desktop i jednym widokiem mobilnym oraz kontrolą stanów: domyślny, hover, focus, disabled, error, empty, loading. Dla routów i zapytań uruchomić `npm run lint` i `npm run build`; testy API lub auth rozszerzać zgodnie z `AGENTS.md`. Przed kodowaniem pierwszej zmiany trzeba uruchomić aplikację z lokalnymi danymi i zrobić zrzut obecnego zalogowanego widoku; wtedy zrzut po zmianie pokaże rzeczywistą poprawę, a nie tylko zgodność z planem.
