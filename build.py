#!/usr/bin/env python3
"""Build a French speaking-practice page from a lesson JSON file.

Usage:
    python3 build.py lesson.json [--out OUTDIR] [--skip-tests]

Steps: validate JSON -> run the answer-checker tests (check_lesson.js, needs Node)
-> insert the lesson into template.html -> write
    OUTDIR/<slug>.html                 (the page itself)
    OUTDIR/<slug>-netlify.zip          (a folder <slug>/index.html, ready for app.netlify.com/drop)
"""
import argparse
import html
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "lesson"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("lesson", help="lesson JSON file")
    ap.add_argument("--out", default=".", help="output folder (default: current folder)")
    ap.add_argument("--skip-tests", action="store_true", help="do NOT run the checker tests (not recommended)")
    args = ap.parse_args()

    lesson_path = Path(args.lesson)
    lesson = json.loads(lesson_path.read_text(encoding="utf-8"))
    for key in ("title", "level", "students", "scene_en", "turns"):
        if key not in lesson:
            print(f"ERROR: lesson JSON is missing '{key}'")
            return 1
    slug = slugify(f"{lesson['title']}-{lesson['level']}")
    lesson.setdefault("id", slug)

    # ---- 1. test the answer checker ----
    if args.skip_tests:
        print("WARNING: tests skipped")
    else:
        node = shutil.which("node")
        if not node:
            print("ERROR: Node.js is needed to test the answer checker (node not found). "
                  "Install Node or re-run with --skip-tests and test by hand.")
            return 1
        proc = subprocess.run([node, str(HERE / "check_lesson.js"), str(lesson_path)],
                              capture_output=True, text=True)
        print(proc.stdout.rstrip())
        if proc.returncode != 0:
            print(proc.stderr.rstrip())
            print("\nBUILD STOPPED: fix the lesson (or the checker) until all tests pass.")
            return 1

    # ---- 2. insert the lesson into the template ----
    template = (HERE / "template.html").read_text(encoding="utf-8")
    if template.count("{{LESSON_JSON}}") != 1 or template.count("{{TITLE}}") != 1:
        print("ERROR: template.html must contain {{LESSON_JSON}} and {{TITLE}} exactly once")
        return 1
    payload = json.dumps(lesson, ensure_ascii=False)
    payload = payload.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    page = template.replace("{{TITLE}}", html.escape(lesson["title"])).replace("{{LESSON_JSON}}", payload)
    if re.search(r"\{\{[A-Z_]+\}\}", page):
        print("ERROR: a placeholder was left in the page")
        return 1

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    page_file = out / f"{slug}.html"
    page_file.write_text(page, encoding="utf-8")

    # ---- 3. ZIP with a folder containing index.html (for Netlify Drop) ----
    zip_file = out / f"{slug}-netlify.zip"
    with zipfile.ZipFile(zip_file, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{slug}/index.html", page)

    print(f"\nPage : {page_file}")
    print(f"ZIP  : {zip_file}  (contains {slug}/index.html)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
