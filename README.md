# GIP-ЩИТ для AutoCAD 2021–2024

Квартирный щит прямо в чертеже: таблица групп в панели рядом с чертежом, по ней строятся однолинейная схема, монтажная схема и спецификация (альбом ЭОМ по шаблону ГИП).

**Скачать:** раздел [Releases](../../releases) → `GIP_SHCHIT_AutoCAD.zip` (плагин) и `GIP_EOM_Shablon.zip` (шаблон чертежа). Установка — в `УСТАНОВКА.txt` внутри архива ([docs/INSTALL.txt](docs/INSTALL.txt)).

## Как устроено

| Часть | Где | Что делает |
|---|---|---|
| Панель «Группы щита» | `web/` → `dist/panel.html` | Таблица групп: перетаскивание, номера ЛО/ЛАО/ЛС, УЗО-блоки, фазы, Kс под выделенную мощность, проверки |
| Плагин | `plugin/GipShchit` → `GipShchit.dll` | Палитра AutoCAD с WebView2, обмен с чертежом, команда `GIPPANEL` |
| Построение альбома | `lisp/src` → `dist/GIP_SHCHIT.lsp` | Однолинейка, монтажка, спецификация, ведомость; команды `ГИПЩИТ`, `ГИППАНЕЛЬ`, `ГИПОБН`, `ГИПАВТО` |
| Шаблон | `template/GIP_EOM_Shablon.dxf` | Листы альбома и блоки ГИП |

Связь панели с чертежом: таблица (JSON, только ASCII) хранится в словаре чертежа `GIPPANEL`. Панель записывает её во временный файл `TEMPPREFIX\gip_panel_in.json` и вызывает команду `GIPPANELAPPLY`, LISP строит альбом и сохраняет таблицу в чертёж. Если аппараты передвинули на монтажной схеме, LISP меняет порядок строк в `GIPPANEL`, а панель подхватывает это после команды.

## Сборка

- Плагин собирается автоматически (GitHub Actions, `.github/workflows/build.yml`) при каждом push в `main`; архив появляется в Releases.
- LISP: `python3 lisp/build_lsp.py` → `dist/GIP_SHCHIT.lsp` (исходники UTF-8, в результате все строки ASCII `\U+XXXX`).
- Панель: `python3 web/build.py` → `dist/panel.html` (для AutoCAD, без внешних шрифтов) и `dist/gip_gruppy_shchita.html`.

## Проверки

- `node web/test/test_model.js` — модель таблицы.
- `node web/test/ui_test.js`, `ui_test2.js`, `host_test.js` — страница в Chromium (Playwright), в т.ч. обмен с имитацией AutoCAD.
- `node web/test/gen_states.js && python3 lisp/emu/test_panel.py` — построение альбома по таблице на эмуляторе AutoLISP/AutoCAD и обратная связь монтажка → таблица.
