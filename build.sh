#!/usr/bin/env bash
# ==========================================================================
#  build.sh — минификация исходников
#  --------------------------------------------------------------------------
#  css/style.css → css/style.min.css   (clean-css-cli 5)
#  js/main.js    → js/main.min.js      (terser 5)
#
#  Запуск:   bash build.sh
#  Нужен Node.js 18+ — npx сам скачает инструменты при первом запуске.
#  После сборки увеличьте ?v= у style.min.css и main.min.js в index.html,
#  иначе браузеры с кэшем увидят старую версию (кэш статики — год).
# ==========================================================================

set -euo pipefail

# Работаем из папки скрипта: пути не зависят от того, откуда его запустили.
cd "$(dirname "$0")"

CSS_SRC="css/style.css"
CSS_MIN="css/style.min.css"
JS_SRC="js/main.js"
JS_MIN="js/main.min.js"

if ! command -v npx >/dev/null 2>&1; then
  echo "Ошибка: не найден npx. Установите Node.js 18+ (https://nodejs.org)." >&2
  exit 1
fi

for file in "$CSS_SRC" "$JS_SRC"; do
  [ -f "$file" ] || { echo "Ошибка: нет файла $file" >&2; exit 1; }
done

# Версии зафиксированы мажором (@5): сборка воспроизводима и не сломается
# от несовместимого релиза. --yes — не спрашивать подтверждение установки.

echo "→ CSS: clean-css"
# -O1 — безопасный уровень: только локальные сокращения внутри правил.
# -O2 умеет переставлять и сливать правила, а это может изменить каскад.
npx --yes --package=clean-css-cli@5 cleancss -O1 -o "$CSS_MIN" "$CSS_SRC"

echo "→ JS: terser"
# passes=2 — второй проход сжатия находит то, что открылось после первого.
# --comments false — комментарии нужны в исходнике, а не в браузере.
npx --yes --package=terser@5 terser "$JS_SRC" \
  --compress passes=2 \
  --mangle \
  --comments false \
  --output "$JS_MIN"

# ----- Таблица размеров -----
# gzip — ориентир того, сколько реально уйдёт по сети при сжатии на сервере.

bytes() { wc -c < "$1" | tr -d ' '; }
gz()    { gzip -9 -c "$1" | wc -c | tr -d ' '; }
kb()    { awk -v b="$1" 'BEGIN { printf "%.1f", b / 1024 }'; }
saved() { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.0f %%", (1 - b / a) * 100 }'; }

# printf выравнивает по байтам, а кириллическая буква в UTF-8 — два байта.
# Поэтому в строках таблицы только ASCII (единицы вынесены в заголовок),
# а сам заголовок выровнен вручную под ширины колонок printf.
row() {
  local src="$1" min="$2"
  local s m g
  s=$(bytes "$src"); m=$(bytes "$min"); g=$(gz "$min")
  printf '  %-20s %14s %14s %14s %10s\n' "$min" "$(kb "$s")" "$(kb "$m")" "$(kb "$g")" "$(saved "$s" "$m")"
}

echo
echo "  Файл                   исходник, КБ   минифиц., КБ     с gzip, КБ   экономия"
echo "  -------------------- -------------- -------------- -------------- ----------"
row "$CSS_SRC" "$CSS_MIN"
row "$JS_SRC"  "$JS_MIN"
echo
echo "Готово. Не забудьте увеличить ?v= в index.html."
