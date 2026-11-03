#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the web woff2 files from the project TTF fonts (public/fonts).

Why: the previous woff2 files (541 glyphs) were a narrow subset that lacked
Latin digits (0-9) and several punctuation marks, so the browser fell back
to Tahoma for them and text rendered with two mixed fonts.

Now each woff2 is generated directly from the same TTF that is embedded in
the PDF output (both Vazirmatn v33.003): screen, print and PDF use one font.

Requirements: pip install fonttools brotli

    python3 scripts/build-web-fonts.py

TTF sources (SIL OFL 1.1, commercial use allowed):
  - public/fonts/Vazirmatn-{Regular,Medium,Bold}.ttf  (v33.003)
  - public/fonts/Vazirmatn-ExtraBold.ttf from the official repo
    https://github.com/rastikerdar/vazirmatn (fonts/ttf/Vazirmatn-ExtraBold.ttf)
"""
from pathlib import Path
import sys

from fontTools.ttLib import TTFont

FONTS_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"
WEIGHTS = ["Regular", "Medium", "Bold", "ExtraBold"]


def main() -> int:
    missing = [w for w in WEIGHTS if not (FONTS_DIR / f"Vazirmatn-{w}.ttf").exists()]
    if missing:
        print("TTF not found:", missing, file=sys.stderr)
        return 1
    for weight in WEIGHTS:
        src = FONTS_DIR / f"Vazirmatn-{weight}.ttf"
        dst = FONTS_DIR / f"Vazirmatn-{weight}.woff2"
        font = TTFont(src)
        font.flavor = "woff2"
        font.save(dst)
        print(f"{src.name} -> {dst.name}  ({dst.stat().st_size} bytes, {font['maxp'].numGlyphs} glyphs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
