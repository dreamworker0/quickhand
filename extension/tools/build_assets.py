"""Builds the extension's image assets from the mascot sources.

- Toolbar icons (16/32/48/128 px) from mascot/icon.svg, rendered by headless Chrome
  at 512 px and scaled down, since Chrome extensions cannot use SVG icons.
- Card and page mascots from mascot/*.png, trimmed and shrunk to 192 px.

Usage: python extension/tools/build_assets.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MASCOT = ROOT / "mascot"
OUT = ROOT / "extension" / "assets"
CHROME_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
]
RENDER = 512


def render_svg(svg_path: Path, out_png: Path) -> None:
    browser = next((p for p in CHROME_CANDIDATES if p.exists()), None)
    if browser is None:
        sys.exit("Chrome or Edge is needed to render the SVG icon.")
    svg = svg_path.read_text(encoding="utf-8")
    svg = svg.replace('width="128" height="128"', f'width="{RENDER}" height="{RENDER}"', 1)
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "icon.html"
        page.write_text(
            f"<!doctype html><html><body style='margin:0;background:transparent'>{svg}</body></html>",
            encoding="utf-8",
        )
        subprocess.run(
            [
                str(browser), "--headless=new", "--disable-gpu", "--hide-scrollbars",
                f"--user-data-dir={Path(tmp) / 'profile'}",
                "--default-background-color=00000000",
                f"--window-size={RENDER},{RENDER}",
                f"--screenshot={out_png}",
                page.as_uri(),
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )


def build_icons() -> None:
    icons = OUT / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    big = icons / "icon-512.png"
    render_svg(MASCOT / "icon.svg", big)
    source = Image.open(big).convert("RGBA")
    for size in (16, 32, 48, 128):
        source.resize((size, size), Image.LANCZOS).save(icons / f"icon-{size}.png", optimize=True)
    big.unlink()


def build_mascots() -> None:
    target = OUT / "mascot"
    target.mkdir(parents=True, exist_ok=True)
    for name in ("main", "hint", "cheer"):
        img = Image.open(MASCOT / f"{name}.png").convert("RGBA")
        img = img.crop(img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())
        img.thumbnail((192, 192), Image.LANCZOS)
        canvas = Image.new("RGBA", (192, 192), (0, 0, 0, 0))
        canvas.paste(img, ((192 - img.width) // 2, (192 - img.height) // 2), img)
        canvas.save(target / f"{name}.png", optimize=True)


if __name__ == "__main__":
    build_icons()
    build_mascots()
    print("assets written to", OUT)
