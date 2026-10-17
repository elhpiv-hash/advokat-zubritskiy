#!/usr/bin/env bash
# ==========================================================================
#  build-images.sh — подготовка фотографий адвоката
#  --------------------------------------------------------------------------
#  assets/img/src/hero.png  → assets/img/hero-640.webp, hero-1000.webp,
#                             hero-1600.webp (с прозрачностью) и hero.png
#  assets/img/src/about.jpg → assets/img/about-640.webp, about-1200.webp
#                             и about.jpg
#
#  Запуск:   bash build-images.sh
#  Нужен Node.js 18+. Библиотека sharp ставится во временную папку при
#  каждом запуске (npm берёт её из кэша) — в проекте нет package.json
#  и node_modules, как и у build.sh.
#
#  Что делает и почему:
#  • Портрет приводится к 4 : 5: прозрачные поля обрезаются, фигура ставится
#    на нижний край холста. Пропорция фиксирована — тогда width/height в
#    разметке всегда верные и место под фото резервируется без сдвигов (CLS).
#  • Фото «Об адвокате» обрезается до 4 : 3 по центру — по той же причине.
#  • WebP с качеством 80 — на треть-половину легче JPEG того же вида;
#    hero.png и about.jpg — запасные варианты для браузеров без WebP.
#  • Метаданные (EXIF с геометкой и моделью телефона, ICC) удаляются:
#    sharp не переносит их без явного запроса. Поворот по EXIF применяется
#    к пикселям до удаления — снимок с телефона не ляжет набок.
#
#  После запуска — раскомментировать разметку фото в index.html
#  (инструкции — в комментариях у первого экрана и у «Об адвокате»).
# ==========================================================================

set -euo pipefail

# Работаем из папки скрипта: пути не зависят от того, откуда его запустили.
cd "$(dirname "$0")"

SRC="assets/img/src"
OUT="assets/img"

if ! command -v npm >/dev/null 2>&1; then
  echo "Ошибка: не найден npm. Установите Node.js 18+ (https://nodejs.org)." >&2
  exit 1
fi

if [ ! -f "$SRC/hero.png" ] && [ ! -f "$SRC/about.jpg" ]; then
  echo "Ошибка: в $SRC нет ни hero.png, ни about.jpg — нечего обрабатывать." >&2
  exit 1
fi

# Временная папка под sharp и сам скрипт; удаляется при любом выходе.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ sharp: установка во временную папку"
# Версия зафиксирована минором (0.34): сборка воспроизводима.
npm install --prefix "$TMP" --no-save --no-audit --no-fund --loglevel=error sharp@0.34 >/dev/null

cat > "$TMP/build-images.cjs" <<'NODE'
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const [src, out] = process.argv.slice(2);
const kb = (file) => (fs.statSync(file).size / 1024).toFixed(1).padStart(8);
const log = (file, w, h) => console.log(`  ${path.basename(file).padEnd(18)} ${String(w).padStart(5)} x ${String(h).padEnd(5)} ${kb(file)} KB`);

async function hero(file) {
  // trim по прозрачности: поля вокруг фигуры не должны уменьшать её на экране
  const trimmed = await sharp(file).rotate().ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  // Самый крупный вариант — 1600 × 2000: если исходник меньше, его придётся
  // растягивать, и на больших экранах портрет будет мягким
  const meta = await sharp(trimmed).metadata();
  if (Math.min(1600 / meta.width, 2000 / meta.height) > 1) {
    console.log(`  ! исходник мал (${meta.width} x ${meta.height} без полей): для резкости нужен от 1600 x 2000`);
  }

  // contain + position bottom: фигура целиком, стоит на нижнем крае холста 4:5
  const fit = (w) => sharp(trimmed).resize(w, Math.round(w * 1.25), {
    fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 }
  });

  for (const w of [640, 1000, 1600]) {
    const dst = path.join(out, `hero-${w}.webp`);
    await fit(w).webp({ quality: 80, alphaQuality: 90, effort: 6 }).toFile(dst);
    log(dst, w, w * 1.25);
  }
  const png = path.join(out, 'hero.png');
  await fit(1000).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(png);
  log(png, 1000, 1250);
}

async function about(file) {
  const fit = (w) => sharp(file).rotate().resize(w, Math.round(w * 0.75), { fit: 'cover', position: 'centre' });

  for (const w of [640, 1200]) {
    const dst = path.join(out, `about-${w}.webp`);
    await fit(w).webp({ quality: 80, effort: 6 }).toFile(dst);
    log(dst, w, w * 0.75);
  }
  const jpg = path.join(out, 'about.jpg');
  // mozjpeg + прогрессивная развёртка: меньше вес, снимок проявляется целиком сразу
  await fit(1200).jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(jpg);
  log(jpg, 1200, 900);
}

(async () => {
  const heroSrc = path.join(src, 'hero.png');
  const aboutSrc = path.join(src, 'about.jpg');
  if (fs.existsSync(heroSrc)) { console.log('→ hero.png'); await hero(heroSrc); }
  else console.log('→ hero.png — нет, пропускаю');
  if (fs.existsSync(aboutSrc)) { console.log('→ about.jpg'); await about(aboutSrc); }
  else console.log('→ about.jpg — нет, пропускаю');
})().catch((err) => { console.error('Ошибка:', err.message); process.exit(1); });
NODE

node "$TMP/build-images.cjs" "$SRC" "$OUT"

echo
echo "Готово. Теперь в index.html удалите заглушки photo-slot и снимите комментарии"
echo "с разметки фото (и с preload портрета в <head>) — подробности в комментариях."
