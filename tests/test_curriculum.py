"""Curriculum data integrity: ≥ 2000 topics, unique icons, free first section, bilingual steps, TCM library counts."""
import json
import re

from conftest import PUBLIC, ROOT

from portable.knowledge import CurriculumIndex, terms
from tools import check_offline


def test_offline_data_is_consistent():
    problems, stats = check_offline.check(PUBLIC)
    assert problems == [], problems[:10]
    assert stats["topics"] >= 2000 and stats["departments"] >= 60 and stats["steps"] >= 15000


def test_release_counts_and_scopes():
    release = json.loads((PUBLIC / "data" / "release.json").read_text(encoding="utf-8"))
    assert release["topics"] == release["uniqueIcons"] >= 2000
    assert release["classicalAcupoints"] == 361 and release["acupoints"] >= 390
    assert release["herbs"] >= 250 and release["formulas"] >= 170
    assert release["nobelMedicine"] >= 117 and release["nobelChemistry"] >= 30 and release["researchTechniques"] >= 50
    assert release["authoredCoreCourses"] >= 14 and release["freeStages"] == release["topics"]


def test_every_faculty_and_flagship_present():
    catalog = json.loads((PUBLIC / "data" / "catalog.json").read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in catalog}
    for flagship in ("neurosurgery-dbs", "cardiac-surgery-cabg", "cardiology-pci", "joint-reconstruction-tka", "joint-reconstruction-tha", "general-surgery-lap-chole", "emergency-cpr-bls", "acupuncture-technique-deqi", "tcm-diagnosis-pulse-27", "acu-li4", "acu-st36"):
        assert flagship in by_id, flagship
    faculties = {c["faculty"] for c in catalog}
    assert faculties == {"western", "tcm", "biomed", "ai", "nobel"}
    tiers = {c["id"] for c in catalog if "intern" in c["tiers"]}
    assert len(tiers) >= 500
    assert all(re.fullmatch(r"[a-z0-9-]+", c["id"]) for c in catalog)


def test_course_steps_are_bilingual_and_quizzed():
    courses = json.loads((PUBLIC / "data" / "courses" / "neurosurgery.json").read_text(encoding="utf-8"))
    dbs = next(c for c in courses if c["id"] == "neurosurgery-dbs")
    assert dbs["stages"][0]["free"] is True and all(s["free"] is False for s in dbs["stages"][1:])
    steps = [s for st in dbs["stages"] for s in st["steps"]]
    assert len(steps) >= 15
    for step in steps:
        for key in ("title", "titleEn", "objective", "objectiveEn", "instruction", "instructionEn", "check", "checkEn"):
            assert step.get(key), (step["id"], key)
    quizzes = [s["quiz"] for s in steps if s.get("quiz")]
    assert quizzes and all(len(q["options"]) >= 3 and 0 <= q["answer"] < len(q["options"]) for q in quizzes)
    assert "STN" in json.dumps(dbs, ensure_ascii=False)


def test_tcm_library_counts():
    lib = json.loads((PUBLIC / "data" / "tcm-library.json").read_text(encoding="utf-8"))
    assert len(lib["points"]) >= 390 and sum(1 for p in lib["points"] if not p["code"].startswith("EX")) == 361
    assert len(lib["herbs"]) >= 250 and len(lib["formulas"]) >= 170
    codes = [p["code"] for p in lib["points"]]
    assert len(codes) == len(set(codes))
    assert {"LU1", "LI4", "ST36", "SP6", "HT7", "BL67", "KI1", "PC6", "GB34", "LR3", "GV20", "CV12"} <= set(codes)


def test_curriculum_retrieval_is_bilingual():
    index = CurriculumIndex(PUBLIC)
    hits = index.search("合谷 LI4 定位", "zh-TW")
    assert hits and hits[0]["source"] == "curriculum:acu-li4"
    hits = index.search("total knee arthroplasty alignment", "en")
    assert hits and "tka" in hits[0]["source"]
    assert terms("深部腦刺激 DBS") >= {"深部", "部腦", "腦刺", "dbs"}
