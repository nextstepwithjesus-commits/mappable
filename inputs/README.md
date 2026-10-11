# Входные файлы скриптов документации

**Статус:** справка, 9 октября 2026. Копии внешних данных, по которым скрипты `docs/app/data/NN-числа.py` считают числа документов. Раньше лежали во временной папке облачного сеанса (долг О-3); перенесены, чтобы числа воспроизводились на любом компьютере. Скрипты берут их отсюда по умолчанию.

| Папка | Что | Откуда | Лицензия |
|---|---|---|---|
| `fonts/` | Literata, Golos Text, Noto Serif Hebrew (переменные TTF); для шага 0 (08 § 2.1, направления Б и В) — Piazzolla, Ysabeau Office, Source Serif 4, Onest, скачаны 10 октября 2026 с согласия владельца | google/fonts, ветка `main` | SIL Open Font License 1.1 (тексты лицензий — `fonts/licenses/`) |
| `openbible/` | `ancient.jsonl`, `modern.jsonl` — сводка отождествлений мест | openbibleinfo/Bible-Geocoding-Data, коммит `7eb18a5` | CC BY 4.0 (`openbible/LICENSE.txt`), с указанием авторства OpenBible.info |
| `crosswire/` | модули SWORD `RusSynodal.zip` (Синодальный перевод 1876, OSIS, версия 1.9.1, нумерация Synodal) и `TSK.zip` (Treasury of Scripture Knowledge 1.4, ThML, нумерация английская), скачаны 11 октября 2026 с разрешения владельца (В-29) | crosswire.org, `ftpmirror/pub/sword/packages/rawzip/` | Public Domain (поле `DistributionLicense` в `.conf` модулей) |
| `eusebius/` | разделы Аммония — Евсевия с адресами стихов: `adamb924/data/*-sections-aligned.txt` (коммит `ad27f9c`) и исходная страница `tertullian-canon-tables.htm`; скачаны 11 октября 2026 с разрешения владельца (В-32), только для сверки (П7, вариант А) | github.com/adamb924/eusebian-canons; tertullian.org (Kevin P. Edgecomb) | общественное достояние (заявления в `adamb924/README.md` и в подвале страницы) |
| `oshb/` (вне git) | Open Scriptures Hebrew Bible, `repo/wlc/*.xml` — абзацы פ / ס (`seg x-pe`, `x-samekh`), коммит `3d15126`; скачан 11 октября 2026 (В-32), только для сверки | github.com/openscriptures/morphhb | WLC — общественное достояние; OSHB — CC BY 4.0 (`repo/LICENSE.md`) |
| `theographic/` (вне git) | Theographic Bible Metadata, `repo/CSV/Events.csv`, `People.csv` — пары «событие — лицо», коммит `cfb1c48`; скачан 11 октября 2026 (В-32), только для сверки | github.com/robertrouse/theographic-bible-metadata | CC BY-SA 4.0 (`repo/LICENSE`); построен в том числе на TIPNR (CC BY-NC) |
| `natural-earth/` | суша и реки, масштаб 1 : 10 млн | Natural Earth | общественное достояние |

Это справочные данные для расчётов документации, а не основание фактов Писания. Условия выпуска приложения — вопрос владельца ВП-40.
