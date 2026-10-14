#!/usr/bin/env python3
"""Validate the offline academy data before publishing (also used by tests/).

Checks: catalog size ≥ 2000, bilingual titles, unique icon descriptors, every course file present,
every course has ≥ 2 stages with the first stage free, every step has objective/instruction/check,
release.json counts match, and no secrets or databases sit inside the public web root.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "academy"


def check(public=PUBLIC):
    problems = []
    data = public / "data"
    catalog = json.loads((data / "catalog.json").read_text(encoding="utf-8"))
    departments = json.loads((data / "departments.json").read_text(encoding="utf-8"))
    release = json.loads((data / "release.json").read_text(encoding="utf-8"))
    if len(catalog) < 2000:
        problems.append(f"catalog has only {len(catalog)} topics (< 2000)")
    ids = Counter(c["id"] for c in catalog)
    dupes = [k for k, v in ids.items() if v > 1]
    if dupes:
        problems.append(f"duplicate course ids: {dupes[:5]}")
    icons = Counter(json.dumps(c["icon"], sort_keys=True) for c in catalog)
    repeated = sum(1 for v in icons.values() if v > 1)
    if repeated:
        problems.append(f"{repeated} icon descriptors are shared by more than one topic")
    for c in catalog:
        if not c.get("title") or not c.get("titleEn"):
            problems.append(f"{c['id']}: missing bilingual title")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", c["id"]):
            problems.append(f"{c['id']}: invalid id")
        if c.get("freeStage") != 1:
            problems.append(f"{c['id']}: first stage must be the free stage")
    dep_ids = {d["id"] for d in departments["departments"]}
    missing_dep = {c["department"] for c in catalog} - dep_ids
    if missing_dep:
        problems.append(f"departments missing from departments.json: {sorted(missing_dep)[:5]}")
    files = {re.sub(r"\.js$", ".json", c["courseFile"]) for c in catalog}
    steps = 0
    courses_seen = 0
    for file in sorted(files):
        path = data / file
        if not path.is_file():
            problems.append(f"missing course file {file}")
            continue
        courses = json.loads(path.read_text(encoding="utf-8"))
        for course in courses:
            courses_seen += 1
            stages = course.get("stages", [])
            if len(stages) < 2:
                problems.append(f"{course['id']}: fewer than 2 stages")
            if stages and stages[0].get("free") is not True:
                problems.append(f"{course['id']}: first stage not free")
            if any(st.get("free") for st in stages[1:]):
                problems.append(f"{course['id']}: only the first stage may be free")
            for stage in stages:
                for step in stage.get("steps", []):
                    steps += 1
                    for key in ("title", "titleEn", "objective", "instruction", "check"):
                        if not step.get(key):
                            problems.append(f"{step.get('id')}: missing {key}")
                            break
    if courses_seen != len(catalog):
        problems.append(f"catalog lists {len(catalog)} topics but course files contain {courses_seen}")
    if release.get("topics") != len(catalog):
        problems.append("release.json topic count differs from catalog")
    if release.get("allSteps") != steps:
        problems.append(f"release.json allSteps {release.get('allSteps')} differs from counted {steps}")
    for path in public.rglob("*"):
        if path.is_file() and (path.suffix in (".sqlite3", ".pem", ".key", ".db") or path.name.startswith(".env")):
            problems.append(f"private file inside web root: {path.relative_to(public)}")
    for name in ("index.html", "style.css", "bootstrap.js", "app.js", "config.js", "help.html", "terms.html", "assets/icon.svg", "manifest.webmanifest"):
        if not (public / name).is_file():
            problems.append(f"missing {name}")
    return problems, {"topics": len(catalog), "courses": courses_seen, "steps": steps, "departments": len(dep_ids)}


def main():
    problems, stats = check()
    print(json.dumps(stats, ensure_ascii=False))
    if problems:
        print("\n".join("✗ " + p for p in problems[:60]))
        sys.exit(1)
    print("✓ offline academy data is consistent")


if __name__ == "__main__":
    main()
