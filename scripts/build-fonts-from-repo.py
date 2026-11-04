#!/usr/bin/env python3
"""Build the app fonts from the official Vazirmatn variable font published in
https://github.com/rahmaniho/Qazvintasvir/tree/main/public/assets/fonts

Source files (download once with the GitHub Contents API, raw.githubusercontent is not
reachable from every network, and save them into public/fonts/):

  vazirmatn-arabic-wght-normal.woff2   (Arabic subset of the variable font, wght 100-900)
  vazirmatn-latin-wght-normal.woff2    (Latin subset: ASCII, digits, …, −, general punctuation)
  LICENSE-vazirmatn.txt                (SIL Open Font License 1.1)

What this script produces in public/fonts/:
  - the two variable woff2 files are used AS-IS for the web (see the @font-face
    rules in src/styles/globals.css: one face per subset, font-weight 100 900,
    the Arabic face restricted with unicode-range);
  - Vazirmatn-{Regular,Medium,Bold,ExtraBold}.ttf — static instances (wght
    400/500/700/800) of the variable font with the Latin subset merged in, so a
    single TTF per weight covers Arabic presentation forms AND Latin/digits/
    punctuation. They are written to src/assets/fonts/ and inlined into the JS
    bundle via ?inline (src/core/pdf/font-bundle.ts), so the vector PDF engine
    embeds them without any network fetch (works offline / in the APK / staging).

Requires: pip install fonttools brotli
"""
from __future__ import annotations

import sys
from pathlib import Path

from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

PUBLIC_FONT_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"
TTF_DIR = Path(__file__).resolve().parent.parent / "src" / "assets" / "fonts"
ARABIC_WOFF2 = PUBLIC_FONT_DIR / "vazirmatn-arabic-wght-normal.woff2"
LATIN_WOFF2 = PUBLIC_FONT_DIR / "vazirmatn-latin-wght-normal.woff2"

# app weight -> variable-font wght axis value
WEIGHTS = {
    "Regular": 400,
    "Medium": 500,
    "Bold": 700,
    "ExtraBold": 800,
}


def build_weight(wght: int, out_path: Path, tmp_dir: Path) -> None:
    paths: list[Path] = []
    for tag, src in (("arabic", ARABIC_WOFF2), ("latin", LATIN_WOFF2)):
        font = TTFont(src)
        instantiateVariableFont(font, {"wght": wght}, inplace=True)
        font.flavor = None  # woff2 -> plain ttf
        tmp = tmp_dir / f"{tag}-{wght}.ttf"
        font.save(tmp)
        paths.append(tmp)
    merged = Merger().merge([str(p) for p in paths])
    merged.flavor = None
    merged.save(out_path)
    check = TTFont(out_path)
    cmap = check.getBestCmap()
    pres = sum(1 for cp in cmap if 0xFB50 <= cp <= 0xFEFF)
    missing = [hex(c) for c in (0x0641, 0xFEE4, 0xFEFB, 0x06F0, 0x066A, 0x0041, 0x0030, 0x2026, 0x2212) if c not in cmap]
    print(
        f"  {out_path.name}: glyphs={check['maxp'].numGlyphs} cmap={len(cmap)} "
        f"presentationForms={pres} missing={missing or 'none'} bytes={out_path.stat().st_size}"
    )
    if missing:
        raise SystemExit(f"coverage check failed for {out_path.name}: {missing}")


def main() -> None:
    for src in (ARABIC_WOFF2, LATIN_WOFF2):
        if not src.exists():
            raise SystemExit(
                f"missing {src.name} — download it from "
                "https://github.com/rahmaniho/Qazvintasvir/tree/main/public/assets/fonts "
                "(GitHub Contents API) into public/fonts/ first"
            )
    tmp_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else TTF_DIR / ".fontbuild-tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for name, wght in WEIGHTS.items():
        TTF_DIR.mkdir(parents=True, exist_ok=True)
        build_weight(wght, TTF_DIR / f"Vazirmatn-{name}.ttf", tmp_dir)
    print("done.")


if __name__ == "__main__":
    main()
