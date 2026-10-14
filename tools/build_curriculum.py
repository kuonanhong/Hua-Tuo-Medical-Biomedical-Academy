#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the Hua Tuo Medical & Biomedical Academy curriculum.

Reads the authored source modules in tools/curriculum/ and writes:
  public/academy/data/catalog.json (+ catalog.js)          light topic index with unique icon descriptors
  public/academy/data/departments.json (+ .js)            faculties → departments
  public/academy/data/courses/<department>.json (+ .js)    guided courses: stages → steps → knowledge/quiz
  public/academy/data/tcm-library.json (+ .js)             acupoints, herbs, formulas for the TCM library
  public/academy/data/release.json                         counts and scope statements

Python 3.10+, standard library only. Deterministic: the same sources always produce the same output.
Templates generate the step scaffolding; the authored focus/location/composition text supplies the
topic-specific content. Every generated course is an educational decomposition, not a clinical protocol.
"""
from __future__ import annotations
import hashlib
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from curriculum import western_surgery, western_medicine, tcm, biomed, nobel, acupoints, herbs, formulas, authored  # noqa: E402

DATA = ROOT / "public" / "academy" / "data"
COURSES = DATA / "courses"
VERSION = "1.0.0"
DATE = "2026-10-14"

FACULTIES = {
    "western": {"zh": "西醫臨床與手術", "en": "Western clinical medicine & surgery", "accent": "#2f6f8f", "icon": "stethoscope"},
    "tcm": {"zh": "中醫藥、針灸與推拿", "en": "Chinese medicine, acupuncture & manual therapy", "accent": "#b5432f", "icon": "yinyang"},
    "biomed": {"zh": "生醫創新與基因", "en": "Biomedical innovation & genomics", "accent": "#7a3f9c", "icon": "dna-helix"},
    "ai": {"zh": "醫學 AI 與 AlphaGo／AlphaFold", "en": "Medical AI & the AlphaGo/AlphaFold lineage", "accent": "#1f6f8b", "icon": "go-board"},
    "nobel": {"zh": "諾貝爾獎與研究技術", "en": "Nobel Prizes & research techniques", "accent": "#b8860b", "icon": "medal"},
}

# Authoritative sources per department (official bodies, guidelines, open references).
DEPT_SOURCES = {
    "neurosurgery": [("AANS · American Association of Neurological Surgeons", "https://www.aans.org/"), ("Michael J. Fox Foundation · DBS", "https://www.michaeljfox.org/")],
    "neurology": [("American Academy of Neurology", "https://www.aan.com/"), ("MDS · Movement Disorder Society", "https://www.movementdisorders.org/")],
    "cardiology": [("American Heart Association", "https://www.heart.org/"), ("European Society of Cardiology guidelines", "https://www.escardio.org/Guidelines")],
    "cardiac-surgery": [("Society of Thoracic Surgeons", "https://www.sts.org/"), ("EACTS", "https://www.eacts.org/")],
    "vascular-surgery": [("Society for Vascular Surgery", "https://vascular.org/")],
    "thoracic-surgery": [("Society of Thoracic Surgeons", "https://www.sts.org/")],
    "orthopedics": [("AO Foundation · AO Surgery Reference", "https://surgeryreference.aofoundation.org/"), ("AAOS · OrthoInfo", "https://orthoinfo.aaos.org/")],
    "joint-reconstruction": [("AAOS · OrthoInfo", "https://orthoinfo.aaos.org/"), ("American Academy of Orthopaedic Surgeons", "https://www.aaos.org/")],
    "spine": [("North American Spine Society", "https://www.spine.org/")],
    "general-surgery": [("American College of Surgeons", "https://www.facs.org/"), ("SAGES", "https://www.sages.org/")],
    "urology": [("American Urological Association guidelines", "https://www.auanet.org/guidelines-and-quality/guidelines"), ("European Association of Urology", "https://uroweb.org/guidelines")],
    "ent": [("AAO-HNS", "https://www.entnet.org/")],
    "ophthalmology": [("American Academy of Ophthalmology · EyeWiki", "https://eyewiki.org/")],
    "plastic-surgery": [("American Society of Plastic Surgeons", "https://www.plasticsurgery.org/"), ("American Burn Association", "https://ameriburn.org/")],
    "obstetrics": [("ACOG", "https://www.acog.org/"), ("WHO · Maternal health", "https://www.who.int/health-topics/maternal-health")],
    "gynecology": [("ACOG", "https://www.acog.org/"), ("ESHRE", "https://www.eshre.eu/")],
    "pediatric-surgery": [("American Pediatric Surgical Association", "https://apsapedsurg.org/")],
    "anesthesiology": [("ASA · American Society of Anesthesiologists", "https://www.asahq.org/"), ("Difficult Airway Society", "https://das.uk.com/")],
    "pain-medicine": [("IASP", "https://www.iasp-pain.org/")],
    "dentistry": [("American Dental Association", "https://www.ada.org/")],
    "emergency": [("AHA · CPR & ECC guidelines", "https://cpr.heart.org/"), ("ACEP", "https://www.acep.org/")],
    "critical-care": [("Society of Critical Care Medicine", "https://www.sccm.org/"), ("Surviving Sepsis Campaign", "https://www.sccm.org/survivingsepsiscampaign")],
    "gastroenterology": [("ASGE", "https://www.asge.org/"), ("AASLD", "https://www.aasld.org/")],
    "pulmonology": [("GOLD · COPD", "https://goldcopd.org/"), ("GINA · Asthma", "https://ginasthma.org/")],
    "nephrology": [("KDIGO guidelines", "https://kdigo.org/guidelines/")],
    "endocrinology": [("American Diabetes Association · Standards of Care", "https://professional.diabetes.org/standards-of-care"), ("Endocrine Society", "https://www.endocrine.org/")],
    "rheumatology": [("ACR · American College of Rheumatology", "https://rheumatology.org/"), ("EULAR", "https://www.eular.org/")],
    "hematology": [("American Society of Hematology", "https://www.hematology.org/")],
    "oncology": [("NCCN guidelines", "https://www.nccn.org/guidelines"), ("ASCO", "https://www.asco.org/")],
    "radiation-oncology": [("ASTRO", "https://www.astro.org/")],
    "infectious-disease": [("IDSA guidelines", "https://www.idsociety.org/practice-guideline/"), ("Taiwan CDC", "https://www.cdc.gov.tw/")],
    "dermatology": [("American Academy of Dermatology", "https://www.aad.org/"), ("DermNet", "https://dermnetnz.org/")],
    "psychiatry": [("American Psychiatric Association", "https://www.psychiatry.org/")],
    "pediatrics": [("American Academy of Pediatrics", "https://www.aap.org/"), ("NRP · Neonatal Resuscitation Program", "https://www.aap.org/en/learning/neonatal-resuscitation-program/")],
    "rehabilitation": [("AAPM&R", "https://www.aapmr.org/")],
    "geriatrics-family": [("American Geriatrics Society", "https://www.americangeriatrics.org/"), ("衛生福利部國民健康署", "https://www.hpa.gov.tw/")],
    "radiology": [("RSNA · Radiopaedia", "https://radiopaedia.org/"), ("Society of Interventional Radiology", "https://www.sirweb.org/")],
    "pathology-lab": [("College of American Pathologists", "https://www.cap.org/")],
    "nursing": [("WHO · Nursing and midwifery", "https://www.who.int/health-topics/nursing"), ("台灣護理學會", "https://www.twna.org.tw/")],
    "pharmacology": [("CPIC pharmacogenomics guidelines", "https://cpicpgx.org/guidelines/"), ("DailyMed · FDA labels", "https://dailymed.nlm.nih.gov/")],
    "public-health": [("WHO", "https://www.who.int/"), ("Cochrane Library", "https://www.cochranelibrary.com/")],
    "medical-genetics": [("ACMG", "https://www.acmg.net/"), ("ClinVar", "https://www.ncbi.nlm.nih.gov/clinvar/")],
    "foundations": [("MedlinePlus (NIH)", "https://medlineplus.gov/"), ("OpenStax Anatomy & Physiology", "https://openstax.org/details/books/anatomy-and-physiology-2e")],
    "tcm-fundamentals": [("衛生福利部中醫藥司", "https://dep.mohw.gov.tw/DOCMAP/mp-108.html"), ("中國哲學書電子化計劃 · 醫藏", "https://ctext.org/zh")],
    "tcm-classics": [("中國哲學書電子化計劃 · 黃帝內經", "https://ctext.org/huangdi-neijing/zh"), ("國家中醫藥研究所", "https://www.nricm.edu.tw/")],
    "tcm-diagnosis": [("WHO International Standard Terminologies on Traditional Chinese Medicine (2022)", "https://www.who.int/publications/i/item/9789240042322")],
    "acupuncture-technique": [("WHO Standard Acupuncture Point Locations in the Western Pacific Region (2008)", "https://iris.who.int/handle/10665/353407"), ("NCCIH · Acupuncture", "https://www.nccih.nih.gov/health/acupuncture-what-you-need-to-know")],
    "moxa-cupping": [("NCCIH · Cupping", "https://www.nccih.nih.gov/health/cupping")],
    "tuina": [("衛生福利部中醫藥司", "https://dep.mohw.gov.tw/DOCMAP/mp-108.html")],
    "thai-massage": [("UNESCO · Nuad Thai, traditional Thai massage (2019)", "https://ich.unesco.org/en/RL/nuad-thai-traditional-thai-massage-01384")],
    "qigong": [("NCCIH · Tai chi and qi gong", "https://www.nccih.nih.gov/health/tai-chi-and-qi-gong-in-depth")],
    "tcm-internal": [("WHO ICD-11 Chapter 26 · Traditional medicine conditions", "https://icd.who.int/browse/latest/en#/http://id.who.int/icd/entity/718687701")],
    "tcm-specialties": [("衛生福利部中醫藥司", "https://dep.mohw.gov.tw/DOCMAP/mp-108.html")],
    "tcm-diet": [("衛生福利部國民健康署", "https://www.hpa.gov.tw/")],
    "tcm-intern-clinic": [("WHO International Standard Terminologies on TCM (2022)", "https://www.who.int/publications/i/item/9789240042322")],
    "acupoints": [("WHO Standard Acupuncture Point Locations (2008)", "https://iris.who.int/handle/10665/353407")],
    "herbs": [("臺灣中藥典", "https://dep.mohw.gov.tw/DOCMAP/cp-874-1113-108.html"), ("NCCIH · Herbs at a Glance", "https://www.nccih.nih.gov/health/herbsataglance")],
    "formulas": [("中國哲學書電子化計劃 · 傷寒論", "https://ctext.org/shang-han-lun/zh")],
    "ai-deepmind": [("AlphaGo · Nature 2016", "https://www.nature.com/articles/nature16961"), ("AlphaFold 2 · Nature 2021", "https://www.nature.com/articles/s41586-021-03819-2"), ("AlphaFold 3 · Nature 2024", "https://www.nature.com/articles/s41586-024-07487-w")],
    "genomics": [("NHGRI", "https://www.genome.gov/"), ("Ensembl", "https://www.ensembl.org/")],
    "gene-cell-therapy": [("FDA · Cellular & Gene Therapy Products", "https://www.fda.gov/vaccines-blood-biologics/cellular-gene-therapy-products"), ("Innovative Genomics Institute · CRISPR", "https://innovativegenomics.org/")],
    "immunotherapy-vaccines": [("WHO · Vaccines and immunization", "https://www.who.int/health-topics/vaccines-and-immunization")],
    "bioengineering": [("FDA · Medical Devices", "https://www.fda.gov/medical-devices"), ("衛福部食藥署 · 醫療器材", "https://www.fda.gov.tw/")],
    "neurotech": [("NIH BRAIN Initiative", "https://braininitiative.nih.gov/")],
    "regenerative": [("ISSCR", "https://www.isscr.org/")],
    "clinical-research": [("ClinicalTrials.gov", "https://clinicaltrials.gov/"), ("ICH GCP E6", "https://www.ich.org/page/efficacy-guidelines")],
    "nobel-medicine": [("NobelPrize.org · Physiology or Medicine", "https://www.nobelprize.org/prizes/medicine/")],
    "nobel-chemistry": [("NobelPrize.org · Chemistry", "https://www.nobelprize.org/prizes/chemistry/")],
    "research-techniques": [("Addgene · Protocols", "https://www.addgene.org/protocols/"), ("JoVE · Journal of Visualized Experiments", "https://www.jove.com/")],
}

# ----------------------------------------------------------------------------- helpers
def slug(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return value or "x"


def h(value: str) -> int:
    return int(hashlib.sha256(value.encode("utf-8")).hexdigest()[:8], 16)


def split_elements(text_zh: str, text_en: str, limit: int = 4):
    """Split authored focus sentences into aligned bilingual key elements for step titles.
    Chinese splits on 、；; English first on , ; and only on ' and '/' with ' when that aligns the counts."""
    zh = text_zh.strip().rstrip("。")
    en = text_en.strip().rstrip(".")
    if "：" in zh:
        zh = zh.split("：", 1)[1]
    if ":" in en:
        en = en.split(":", 1)[1]
    zh_parts = [p.strip(" ；;。") for p in re.split(r"[、；;]", zh) if p.strip(" ；;。")]
    en_comma = [p.strip(" ;") for p in re.split(r",|;", en) if p.strip(" ;")]
    en_full = [p.strip(" ;") for p in re.split(r",|;| and | with ", en) if p.strip(" ;")]
    # Chinese '與/和' inside the last element pairs with English ' and ' inside the last comma element.
    if len(en_comma) == len(zh_parts):
        en_parts = en_comma
    elif len(en_full) == len(zh_parts):
        en_parts = en_full
    elif len(en_comma) > len(zh_parts):
        en_parts = en_comma
    else:
        en_parts = en_full
    n = min(len(zh_parts), len(en_parts), limit)
    if n >= 2:
        pairs = [(zh_parts[i], en_parts[i]) for i in range(n)]
        if len(zh_parts) > n and len(en_parts) > n and n < limit:
            pass
        return pairs
    return [(zh_parts[0] if zh_parts else text_zh, en_parts[0] if en_parts else text_en)]


# ----------------------------------------------------------------------------- icon descriptors
KIND_GLYPH = {"procedure": None, "technique": None, "device": None, "test": "flask", "concept": None, "skill": None,
              "acupoint": "acupoint", "manual": "hand-press", "formula": "cauldron", "herb": "herb-leaf",
              "syndrome": None, "classic": "scroll", "prize": "medal", "research": "pipette", "ai": "go-board", "case": "clinic"}

KEYWORD_GLYPHS = [
    (r"dbs|deep brain|stimulat|neuromod|electrode|rtms|tms|tdcs|ect\b", "neuron"),
    (r"robot", "robot"), (r"laser|photo|light", "beam"), (r"ultrasound|echo|doppler|duplex|sonog", "waves"),
    (r"\bct\b|tomograph|x-ray|radiograph|mammogra|imaging|mri|pet", "xray"), (r"catheter|stent|angio|pci|tavi|evar|tevar|tace|tips|emboli", "vessel"),
    (r"valve|cabg|bypass|cardiac|heart|myocard|pericard", "heart-surgery"), (r"ecg|rhythm|arrhythm|pacemaker|icd|crt|ablation|syncope", "heart-pulse"),
    (r"lung|pulmon|bronch|thorac|pleur|pneumo|ventilat|airway|intubat|oxygen|tracheo", "lungs"),
    (r"kidney|renal|nephr|dialys|urin|bladder|prostat|ureter|stone", "kidney"), (r"liver|hepat|bile|biliar|pancrea|whipple", "liver"),
    (r"stomach|gastr|bowel|colon|colorect|anal|hernia|append|esophag|oesophag|endoscop|ercp|peg", "stomach"),
    (r"bone|fracture|orif|nail|osteo|hip|knee|ankle|shoulder|arthro|joint|ligament|meniscus|tendon|cartilage|spine|spinal|disc|scolio|vertebr|lamin|fusion", "bone"),
    (r"brain|cranio|neuro|stroke|epilep|seizure|dementia|parkinson|tremor|coma|migraine|headache|eeg", "brain"),
    (r"eye|ocular|retina|cataract|glaucoma|cornea|vision|visual|iol|fundus|slit", "eye"), (r"\bear\b|cochlea|hearing|audio|tinnitus|otolog|mastoid|tympan", "ear"),
    (r"nose|nasal|sinus|septo|rhino|epistax", "nose"), (r"throat|laryn|tonsil|voice|pharyn|neck|thyroid|parotid", "throat"),
    (r"tooth|dental|implant|root canal|molar|periodont|orthodont|jaw|mandib", "tooth"), (r"skin|derm|burn|wound|scar|flap|graft|ulcer|acne|psoria", "skin"),
    (r"preg|labour|labor|cesarean|caesarean|fetal|fetus|obstet|birth|placenta|breech", "fetus"), (r"uter|ovar|cervic|menstru|ivf|embryo|gyn|endometr|contracep|menopaus", "uterus"),
    (r"child|infant|neonat|newborn|paediat|pediat|baby|apgar", "baby"), (r"blood|anemia|anaemia|coagul|transfus|hemophil|haemophil|leuk|lymphoma|myeloma|platelet|cbc", "blood"),
    (r"cancer|tumou?r|oncol|chemo|radiother|sbrt|imrt|brachy|metasta|carcinom|melanoma", "ribbon"), (r"immun|antibod|vaccin|allerg|lupus|rheumat|arthritis|vasculit", "antibody"),
    (r"infect|antibiotic|sepsis|virus|viral|bacteri|fung|tb\b|tubercul|hiv|covid|influenza|malaria|dengue", "virus"),
    (r"diabet|insulin|glucose|thyroid|adrenal|pituitar|hormone|endocrin|obesit|lipid", "gland"), (r"psych|depress|anxiet|schizo|bipolar|delirium|mental|suicide|substance", "mind"),
    (r"rehab|gait|prosthe|orthos|exoskelet|physio|exercise|stroke rehab", "walk"), (r"geriat|frail|fall|elder|palliat|home", "family"),
    (r"nurs|vital|injection|cannul|dressing|catheter care|handover|isbar|news", "nurse"), (r"drug|pharm|dose|dosing|cyp|antico|analges|opioid|nsaid", "pill"),
    (r"anesthe|anaesthe|block|epidural|spinal anaes|sedat|rsi", "mask"), (r"emergen|cpr|acls|atls|triage|trauma|shock|resusc|poison|overdose|snake|drown|heat", "ambulance"),
    (r"icu|critical|ards|weaning|crrt|abg|vasopressor|fluid", "monitor"), (r"path|histolog|biopsy|cytolog|frozen|lab|assay|marker|panel|culture|microbiol|pcr", "microscope"),
    (r"epidemi|public|screen|policy|ethic|statist|trial|evidence|health econ|surveill|digital", "globe"), (r"gene|genom|dna|variant|sequenc|crispr|cas9|editing|prs|gwas|epigen", "dna-helix"),
    (r"stem|ipsc|organoid|regenerat|aging|ageing|senol|telomer|car-t|cell therapy|nk cell|mrna|lnp|sirna", "sprout"),
    (r"alphago|alphafold|alphazero|muzero|mcts|policy|value|transformer|diffusion|neural network|deep learning|llm|cnn|gnn|machine learning|\bai\b|reinforcement", "go-board"),
    (r"bci|brain-computer|neuralink|optogen|eeg|fmri|neuroprosth|retinal prosth|connectom", "bci"),
    (r"device|engineering|3d print|biomaterial|wearable|sensor|microfluid|nanomed|samd|fhir", "gear-heart"),
    (r"pulse|tongue|inspect|inquiry|palpat|pattern|identification|eight-principle|zang-fu|four examination", "tongue"),
    (r"acupunct|needl|moxa|cupping|gua sha|bleeding|electro|scalp|auricular", "needle"), (r"tuina|massage|press|knead|roll|grasp|thrust|traction|stretch|sen |shiatsu|lomi|swedish|lymphatic", "hand-press"),
    (r"qigong|baduanjin|taiji|frolic|yijinjing|breathing|zhan zhuang|regimen|sleep regimen", "taiji"), (r"soup|congee|tea|diet|food|wine|dish", "bowl"),
    (r"classic|canon|neijing|nanjing|shanghan|jingui|bencao|lun|physician|master|hua tuo|zhang|sun simiao|li shizhen|ye tianshi|ni haixia|youtube|zizi", "scroll"),
    (r"cold|cough|wheez|palpitation|insomnia|headache|dizziness|wind stroke|stomach pain|diarrh|constipat|jaundice|oedema|strangury|bi \(|atrophy|wasting|bleeding disorders|sweating|fever|dysmenorrh|menstru|discharge|infertil|postpartum|eczema|psoriasis|acne|urticaria|zoster|trauma|fracture|sprain|eye disorders|tinnitus|rhinitis|sore throat|mouth ulcers", "cauldron"),
    (r"nobel|prize|laureate", "medal"), (r"western|blot|elisa|flow|cytometry|microscop|cryo|crystallo|nmr|spectrom|hplc|cloning|plasmid|mutagen|expression|transfect|knockout|patch|calcium|chip-seq|atac|hi-c|bisulfite|ribosome|two-hybrid|spr|microarray|blast|docking|dynamics|silac|isotope|radioimmuno|elispot|lineage|xenograft|screening|imaging|microdialysis|tracer|histolog|hybridis|organ bath|behaviour|telemetry", "pipette"),
]


def pick_glyph(dep, topic):
    if KIND_GLYPH.get(topic["kind"]):
        return KIND_GLYPH[topic["kind"]]
    text = (topic["en"] + " " + topic.get("focus_en", "")).lower()
    for pattern, glyph in KEYWORD_GLYPHS:
        if re.search(pattern, text):
            return glyph
    return dep["glyph"]


class IconRegistry:
    """Guarantees that every topic receives a visually distinct icon descriptor."""
    def __init__(self):
        self.seen = set()

    def assign(self, glyph, accent, seed, badge):
        base = h(seed)
        for attempt in range(64):
            segments = (base + attempt) % 9              # 0–8 arc segments around the ring
            dots = (base // 9 + attempt) % 7             # 0–6 satellite dot patterns
            flip = (base // 63 + attempt) % 2            # mirrored glyph
            key = (glyph, accent, segments, dots, flip, badge)
            if key not in self.seen:
                self.seen.add(key)
                return {"g": glyph, "a": accent, "s": segments, "d": dots, "f": flip, "b": badge}
        raise RuntimeError("icon space exhausted for " + seed)


def badge_for(title_en: str, title_zh: str, fallback: str) -> str:
    words = [w for w in re.findall(r"[A-Za-z0-9]+", title_en) if w.lower() not in ("the", "of", "and", "for", "in", "a", "an", "to", "with", "on", "by", "at", "or", "vs")]
    if words:
        if len(words) == 1:
            return words[0][:2].upper()
        return (words[0][0] + words[1][0]).upper()
    return fallback[:2]


# ----------------------------------------------------------------------------- step templates
def step(sid, order, zh, en, obj_zh, obj_en, ins_zh, ins_en, obs_zh, obs_en, fail_zh, fail_en, chk_zh, chk_en, k, free):
    return {"id": sid, "order": order, "title": zh, "titleEn": en, "objective": obj_zh, "objectiveEn": obj_en,
            "instruction": ins_zh, "instructionEn": ins_en, "observation": obs_zh, "observationEn": obs_en,
            "failure": fail_zh, "failureEn": fail_en, "check": chk_zh, "checkEn": chk_en, "knowledge": k, "free": free}


def kp(title_zh, title_en, text_zh, text_en):
    return {"title": title_zh, "titleEn": title_en, "text": text_zh, "textEn": text_en}


def generic_stage(sid, order, zh, en, desc_zh, desc_en, steps, free):
    return {"id": sid, "order": order, "title": zh, "titleEn": en, "description": desc_zh, "descriptionEn": desc_en, "steps": steps, "free": free}


def build_steps(prefix, free, specs):
    """specs: list of (zh_title, en_title, obj_zh, obj_en, ins_zh, ins_en, obs_zh, obs_en, fail_zh, fail_en, chk_zh, chk_en, [kp...])"""
    out = []
    for i, s in enumerate(specs, 1):
        out.append(step(f"{prefix}-{i}", i, *s[:12], s[12], free))
    return out


def course_for(topic_id, t, dep, kind, zh, en, focus_zh, focus_en, extra=None):
    """Create the staged curriculum for a topic from kind-specific templates."""
    elems = split_elements(focus_zh, focus_en)
    stages = []
    sid = topic_id
    E = extra or {}
    short_zh = zh.split("（")[0]
    short_en = en.split(" (")[0]

    def elem_steps(prefix, free, verb_zh, verb_en, obs_zh, obs_en):
        specs = []
        for i, (ez, ee) in enumerate(elems, 1):
            specs.append((f"關鍵要素 {i}：{ez}", f"Key element {i}: {ee}",
                          f"能說明並執行「{ez}」在{short_zh}中的作用與順序。", f"Explain and perform '{ee}' within {short_en}, in sequence.",
                          f"{verb_zh}「{ez}」：先複述目的，再示範操作或推理，最後記錄觀察。", f"{verb_en} '{ee}': restate the purpose, demonstrate the action or reasoning, then record observations.",
                          obs_zh.format(e=ez), obs_en.format(e=ee),
                          f"若「{ez}」無法完成或結果異常，先回到上一要素確認前提，再檢查操作條件；不可跳步。", f"If '{ee}' cannot be completed or gives an abnormal result, re-verify the previous element and the operating conditions; never skip ahead.",
                          f"已正確完成「{ez}」並以文字或數據留下證據。", f"'{ee}' has been completed correctly with written or numeric evidence.",
                          [kp("要素的作用", "Role of the element", f"「{ez}」是{short_zh}的核心組成，其結果影響後續步驟的安全與效果。", f"'{ee}' is a core component of {short_en}; its outcome determines the safety and effect of later steps."),
                           kp("常見錯誤", "Common errors", "順序錯置、條件未確認與未記錄數據是最常見的三種失誤。", "Wrong sequence, unverified conditions and missing records are the three most common errors.")]))
        return build_steps(prefix, free, specs)

    if kind in ("procedure", "device"):
        s1 = build_steps(sid + "-s1", True, [
            ("適應症與禁忌", "Indications and contraindications",
             f"列出{short_zh}的主要適應症、相對與絕對禁忌。", f"List the main indications and the relative/absolute contraindications of {short_en}.",
             f"依教材與指引整理：{focus_zh}", f"Organise from the curriculum and guidelines: {focus_en}",
             "記錄病人是否符合適應症、有無禁忌與替代方案。", "Record whether the patient meets the indications, any contraindications and the alternatives.",
             "適應症不符時不應進行；若存在相對禁忌需多專科討論。", "Do not proceed when indications are not met; relative contraindications require multidisciplinary discussion.",
             "能正確區分適應症與禁忌並說明替代治療。", "Can correctly separate indications from contraindications and name alternatives.",
             [kp("適應症的來源", "Where indications come from", "適應症來自隨機試驗、指引與專家共識，會隨證據更新。", "Indications derive from trials, guidelines and consensus and change as evidence evolves."),
              kp("共享決策", "Shared decision-making", "說明利益、風險與替代方案後，由病人參與決定。", "After explaining benefits, risks and alternatives, the patient participates in the decision.")]),
            ("術前評估與風險分級", "Pre-operative assessment and risk stratification",
             "完成病史、理學檢查、必要檢驗影像與風險分級。", "Complete history, examination, required tests/imaging and risk scoring.",
             "逐項核對：心肺功能、凝血、用藥（抗凝／抗血小板）、過敏、影像與實驗室數據。", "Check item by item: cardiopulmonary status, coagulation, medications (anticoagulants/antiplatelets), allergies, imaging and laboratory data.",
             "整理成一頁術前摘要，標示高風險項目。", "Compile a one-page pre-operative summary highlighting high-risk items.",
             "遺漏抗凝藥或未評估氣道是常見且可致命的疏失。", "Missing an anticoagulant or an unassessed airway are common and potentially fatal omissions.",
             "術前摘要完整且風險分級有依據。", "The summary is complete and the risk grade is justified.",
             [kp("風險工具", "Risk tools", "ASA、RCRI 等工具提供結構化風險語言，但不取代臨床判斷。", "Tools such as ASA and RCRI give a structured risk language but do not replace judgement."),
              kp("用藥調整", "Medication adjustment", "抗凝、降血糖與類固醇需依指引於術前調整。", "Anticoagulants, glucose-lowering drugs and steroids need guideline-based peri-operative adjustment.")]),
            ("知情同意與團隊簡報（Time-out）", "Informed consent and team briefing (time-out)",
             "完成知情同意並進行 WHO 手術安全查核。", "Obtain informed consent and run the WHO surgical safety checklist.",
             "以病人聽得懂的語言說明步驟、風險、替代方案；手術前確認身份、部位、手術名稱與器材。", "Explain steps, risks and alternatives in plain language; before starting confirm identity, site, procedure and equipment.",
             "記錄同意書簽署與查核完成時間。", "Record consent signature and checklist completion time.",
             "錯誤部位與錯誤病人是查核要避免的「永不事件」。", "Wrong-site and wrong-patient events are 'never events' the checklist exists to prevent.",
             "同意書與查核表完整。", "Consent and checklist are complete.",
             [kp("WHO 查核表三階段", "The three checklist phases", "麻醉前、劃刀前、離開手術室前。", "Before anaesthesia, before incision and before leaving the theatre."),
              kp("病人自主", "Patient autonomy", "同意須自願、知情且具決定能力。", "Consent must be voluntary, informed and given with capacity.")]),
        ])
        s2 = build_steps(sid + "-s2", False, [
            ("麻醉與監測", "Anaesthesia and monitoring",
             "選擇麻醉方式並建立標準監測。", "Choose the anaesthetic technique and establish standard monitoring.",
             "與麻醉團隊確認：全身／區域麻醉、氣道計畫、血管通路與侵入性監測需求。", "Agree with the anaesthesia team: general/regional, airway plan, vascular access and invasive monitoring.",
             "記錄基礎生命徵象與麻醉計畫。", "Record baseline vital signs and the anaesthetic plan.",
             "血流動力學不穩或氣道困難時先穩定再開始。", "Stabilise haemodynamics or a difficult airway before starting.",
             "監測齊備且麻醉計畫與手術需求相符。", "Monitoring is in place and the plan matches the surgical needs.",
             [kp("監測標準", "Monitoring standards", "SpO2、EtCO2、心電圖、血壓與體溫為基本。", "SpO2, EtCO2, ECG, blood pressure and temperature are the minimum.")]),
            ("擺位、消毒與鋪單", "Positioning, antisepsis and draping",
             "完成安全擺位、皮膚消毒與無菌鋪單。", "Position safely, prepare the skin and drape sterilely.",
             "保護壓點與神經，確認消毒範圍涵蓋可能延伸的切口。", "Pad pressure points and nerves; ensure the prepared field covers any extension of the incision.",
             "檢查眼睛保護、管路固定與四肢位置。", "Check eye protection, line security and limb positions.",
             "擺位不當造成的神經壓迫與壓傷可在數小時內發生。", "Positioning injuries to nerves and skin can occur within hours.",
             "擺位安全、無菌區完整。", "Positioning is safe and the sterile field intact.",
             [kp("無菌原則", "Aseptic principles", "從切口中心向外消毒，鋪單後不再觸碰非無菌區。", "Prepare from the incision outward; after draping never touch non-sterile areas.")]),
            ("入路與顯露", "Approach and exposure",
             f"依{short_zh}的標準入路建立顯露。", f"Establish exposure through the standard approach for {short_en}.",
             "逐層辨識解剖標誌，保護重要神經血管，使用適當牽開。", "Identify anatomical landmarks layer by layer, protect key neurovascular structures and retract appropriately.",
             "口述每一層所見結構並與解剖圖對照。", "Name the structures in each layer and compare with the atlas.",
             "顯露不足時擴大切口優於盲目操作。", "Extending the incision is safer than operating blind.",
             "目標結構清楚顯露且周圍組織受保護。", "The target is clearly exposed with surrounding tissue protected.",
             [kp("入路選擇", "Choosing an approach", "入路取決於病灶位置、組織保護與術者經驗。", "The approach depends on lesion location, tissue preservation and surgeon experience.")]),
        ])
        if topic_id in authored.CORE_STEPS:
            s3 = build_steps(sid + "-s3", False, [tuple(a[:12]) + ([kp(*k) for k in a[12]],) for a in authored.CORE_STEPS[topic_id]])
        else:
            s3 = elem_steps(sid + "-s3", False, "執行", "Perform", "觀察「{e}」完成後的解剖／生理變化並記錄。", "Observe and record the anatomical/physiological change after '{e}'.")
        s3 += build_steps(sid + "-s3b", False, [
            ("止血、檢查與關閉", "Haemostasis, final check and closure",
             "確認止血、器械紗布計數正確後逐層關閉。", "Confirm haemostasis and correct instrument/sponge counts, then close in layers.",
             "沖洗、檢查吻合或植入物位置、放置引流（如需）、關閉並記錄。", "Irrigate, check anastomoses or implant position, place drains if needed, close and document.",
             "記錄失血量、植入物序號與引流數量。", "Record blood loss, implant serial numbers and drain count.",
             "計數不符時必須在關閉前以影像排除遺留。", "A count discrepancy must be resolved by imaging before closure.",
             "關閉完成、計數正確、紀錄完整。", "Closure complete, counts correct, documentation complete.",
             [kp("手術紀錄", "The operative note", "紀錄應讓未在場者也能重建過程。", "The note should let someone absent reconstruct the procedure.")]),
        ])
        s4 = build_steps(sid + "-s4", False, [
            ("術後監測", "Post-operative monitoring",
             "建立術後觀察重點與警訊門檻。", "Set post-operative observation priorities and alert thresholds.",
             "依手術特性監測生命徵象、神經血管狀態、引流與疼痛。", "Monitor vital signs, neurovascular status, drains and pain according to the procedure.",
             "以表格記錄並標示異常趨勢。", "Chart and flag abnormal trends.",
             "異常趨勢比單一數值更重要。", "Trends matter more than single values.",
             "監測計畫執行且異常能被及時發現。", "The monitoring plan is followed and abnormalities detected early.",
             [kp("早期警訊", "Early warning", "NEWS2 等評分可標準化升級流程。", "Scores such as NEWS2 standardise escalation.")]),
            ("併發症辨識與處理", "Recognising and managing complications",
             f"列出{short_zh}的常見與嚴重併發症及處理原則。", f"List the common and serious complications of {short_en} and the principles of management.",
             "依時間軸（術中、早期、晚期）整理出血、感染、臟器損傷、血栓與裝置相關問題。", "Organise by timeline (intra-operative, early, late): bleeding, infection, organ injury, thrombosis and device-related problems.",
             "為每項併發症寫下偵測指標與第一步處置。", "For each complication write the detection sign and first action.",
             "延遲辨識是併發症惡化的主因。", "Delayed recognition is the main driver of deterioration.",
             "能說出至少五項併發症及其處理。", "Can name at least five complications and their management.",
             [kp("Clavien-Dindo 分級", "Clavien–Dindo grading", "以處置強度分級併發症，便於比較。", "Complications graded by the intensity of treatment required, enabling comparison.")]),
            ("出院、追蹤與復健", "Discharge, follow-up and rehabilitation",
             "制定出院標準、追蹤時程與復健計畫。", "Define discharge criteria, follow-up schedule and rehabilitation.",
             "包含傷口照護、活動限制、用藥、回診時間與警訊教育。", "Include wound care, activity limits, medications, review dates and warning-sign education.",
             "以書面衛教單確認病人理解。", "Confirm understanding with a written leaflet and teach-back.",
             "缺乏衛教是再入院的常見原因。", "Poor education is a common cause of readmission.",
             "出院計畫完整且病人能複述警訊。", "The discharge plan is complete and the patient can repeat the warning signs.",
             [kp("ERAS", "Enhanced recovery", "早期進食、下床與多模式止痛縮短住院。", "Early feeding, mobilisation and multimodal analgesia shorten stays.")]),
            ("結果評估與品質指標", "Outcomes and quality indicators",
             "以結果指標評估手術品質。", "Evaluate quality with outcome indicators.",
             "整理死亡率、併發症率、再手術率、功能評分與病人報告結果（PROM）。", "Compile mortality, complication and reoperation rates, functional scores and patient-reported outcomes.",
             "與登錄資料或文獻基準比較。", "Compare with registry data or literature benchmarks.",
             "沒有結果追蹤就無法改善。", "Without outcome tracking there is no improvement.",
             "能解釋至少三項品質指標。", "Can explain at least three quality indicators.",
             [kp("登錄制度", "Registries", "國家級登錄（如關節置換登錄）揭露植入物長期表現。", "National registries (e.g. arthroplasty registries) reveal long-term implant performance.")]),
        ])
        stages = [generic_stage(sid + "-s1", 1, "第一節 · 適應症與術前評估（免費試學）", "Section 1 · Indications and pre-operative assessment (free)", "本節免費：建立適應症、風險與同意的基礎。", "Free section: indications, risk and consent.", s1, True),
                  generic_stage(sid + "-s2", 2, "第二節 · 麻醉、擺位與入路", "Section 2 · Anaesthesia, positioning and approach", "安全開始手術的準備。", "Preparing to start safely.", s2, False),
                  generic_stage(sid + "-s3", 3, "第三節 · 核心步驟", "Section 3 · Core operative steps", f"{short_zh}的關鍵操作要素。", f"The key operative elements of {short_en}.", s3, False),
                  generic_stage(sid + "-s4", 4, "第四節 · 術後照護與併發症", "Section 4 · Post-operative care and complications", "從監測到品質指標。", "From monitoring to quality indicators.", s4, False)]

    elif kind in ("technique", "test", "research", "ai", "skill"):
        head_zh, head_en = {"technique": ("原理與適應症", "Principles and indications"), "test": ("原理與前處理", "Principles and pre-analytics"),
                            "research": ("原理與設計", "Principles and design"), "ai": ("問題定義與資料", "Problem definition and data"),
                            "skill": ("準備與安全", "Preparation and safety")}[kind]
        s1 = build_steps(sid + "-s1", True, [
            (head_zh, head_en,
             f"說明{short_zh}的原理與適用情境。", f"Explain the principle and the situations where {short_en} applies.",
             f"整理：{focus_zh}", f"Organise: {focus_en}",
             "以一張概念圖呈現輸入、過程與輸出。", "Draw a one-page map of inputs, process and outputs.",
             "原理不清時操作會變成盲目模仿。", "Without the principle, practice becomes blind imitation.",
             "能用自己的話解釋原理與適用／不適用情境。", "Can explain the principle and when it does or does not apply in own words.",
             [kp("原理摘要", "Principle summary", focus_zh, focus_en), kp("限制", "Limitations", "每項技術都有偵測極限、偽影或偏差來源。", "Every technique has detection limits, artefacts or sources of bias.")]),
            ("器材、環境與安全準備", "Equipment, environment and safety preparation",
             "備妥器材、確認環境與安全措施。", "Prepare equipment, check the environment and safety measures.",
             "列出器材清單、校正／品管狀態、個人防護與病人（或樣本）準備。", "List equipment, calibration/QC status, PPE and patient (or sample) preparation.",
             "逐項打勾並記錄批號或校正日期。", "Tick each item and record lot numbers or calibration dates.",
             "未校正的器材會產生看似合理的錯誤數據。", "Uncalibrated equipment produces plausible but wrong data.",
             "準備清單完成。", "Preparation checklist complete.",
             [kp("品質管制", "Quality control", "校正、對照與記錄是結果可信的前提。", "Calibration, controls and records underpin trustworthy results.")]),
        ])
        if topic_id in authored.CORE_STEPS:
            s2 = build_steps(sid + "-s2", False, [tuple(a[:12]) + ([kp(*k) for k in a[12]],) for a in authored.CORE_STEPS[topic_id]])
        else:
            s2 = elem_steps(sid + "-s2", False, "執行", "Perform", "記錄「{e}」的設定、讀值或所見。", "Record the settings, readings or findings of '{e}'.")
        s3 = build_steps(sid + "-s3", False, [
            ("判讀與臨床決策", "Interpretation and decision-making",
             "將結果轉為臨床或研究結論。", "Turn the result into a clinical or research conclusion.",
             "對照參考範圍、前次結果與臨床情境，判斷是否需重複或進一步檢查。", "Compare with reference ranges, prior results and the clinical context; decide on repeat or further testing.",
             "寫下判讀句與下一步。", "Write the interpretation sentence and the next step.",
             "脫離臨床情境的判讀容易誤判。", "Interpretation detached from context misleads.",
             "判讀有依據且下一步明確。", "The interpretation is justified and the next step defined.",
             [kp("前測機率", "Pre-test probability", "檢查結果的意義取決於做檢查前的機率。", "A result's meaning depends on the probability before the test.")]),
            ("品質、錯誤與安全回顧", "Quality, error and safety review",
             "回顧常見錯誤與安全事件。", "Review common errors and safety events.",
             "列出前分析／分析／後分析（或操作前中後）的錯誤來源與預防。", "List pre-analytical/analytical/post-analytical (or before/during/after) error sources and prevention.",
             "完成一份自我檢核表。", "Complete a self-audit checklist.",
             "多數錯誤發生在操作前後而非操作中。", "Most errors occur before and after, not during, the procedure.",
             "能說出三項錯誤來源與預防方法。", "Can name three error sources and their prevention.",
             [kp("通報文化", "Reporting culture", "無責難通報促進系統改善。", "No-blame reporting drives system improvement.")]),
        ])
        stages = [generic_stage(sid + "-s1", 1, f"第一節 · {head_zh}（免費試學）", f"Section 1 · {head_en} (free)", "本節免費。", "Free section.", s1, True),
                  generic_stage(sid + "-s2", 2, "第二節 · 操作步驟", "Section 2 · Procedure", f"{short_zh}的操作要素。", f"Hands-on elements of {short_en}.", s2, False),
                  generic_stage(sid + "-s3", 3, "第三節 · 判讀、品質與安全", "Section 3 · Interpretation, quality and safety", "從結果到決策。", "From result to decision.", s3, False)]

    elif kind in ("concept", "syndrome", "prize", "classic"):
        titles = {"concept": [("機制與病理生理", "Mechanism and pathophysiology"), ("臨床表現與診斷", "Presentation and diagnosis"), ("治療與實證", "Treatment and evidence")],
                  "syndrome": [("病因病機", "Aetiology and pathomechanism"), ("辨證分型", "Pattern differentiation"), ("治法、方藥、針灸與調護", "Methods, formulas, acupuncture and care")],
                  "prize": [("問題背景", "The question"), ("方法與關鍵實驗", "Methods and the key experiment"), ("結果、機制與臨床遺產", "Result, mechanism and clinical legacy")],
                  "classic": [("作者與成書背景", "Author and historical context"), ("核心內容", "Core content"), ("現代解讀與延伸閱讀", "Modern interpretation and further reading")]}[kind]
        s1 = build_steps(sid + "-s1", True, [
            (titles[0][0], titles[0][1],
             f"掌握{short_zh}的背景與基本機制。", f"Grasp the background and basic mechanism of {short_en}.",
             f"閱讀並整理：{focus_zh}", f"Read and organise: {focus_en}",
             "以流程圖畫出因果鏈。", "Draw the causal chain as a flow diagram.",
             "把相關性誤認為因果是最常見的推理錯誤。", "Mistaking correlation for causation is the most common reasoning error.",
             "能畫出並解釋因果鏈。", "Can draw and explain the causal chain.",
             [kp("核心摘要", "Core summary", focus_zh, focus_en), kp("術語", "Terminology", "先定義名詞，再討論機制。", "Define terms before discussing mechanisms.")]),
            ("關鍵名詞與分類", "Key terms and classification",
             "建立本題的名詞表與分類架構。", "Build the glossary and classification for this topic.",
             "列出 8–12 個關鍵名詞，各以一句話定義，並以表格呈現分類。", "List 8–12 key terms with one-sentence definitions and tabulate the classification.",
             "完成名詞表。", "Complete the glossary.",
             "名詞混用會導致後續判斷錯誤。", "Mixing terms leads to later misjudgement.",
             "名詞表完整且分類合理。", "Glossary complete and classification sound.",
             [kp("分類的目的", "Purpose of classification", "分類應服務於治療決策或預後。", "Classification should serve treatment decisions or prognosis.")]),
        ])
        s2 = elem_steps(sid + "-s2", False, "分析", "Analyse", "整理「{e}」的表現、證據或判別要點。", "Summarise the presentation, evidence or distinguishing points of '{e}'.")
        s3 = build_steps(sid + "-s3", False, [
            (titles[2][0], titles[2][1],
             "整合治療原則、證據等級與現代意義。", "Integrate treatment principles, evidence levels and modern relevance.",
             "列出一線與二線做法、支持證據（試驗／指引／經典條文）與限制。", "List first- and second-line approaches, supporting evidence (trials/guidelines/classical passages) and limitations.",
             "寫一段 150 字總結。", "Write a 150-word summary.",
             "證據等級與推薦強度不可混淆。", "Evidence level and recommendation strength are not the same thing.",
             "總結涵蓋治療、證據與限制。", "The summary covers treatment, evidence and limits.",
             [kp("證據金字塔", "The evidence pyramid", "系統性回顧與 RCT 位於頂端，專家意見在底層。", "Systematic reviews and RCTs sit at the top; expert opinion at the bottom.")]),
            ("病例應用與自我測驗", "Case application and self-test",
             "以一個病例或情境應用本題。", "Apply the topic to a case or scenario.",
             "描述情境→列出鑑別→選擇處置→預測結果→比較實際。", "Describe the scenario → list differentials → choose management → predict outcome → compare with reality.",
             "完成病例紀錄。", "Complete the case record.",
             "跳過鑑別診斷直接下結論是危險的捷徑。", "Skipping the differential is a dangerous shortcut.",
             "病例推理完整。", "Case reasoning complete.",
             [kp("反思", "Reflection", "每個病例都應回答：我學到什麼、下次會怎麼做。", "Every case should answer: what did I learn, what will I do differently.")]),
        ])
        stages = [generic_stage(sid + "-s1", 1, f"第一節 · {titles[0][0]}（免費試學）", f"Section 1 · {titles[0][1]} (free)", "本節免費。", "Free section.", s1, True),
                  generic_stage(sid + "-s2", 2, f"第二節 · {titles[1][0]}", f"Section 2 · {titles[1][1]}", "逐項拆解。", "Element by element.", s2, False),
                  generic_stage(sid + "-s3", 3, f"第三節 · {titles[2][0]}", f"Section 3 · {titles[2][1]}", "整合與應用。", "Integration and application.", s3, False)]

    elif kind == "manual":
        s1 = build_steps(sid + "-s1", True, [
            ("手法要領與原理", "Essentials and principles of the technique",
             f"理解{short_zh}的動作結構、作用部位與功效。", f"Understand the movement structure, target region and effect of {short_en}.",
             f"觀看師傅示範後整理：{focus_zh}", f"After the master's demonstration, organise: {focus_en}",
             "口述手法的起勢、著力點與結束。", "Describe the start, point of force and finish.",
             "用蠻力代替技巧會傷害施術者與受術者。", "Brute force instead of technique injures both practitioner and recipient.",
             "能說明手法的五要求（持久、有力、均勻、柔和、深透）如何體現。", "Can explain how the five qualities (persistent, forceful, even, gentle, penetrating) apply.",
             [kp("作用機制", "Mechanism", "手法透過機械刺激影響肌筋膜、循環與神經反射。", "Manual techniques act through mechanical stimulation of myofascia, circulation and neural reflexes.")]),
            ("施術者姿勢與安全溝通", "Practitioner posture and safe communication",
             "建立正確站姿、重心與受術者溝通。", "Establish stance, centre of gravity and communication with the recipient.",
             "確認禁忌（骨折、血栓、感染、懷孕、植入物）、告知力度並取得同意。", "Screen contraindications (fracture, thrombosis, infection, pregnancy, implants), explain pressure and obtain consent.",
             "記錄受術者回饋。", "Record the recipient's feedback.",
             "忽略禁忌是推拿事故的主因。", "Ignoring contraindications is the main cause of manual-therapy accidents.",
             "完成安全篩檢與同意。", "Safety screening and consent complete.",
             [kp("人體力學", "Body mechanics", "以體重與下肢驅動，保護施術者的腕與腰。", "Drive with body weight and legs to protect the practitioner's wrists and back.")]),
        ])
        s2 = elem_steps(sid + "-s2", False, "練習", "Practise", "記錄「{e}」的力度（輕／中／重）、頻率與時間。", "Record pressure (light/medium/firm), rhythm and duration for '{e}'.")
        s2 += build_steps(sid + "-s2b", False, [
            ("沙袋／米袋練功與節奏", "Sandbag practice and rhythm",
             "在練功袋上建立穩定節奏與耐力。", "Build stable rhythm and endurance on a practice bag.",
             "每日 10 分鐘，以節拍器維持規定頻率，逐週增加時間。", "Ten minutes daily at the prescribed rate with a metronome, increasing weekly.",
             "記錄可持續時間與疲勞部位。", "Record sustainable duration and fatigue sites.",
             "節奏不穩代表動作結構未定型。", "An unstable rhythm means the movement pattern is not yet set.",
             "能連續施術 5 分鐘且節奏均勻。", "Can perform continuously for five minutes with an even rhythm.",
             [kp("頻率參考", "Rate references", "揉法 120–160 次／分、滾法約 140 次／分、一指禪 120–160 次／分。", "Kneading 120–160/min, rolling about 140/min, one-finger pushing 120–160/min.")]),
        ])
        s3 = build_steps(sid + "-s3", False, [
            ("臨床應用與配伍", "Clinical application and combinations",
             "將手法置入治療序列。", "Place the technique within a treatment sequence.",
             "依病症選擇準備手法→主要手法→結束手法，並與穴位配合。", "Choose preparatory → main → finishing techniques for the condition and combine with points.",
             "寫出一份 20 分鐘的治療流程。", "Write a 20-minute treatment sequence.",
             "直接以重手法開始會引起防禦性緊張。", "Starting with heavy techniques provokes guarding.",
             "流程合理且含評估與再評估。", "Sequence is sound and includes assessment and reassessment.",
             [kp("再評估", "Reassessment", "每次治療前後比較活動度與疼痛分數。", "Compare range of motion and pain score before and after each session.")]),
            ("禁忌、風險與紀錄", "Contraindications, risks and documentation",
             "列出手法的禁忌與不良反應。", "List contraindications and adverse effects.",
             "整理絕對／相對禁忌、常見不適（瘀青、酸痛）與處理，完成治療紀錄。", "Compile absolute/relative contraindications, common reactions (bruising, soreness) and management; complete the record.",
             "紀錄包含部位、手法、時間、反應。", "Records include region, techniques, duration and response.",
             "頸椎扳法等高風險手法必須有明確適應症與訓練。", "High-risk techniques such as cervical thrust require clear indications and training.",
             "紀錄完整且能說出三項禁忌。", "Record complete and three contraindications named.",
             [kp("通報", "Reporting", "異常反應應通報並檢討。", "Adverse reactions should be reported and reviewed.")]),
        ])
        stages = [generic_stage(sid + "-s1", 1, "第一節 · 手法要領（免費試學）", "Section 1 · Technique essentials (free)", "跟師傅學：示範、原理與安全。", "Learn from the master: demonstration, principle and safety.", s1, True),
                  generic_stage(sid + "-s2", 2, "第二節 · 操作練習", "Section 2 · Practice", "姿勢、力度、頻率與時間。", "Posture, pressure, rhythm and duration.", s2, False),
                  generic_stage(sid + "-s3", 3, "第三節 · 臨床應用與禁忌", "Section 3 · Clinical application and contraindications", "置入治療序列。", "Within a treatment sequence.", s3, False)]

    elif kind == "acupoint":
        A = E
        s1 = build_steps(sid + "-s1", True, [
            ("骨度分寸與體表標誌", "Proportional cun and surface landmarks",
             f"以骨度分寸與標誌定位 {A['code']} {A['zh']}。", f"Locate {A['code']} {A['py']} with proportional cun and landmarks.",
             f"定位：{A['loc_zh']}", f"Location: {A['loc_en']}",
             "在人體圖與真人（或模型）上各標出一次並比對。", "Mark once on the body map and once on a person (or model) and compare.",
             "以個人手指寬度代替同身寸會在高矮不同者上產生誤差。", "Using one's own finger width instead of the patient's cun causes errors across body sizes.",
             "定位與標準描述一致。", "Location matches the standard description.",
             [kp("所屬經脈", "Channel", f"{A['code']} 屬{A['meridian_zh']}。", f"{A['code']} belongs to the {A['meridian_en']}."),
              kp("WHO 標準", "WHO standard", "2008 年 WHO 西太平洋區標準腧穴定位是跨國共同語言。", "The 2008 WHO WPRO standard is the shared international reference.")]),
            ("觸診確認與體位", "Palpation confirmation and positioning",
             "以觸診確認凹陷、肌腱或動脈等細微標誌。", "Confirm subtle landmarks (depressions, tendons, arteries) by palpation.",
             "選擇舒適體位，觸診局部，詢問酸脹感以確認。", "Choose a comfortable position, palpate the site and ask about soreness/distension to confirm.",
             "記錄取穴體位與觸診所見。", "Record positioning and palpation findings.",
             "體位改變會移動軟組織標誌。", "Changing position shifts soft-tissue landmarks.",
             "觸診確認完成。", "Palpation confirmation complete.",
             [kp("阿是穴概念", "Ashi points", "壓痛點可作為取穴的輔助與補充。", "Tender points supplement standard locations.")]),
        ])
        s2 = build_steps(sid + "-s2", False, [
            ("消毒與進針", "Antisepsis and insertion",
             "完成消毒並以正確角度與深度進針。", "Disinfect and insert at the correct angle and depth.",
             f"操作要求：{A['needle']}", f"Needling: {A['needle']}",
             "記錄針具規格、角度、深度。", "Record needle gauge, angle and depth.",
             "超過安全深度可能傷及重要器官或血管。", "Exceeding safe depth can injure organs or vessels.",
             "進針符合規範且無出血。", "Insertion meets the standard without bleeding.",
             [kp("安全深度", "Safe depth", A["needle"], A["needle"])]),
            ("得氣與手法", "Deqi and manipulation",
             "引出得氣並施以適當補瀉。", "Elicit deqi and apply the appropriate tonifying/reducing method.",
             "提插捻轉，觀察酸麻脹重與傳導；依證選擇補、瀉或平補平瀉。", "Lift–thrust and twirl; observe soreness/numbness/distension/heaviness and propagation; choose tonify, reduce or even method by pattern.",
             "記錄針感性質與方向。", "Record the quality and direction of the needle sensation.",
             "無針感時先檢查定位與深度。", "Absent sensation: first recheck location and depth.",
             "得氣明確。", "Deqi obtained.",
             [kp("得氣的意義", "Meaning of deqi", "《靈樞》：刺之要，氣至而有效。", "Lingshu: the essence of needling is that effect follows the arrival of qi.")]),
            ("留針、出針與安全", "Retention, withdrawal and safety",
             "依目的留針並安全出針。", "Retain according to purpose and withdraw safely.",
             "留針 15–30 分鐘（視證），出針時按壓針孔；處理暈針、滯針、血腫。", "Retain 15–30 minutes as indicated; press the hole on withdrawal; manage fainting, stuck needle and haematoma.",
             "記錄留針時間與不良事件。", "Record retention time and any adverse events.",
             "針具遺留體內是可預防的事故：出針後清點。", "Retained needles are preventable: count after withdrawal.",
             "針數清點相符。", "Needle count reconciled.",
             [kp("禁忌提醒", "Cautions", A["needle"], A["needle"])]),
        ])
        s3 = build_steps(sid + "-s3", False, [
            ("主治", "Indications",
             f"掌握 {A['zh']} 的主治範圍。", f"Master the indications of {A['py']}.",
             f"主治：{A['ind_zh']}", f"Indications: {A['ind_en']}",
             "將主治依系統分類並連結病機。", "Group the indications by system and link to pathomechanism.",
             "記住主治但不理解病機，臨床無法變通。", "Memorising indications without pathomechanism prevents clinical flexibility.",
             "能說出主治並解釋其理。", "Can state the indications and explain the rationale.",
             [kp("主治", "Indications", A["ind_zh"], A["ind_en"])]),
            ("配穴與處方", "Combinations and prescriptions",
             "設計含本穴的配穴處方。", "Design a prescription including this point.",
             "依近部、遠部、辨證、對症原則各配 1–2 穴，說明理由。", "Combine 1–2 points each by local, distal, pattern and symptom principles with reasons.",
             "寫出兩個處方。", "Write two prescriptions.",
             "堆疊穴位而無主次會降低效果。", "Piling up points without hierarchy reduces effect.",
             "處方有主穴、配穴與理由。", "Prescriptions have principal and supporting points with reasons.",
             [kp("特定穴運用", "Special points", "原絡、俞募、八脈交會等配穴法。", "Yuan–luo, shu–mu and confluent-point combinations.")]),
        ])
        stages = [generic_stage(sid + "-s1", 1, "第一節 · 定位（免費試學）", "Section 1 · Location (free)", "骨度分寸與觸診。", "Proportional cun and palpation.", s1, True),
                  generic_stage(sid + "-s2", 2, "第二節 · 針刺操作", "Section 2 · Needling", "進針、得氣、留針與安全。", "Insertion, deqi, retention and safety.", s2, False),
                  generic_stage(sid + "-s3", 3, "第三節 · 主治與配伍", "Section 3 · Indications and combinations", "從主治到處方。", "From indications to prescriptions.", s3, False)]

    elif kind == "formula":
        Fm = E
        s1 = build_steps(sid + "-s1", True, [
            ("組成與方義（君臣佐使）", "Composition and rationale (sovereign, minister, assistant, envoy)",
             f"掌握{Fm['zh']}的組成與配伍邏輯。", f"Master the composition and combination logic of {Fm['py']}.",
             f"出處：{Fm['source']}。組成：{Fm['comp']}。功效：{Fm['act_zh']}。", f"Source: {Fm['source']}. Composition: {Fm['comp']}. Actions: {Fm['act_en']}.",
             "為每味藥標註君臣佐使與作用。", "Label each herb as sovereign/minister/assistant/envoy with its role.",
             "不理解方義就無法合理加減。", "Without the rationale, modification is guesswork.",
             "方義分析完整。", "Rationale analysis complete.",
             [kp("功效", "Actions", Fm["act_zh"], Fm["act_en"]), kp("出處", "Source", Fm["source"], Fm["source"])]),
            ("煎服法與劑型", "Preparation, administration and dosage forms",
             "說明煎煮、服法與現代劑型。", "Explain decoction, administration and modern forms.",
             "先煎／後下／包煎／烊化／沖服的藥物；湯、丸、散、濃縮科學中藥的換算。", "Herbs needing pre-decoction, late addition, bag decoction, melting or infusion; converting among decoction, pill, powder and concentrated granules.",
             "寫出煎服指導單。", "Write administration instructions.",
             "煎法錯誤會改變藥效或毒性（如附子先煎）。", "Wrong preparation alters efficacy or toxicity (e.g. aconite must be pre-decocted).",
             "指導單正確。", "Instructions correct.",
             [kp("科學中藥", "Concentrated granules", "台灣健保給付的 GMP 濃縮製劑有固定濃縮比。", "Taiwan's NHI-covered GMP granules have fixed concentration ratios.")]),
        ])
        s2 = build_steps(sid + "-s2", False, [
            ("證治：病機與主症", "Pattern: pathomechanism and main symptoms",
             "辨識本方的主治證型。", "Identify the pattern the formula treats.",
             f"主治：{Fm['pat_zh']}", f"Pattern: {Fm['pat_en']}",
             "列出主症、次症與舌脈。", "List main and secondary symptoms with tongue and pulse.",
             "方證不符是無效的主因。", "Formula–pattern mismatch is the main reason for failure.",
             "能完整描述方證。", "Can fully describe the formula pattern.",
             [kp("方證", "Formula pattern", Fm["pat_zh"], Fm["pat_en"])]),
            ("鑑別相似方", "Differentiating similar formulas",
             "與功效相近的方劑比較。", "Compare with formulas of similar action.",
             "選兩首相近方，比較組成差異、病機側重與使用時機。", "Pick two similar formulas and compare composition, emphasis and timing.",
             "完成比較表。", "Complete a comparison table.",
             "相似方的差別常在一兩味藥。", "Similar formulas often differ by one or two herbs.",
             "比較表合理。", "Comparison table sound.",
             [kp("類方", "Formula families", "桂枝湯類、承氣湯類、四物湯類等類方系統。", "Families such as the Guizhi, Chengqi and Siwu groups.")]),
        ])
        s3 = build_steps(sid + "-s3", False, [
            ("加減與禁忌", "Modifications and cautions",
             "依兼證加減並掌握禁忌。", "Modify for accompanying patterns and master cautions.",
             f"常用加減與注意：{Fm['note'] or '依兼證加減；孕婦、兒童與慢性病患者調整劑量。'}", f"Common modifications and notes: {Fm['note'] or 'modify for accompanying patterns; adjust doses for pregnancy, children and chronic disease.'}",
             "寫出三種加減情境。", "Write three modification scenarios.",
             "加減過多會失去原方結構。", "Over-modification destroys the formula's structure.",
             "加減有理由且保留主方。", "Modifications are justified and keep the core.",
             [kp("注意事項", "Notes", Fm["note"] or "—", Fm["note"] or "—")]),
            ("現代研究與中西整合", "Modern research and integration",
             "了解本方的現代藥理與臨床研究。", "Learn the modern pharmacology and clinical research.",
             "查詢 PubMed 與台灣健保資料庫研究；評估證據等級與中西藥交互作用。", "Search PubMed and Taiwan NHI database studies; appraise evidence level and herb–drug interactions.",
             "整理 3 篇文獻摘要。", "Summarise three papers.",
             "體外研究不等於臨床療效。", "In-vitro findings are not clinical efficacy.",
             "文獻摘要完成。", "Literature summary complete.",
             [kp("交互作用", "Interactions", "含甘草、當歸、丹參等的方劑與西藥（warfarin、降壓藥）可能交互作用。", "Formulas with liquorice, dang gui or danshen may interact with warfarin or antihypertensives.")]),
        ])
        stages = [generic_stage(sid + "-s1", 1, "第一節 · 組成與方義（免費試學）", "Section 1 · Composition and rationale (free)", "君臣佐使。", "Sovereign, minister, assistant, envoy.", s1, True),
                  generic_stage(sid + "-s2", 2, "第二節 · 證治", "Section 2 · Pattern and treatment", "方證對應。", "Formula–pattern correspondence.", s2, False),
                  generic_stage(sid + "-s3", 3, "第三節 · 加減、禁忌與現代應用", "Section 3 · Modification, cautions and modern use", "靈活與安全。", "Flexibility and safety.", s3, False)]

    elif kind == "herb":
        Hb = E
        s1 = build_steps(sid + "-s1", True, [
            ("性味歸經與功效", "Nature, flavour, channels and actions",
             f"掌握{Hb['zh']}的基本藥性。", f"Master the basic properties of {Hb['py']}.",
             f"來源：{Hb['latin']}。性味：{Hb['nature']}。歸經：{Hb['channels']}。功效：{Hb['act_zh']}。", f"Source: {Hb['latin']}. Nature/flavour: {Hb['nature']}. Channels: {Hb['channels']}. Actions: {Hb['act_en']}.",
             "以性味推導功效並與記載比對。", "Derive the actions from nature/flavour and compare with the record.",
             "性味與功效脫節時代表理解不足。", "A gap between properties and actions signals incomplete understanding.",
             "能背誦並解釋性味歸經功效。", "Can recite and explain properties, channels and actions.",
             [kp("功效", "Actions", Hb["act_zh"], Hb["act_en"]), kp("基原", "Botanical source", Hb["latin"], Hb["latin"])]),
            ("飲片辨識與炮製", "Decoction-piece identification and processing",
             "辨識飲片外觀並了解炮製方法。", "Identify the decoction piece and understand processing.",
             "觀察形狀、顏色、氣味、斷面；比較生用與炮製品（炒、炙、煅、製）的差異。", "Observe shape, colour, odour and fracture; compare raw and processed forms (stir-fried, honey-fried, calcined, prepared).",
             "記錄辨識要點。", "Record identification points.",
             "偽品與混淆品是安全風險（如關木通／川木通）。", "Adulterants and confused species are a safety risk (e.g. Aristolochia vs Clematis mutong).",
             "能辨識正品。", "Can identify the genuine article.",
             [kp("炮製目的", "Purpose of processing", "減毒、增效、改變藥性與便於儲存。", "Detoxify, enhance, alter properties and aid storage.")]),
        ])
        s2 = build_steps(sid + "-s2", False, [
            ("臨床應用與配伍", "Clinical application and pairing",
             "在方劑中運用本藥。", "Use the herb within formulas.",
             "列出含本藥的三首代表方與藥對（相須、相使）。", "List three representative formulas and herb pairs (mutual reinforcement/assistance).",
             "說明在各方中的角色。", "Explain its role in each.",
             "同一藥在不同方中角色不同。", "The same herb plays different roles in different formulas.",
             "三方三藥對完成。", "Three formulas and three pairs done.",
             [kp("七情", "The seven relations", "單行、相須、相使、相畏、相殺、相惡、相反。", "Single use, reinforcement, assistance, fear, neutralisation, aversion and antagonism.")]),
            ("用量與用法", "Dosage and administration",
             "掌握常用劑量與特殊煎法。", "Master usual doses and special preparation.",
             f"常用量：{Hb['dose']} g。{Hb['caution'] or ''}", f"Usual dose: {Hb['dose']} g. {Hb['caution'] or ''}",
             "寫出成人與兒童劑量範圍。", "Write adult and child dose ranges.",
             "超量或久服是中藥不良反應的主要原因。", "Overdose and prolonged use are the main causes of adverse reactions.",
             "劑量正確。", "Doses correct.",
             [kp("劑量", "Dose", f"{Hb['dose']} g", f"{Hb['dose']} g")]),
        ])
        s3 = build_steps(sid + "-s3", False, [
            ("禁忌、毒性與交互作用", "Contraindications, toxicity and interactions",
             "辨識本藥的安全議題。", "Identify safety issues.",
             f"注意：{Hb['caution'] or '一般無特殊禁忌；孕婦、肝腎功能不全者仍應評估。'} 十八反、十九畏與中西藥交互作用。", f"Caution: {Hb['caution'] or 'no special contraindication; still assess pregnancy and hepatic/renal impairment.'} The eighteen incompatibilities, nineteen antagonisms and herb–drug interactions.",
             "完成安全檢核表。", "Complete a safety checklist.",
             "含馬兜鈴酸、重金屬或強毒性生物鹼的藥材須特別管制。", "Materials with aristolochic acid, heavy metals or potent alkaloids require special control.",
             "能說出禁忌與交互作用。", "Can state contraindications and interactions.",
             [kp("注意事項", "Caution", Hb["caution"] or "—", Hb["caution"] or "—")]),
            ("現代藥理與研究", "Modern pharmacology and research",
             "了解有效成分與現代研究。", "Learn active constituents and modern research.",
             "查詢主要成分、藥理作用與臨床試驗；評估品質（GMP、農藥重金屬檢驗）。", "Look up main constituents, pharmacology and trials; assess quality (GMP, pesticide and heavy-metal testing).",
             "整理一頁摘要。", "Write a one-page summary.",
             "成分研究不等於整體藥材療效。", "Constituent studies do not equal whole-herb efficacy.",
             "摘要完成。", "Summary complete.",
             [kp("品質", "Quality", "臺灣中藥典規範鑑別、含量與限量。", "The Taiwan Herbal Pharmacopeia specifies identification, assay and limits.")]),
        ])
        stages = [generic_stage(sid + "-s1", 1, "第一節 · 性味歸經與功效（免費試學）", "Section 1 · Properties and actions (free)", "基本藥性。", "Basic properties.", s1, True),
                  generic_stage(sid + "-s2", 2, "第二節 · 應用、配伍與用量", "Section 2 · Application, pairing and dosage", "臨床運用。", "Clinical use.", s2, False),
                  generic_stage(sid + "-s3", 3, "第三節 · 安全與現代研究", "Section 3 · Safety and modern research", "禁忌與證據。", "Cautions and evidence.", s3, False)]

    elif kind == "case":
        s1 = build_steps(sid + "-s1", True, [
            ("實習指引", "Internship guide",
             f"了解{short_zh}的流程與評分。", f"Understand the workflow and scoring of {short_en}.",
             f"{focus_zh}", f"{focus_en}",
             "閱讀評分規則並完成一次示範病例。", "Read the scoring rules and complete one demonstration case.",
             "未完成望聞問切就下結論會被扣分。", "Concluding before completing the four examinations loses marks.",
             "示範病例完成。", "Demonstration case complete.",
             [kp("實習級", "Internship tier", "實習級以虛擬病人實作：望、聞、問、切、把脈、看舌苔、主訴，然後辨證、開方與針灸處方。", "The internship tier practises on virtual patients: inspection, listening, inquiry, pulse, tongue, chief complaint, then pattern, prescription and acupuncture plan.")]),
        ])
        s2 = build_steps(sid + "-s2", False, [
            ("模擬門診：病例練習", "Simulated clinic: case practice",
             "在模擬門診完成至少三個病例。", "Complete at least three cases in the simulated clinic.",
             "開啟「實習門診」模擬器，依序完成接診→四診→辨證→治法→處方→醫囑，並檢視回饋。", "Open the internship clinic simulator and complete reception → four examinations → pattern → method → prescription → advice, then review the feedback.",
             "記錄每個病例的得分與錯誤。", "Record score and errors for each case.",
             "重複同一錯誤代表需回到基本級複習。", "Repeating the same error means returning to the basic tier.",
             "三個病例平均 ≥ 70 分。", "Three cases averaging ≥ 70%.",
             [kp("評分面向", "Scoring dimensions", "資料蒐集完整度、辨證正確性、治法方藥合理性、安全與醫囑。", "Completeness of data gathering, pattern accuracy, treatment rationale, safety and advice.")]),
            ("反思與師傅回饋", "Reflection and mentor feedback",
             "整理學習反思並向 AI 師傅提問。", "Write reflections and ask the AI mentor.",
             "列出三個不確定的判斷，向 AI 師傅詢問並核對教材。", "List three uncertain judgements, ask the AI mentor and verify against the curriculum.",
             "完成反思紀錄。", "Reflection record complete.",
             "AI 回答需與教材與指引核對。", "AI answers must be checked against the curriculum and guidelines.",
             "反思完成。", "Reflection complete.",
             [kp("AI 師傅", "AI mentor", "生成式 AI 用於解釋與提問，不作為診療依據。", "Generative AI is for explanation and questioning, not a basis for care.")]),
        ])
        stages = [generic_stage(sid + "-s1", 1, "第一節 · 實習指引（免費試學）", "Section 1 · Internship guide (free)", "流程與評分。", "Workflow and scoring.", s1, True),
                  generic_stage(sid + "-s2", 2, "第二節 · 模擬門診", "Section 2 · Simulated clinic", "虛擬病人實作。", "Virtual-patient practice.", s2, False)]
    else:
        raise ValueError(kind)

    # quizzes: correct = this step's check; distractors = other steps' checks
    all_steps = [s for st in stages for s in st["steps"]]
    for i, s in enumerate(all_steps):
        others = [o for o in all_steps if o is not s and o["check"] != s["check"]]
        rnd = h(s["id"])
        picks = []
        for k in range(3):
            if not others:
                break
            picks.append(others[(rnd + k * 7) % len(others)])
            others = [o for o in others if o not in picks]
        options = [(s["check"], s["checkEn"])] + [(o["check"], o["checkEn"]) for o in picks]
        order = sorted(range(len(options)), key=lambda j: h(s["id"] + str(j)))
        s["quiz"] = {"question": f"「{s['title']}」這一步的驗收標準是哪一項？", "questionEn": f"Which statement is the acceptance check for '{s['titleEn']}'?",
                     "options": [options[j][0] for j in order], "optionsEn": [options[j][1] for j in order], "answer": order.index(0),
                     "explanation": "驗收標準來自本步驟的目標；其他選項屬於其他步驟。", "explanationEn": "The check derives from this step's objective; the other options belong to other steps."}
    return stages


# ----------------------------------------------------------------------------- main build
def main():
    DATA.mkdir(parents=True, exist_ok=True)
    COURSES.mkdir(parents=True, exist_ok=True)
    icons = IconRegistry()
    catalog, departments, courses = [], [], {}
    step_total = 0

    def add_topic(dep, topic_id, zh, en, kind, focus_zh, focus_en, tiers, icon, sources, extra=None, flagship=False, tags=None, course_kind=None):
        nonlocal step_total
        stages = course_for(topic_id, None, dep, course_kind or kind, zh, en, focus_zh, focus_en, extra)
        steps = sum(len(s["steps"]) for s in stages)
        step_total += steps
        courses.setdefault(dep["id"], []).append({"id": topic_id, "title": zh, "titleEn": en, "department": dep["id"], "kind": kind, "stages": stages, "sources": sources, "tiers": tiers})
        catalog.append({"id": topic_id, "title": zh, "titleEn": en, "faculty": dep["faculty"], "department": dep["id"], "departmentTitle": dep["zh"], "departmentTitleEn": dep["en"],
                        "kind": kind, "tiers": tiers, "summary": focus_zh, "summaryEn": focus_en, "stepCount": steps, "stageCount": len(stages),
                        "estimatedMinutes": steps * 6, "freeStage": 1, "icon": icon, "flagship": flagship, "authored": topic_id in authored.CORE_STEPS, "tags": tags or [], "courseFile": f"courses/{dep['id']}.js"})

    def register_department(dep, count_hint=None):
        departments.append({"id": dep["id"], "title": dep["zh"], "titleEn": dep["en"], "faculty": dep["faculty"], "glyph": dep["glyph"], "accent": dep["accent"], "intro": dep["intro_zh"], "introEn": dep["intro_en"]})

    pubmed = lambda q: ("PubMed 搜尋 / PubMed search", f"https://pubmed.ncbi.nlm.nih.gov/?term={re.sub(r'[^a-zA-Z0-9 ]+', ' ', q).strip().replace(' ', '+')}")
    wiki_en = lambda q: ("Wikipedia (EN)", f"https://en.wikipedia.org/w/index.php?search={re.sub(r'[^a-zA-Z0-9 ]+', ' ', q).strip().replace(' ', '+')}")
    wiki_zh = lambda q: ("維基百科（中文）", f"https://zh.wikipedia.org/w/index.php?search={q.split('（')[0]}")

    for mod in (western_surgery, western_medicine, tcm, biomed, nobel):
        for dep in mod.DEPARTMENTS:
            register_department(dep)
            for idx, t in enumerate(dep["topics"]):
                topic_id = f"{dep['id']}-{t['suffix']}"
                tiers = ["basic"] + (["intern"] if t.get("intern") or t["kind"] in ("case", "skill") else [])
                glyph = pick_glyph(dep, t)
                icon = icons.assign(glyph, dep["accent"], topic_id, badge_for(t["en"], t["zh"], t["suffix"].upper()))
                src = [{"title": a, "url": b} for a, b in DEPT_SOURCES.get(dep["id"], [])]
                if t.get("url"):
                    src.insert(0, {"title": "原始資料 / Primary resource", "url": t["url"]})
                for a, b in (pubmed(t["en"]), wiki_en(t["en"]), wiki_zh(t["zh"])):
                    src.append({"title": a, "url": b})
                tags = [dep["faculty"], t["kind"]] + (["flagship"] if t.get("flagship") else [])
                if t.get("year"):
                    tags.append(str(t["year"]))
                add_topic(dep, topic_id, t["zh"], t["en"], t["kind"], t["focus_zh"], t["focus_en"], tiers, icon, src, flagship=bool(t.get("flagship")), tags=tags)

    # acupoints
    mer = {m[0]: m for m in acupoints.MERIDIANS}
    dep_acu = {"id": "acupoints", "zh": "十四經穴與奇穴（361 + 奇穴）", "en": "The 361 classical acupoints and extra points", "faculty": "tcm", "glyph": "acupoint", "accent": "#2e6f95",
               "intro_zh": "逐穴定位、針刺操作、主治與配伍；實習級於人體圖上定位。", "intro_en": "Point-by-point location, needling, indications and combinations; the internship tier locates them on the body map."}
    register_department(dep_acu)
    for idx, p in enumerate(acupoints.POINTS):
        code_prefix = re.match(r"[A-Z]+", p["code"]).group(0)
        m = mer[code_prefix]
        topic_id = "acu-" + slug(p["code"])
        extra = dict(p, meridian_zh=m[1], meridian_en=m[2])
        icon = icons.assign("acupoint", m[3], topic_id, p["code"].replace("EX-", "")[:4])
        src = [{"title": a, "url": b} for a, b in DEPT_SOURCES["acupoints"]] + [{"title": "WHO ICD-11 / TCM terminology", "url": "https://www.who.int/publications/i/item/9789240042322"}]
        src.append(dict(zip(("title", "url"), wiki_zh(p["zh"]))))
        add_topic(dep_acu, topic_id, f"{p['code']} {p['zh']}（{p['py']}）", f"{p['code']} {p['py']} ({p['zh']})", "acupoint",
                  f"{m[1]}。定位：{p['loc_zh']}。主治：{p['ind_zh']}。", f"{m[2]}. Location: {p['loc_en']}. Indications: {p['ind_en']}.",
                  ["basic", "intern"], icon, src, extra=extra, flagship=p["code"] in ("LI4", "ST36", "SP6", "PC6", "GV20", "GV26", "CV4", "BL40", "GB20", "LR3", "KI1", "HT7"),
                  tags=["tcm", "acupoint", code_prefix, m[1]])

    # herbs
    hcats = {c[0]: c for c in herbs.CATEGORIES}
    dep_herb = {"id": "herbs", "zh": "中藥學（常用藥材）", "en": "Chinese materia medica", "faculty": "tcm", "glyph": "herb-leaf", "accent": "#5b8a3c",
                "intro_zh": "依功效分類的常用中藥：性味歸經、功效、用量、炮製與禁忌。", "intro_en": "Commonly used medicinals by action category: properties, actions, dose, processing and cautions."}
    register_department(dep_herb)
    PART = [(r"子|仁|實|椒|豆|核|果", "herb-seed"), (r"花|蕊|蕾", "herb-flower"), (r"葉|草|藤|蒿|薄荷|藿香|佩蘭|茵陳|艾|桑葉|菊", "herb-leaf"),
            (r"石|硝|砂|黃$|硫|滑石|赭|龍骨|牡蠣|磁|礬|甘石|硼", "herb-mineral"), (r"蟲|蛭|蠍|蚣|蠶|龍$|蛇|蜂|蛤|鹿|龜|鱉|膠|茸|螵蛸|螵|房|角|骨|蛻", "herb-animal"), (r"皮|殼", "herb-bark")]
    for idx, hb in enumerate(herbs.HERBS):
        cat = hcats[hb["cat"]]
        topic_id = "herb-" + slug(hb["py"])
        glyph = "herb-root"
        for pat, g in PART:
            if re.search(pat, hb["zh"]):
                glyph = g
                break
        icon = icons.assign(glyph, cat[3], topic_id, hb["py"][:2].upper())
        src = [{"title": a, "url": b} for a, b in DEPT_SOURCES["herbs"]] + [dict(zip(("title", "url"), pubmed(hb["latin"]))), dict(zip(("title", "url"), wiki_zh(hb["zh"])))]
        add_topic(dep_herb, topic_id, f"{hb['zh']}（{hb['py']}）", f"{hb['py']} · {hb['latin']}", "herb",
                  f"{cat[1]}。{hb['nature']}，歸{hb['channels']}經。{hb['act_zh']}。常用量 {hb['dose']} g。", f"{cat[2]}. {hb['nature']}; channels: {hb['channels']}. {hb['act_en']}. Usual dose {hb['dose']} g.",
                  ["basic"], icon, src, extra=hb, flagship=hb["zh"] in ("人參", "黃耆", "當歸", "甘草", "麻黃", "附子", "大黃", "黃連", "柴胡", "丹參"), tags=["tcm", "herb", hb["cat"]])

    # formulas
    fcats = {c[0]: c for c in formulas.CATEGORIES}
    dep_fx = {"id": "formulas", "zh": "方劑學（經典名方）", "en": "Classical formulas", "faculty": "tcm", "glyph": "cauldron", "accent": "#a0522d",
              "intro_zh": "依治法分類的經典方劑：組成、方義、證治、加減與現代研究。", "intro_en": "Classical formulas by treatment category: composition, rationale, patterns, modifications and research."}
    register_department(dep_fx)
    for idx, fx in enumerate(formulas.FORMULAS):
        cat = fcats[fx["cat"]]
        topic_id = "fx-" + slug(fx["py"])
        icon = icons.assign("cauldron", cat[3], topic_id, "".join(w[0] for w in fx["py"].split()[:2]).upper())
        src = [{"title": a, "url": b} for a, b in DEPT_SOURCES["formulas"]] + [dict(zip(("title", "url"), pubmed(fx["py"]))), dict(zip(("title", "url"), wiki_zh(fx["zh"])))]
        add_topic(dep_fx, topic_id, f"{fx['zh']}（{fx['py']}）", f"{fx['py']} ({fx['zh']})", "formula",
                  f"{cat[1]}。出自{fx['source']}。組成：{fx['comp']}。{fx['act_zh']}；主治{fx['pat_zh']}。", f"{cat[2]}. From {fx['source']}. Composition: {fx['comp']}. {fx['act_en']}; for {fx['pat_en']}.",
                  ["basic"], icon, src, extra=fx, flagship=fx["zh"] in ("桂枝湯", "麻黃湯", "小柴胡湯", "四君子湯", "四物湯", "六味地黃丸", "補中益氣湯", "逍遙散", "血府逐瘀湯", "補陽還五湯"), tags=["tcm", "formula", fx["cat"]])

    # ---- write outputs
    def write_json_js(path: Path, obj, js_global: str, key=None):
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        js = path.with_suffix(".js")
        payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        if key:
            js.write_text(f"window.{js_global}=window.{js_global}||{{}};window.{js_global}[{json.dumps(key)}]={payload};", encoding="utf-8")
        else:
            js.write_text(f"window.{js_global}={payload};", encoding="utf-8")

    for old in COURSES.glob("*"):
        old.unlink()
    for dep_id, items in courses.items():
        write_json_js(COURSES / f"{dep_id}.json", items, "HT_COURSES", key=dep_id)
    write_json_js(DATA / "catalog.json", catalog, "HT_CATALOG")
    write_json_js(DATA / "departments.json", {"faculties": FACULTIES, "departments": departments}, "HT_DEPARTMENTS")
    write_json_js(DATA / "tcm-library.json", {"meridians": [dict(zip(("code", "zh", "en", "color", "scope_zh", "scope_en"), m)) for m in acupoints.MERIDIANS],
                                                "points": acupoints.POINTS,
                                                "herbCategories": [dict(zip(("id", "zh", "en", "color"), c)) for c in herbs.CATEGORIES], "herbs": herbs.HERBS,
                                                "formulaCategories": [dict(zip(("id", "zh", "en", "color"), c)) for c in formulas.CATEGORIES], "formulas": formulas.FORMULAS}, "HT_TCM")
    counts = {"version": VERSION, "date": DATE, "topics": len(catalog), "departments": len(departments), "faculties": len(FACULTIES),
              "guidedCourses": len(catalog), "allSteps": step_total, "freeStages": len(catalog), "internshipTopics": sum(1 for c in catalog if "intern" in c["tiers"]),
              "flagshipTopics": sum(1 for c in catalog if c["flagship"]), "authoredCoreCourses": sum(1 for c in catalog if c.get("authored")), "acupoints": len(acupoints.POINTS), "classicalAcupoints": 361, "herbs": len(herbs.HERBS), "formulas": len(formulas.FORMULAS),
              "nobelMedicine": len(nobel.MEDICINE), "nobelChemistry": len(nobel.CHEMISTRY), "researchTechniques": len(nobel.TECHNIQUES), "uniqueIcons": len(icons.seen),
              "curriculumScope": "Educational decompositions generated from authored topic data and kind-specific templates; not clinical protocols, not a substitute for supervised training or licensure.",
              "iconScope": "Original monoline SVG icon system: every topic has a unique (glyph, accent, ring, dots, flip, badge) descriptor verified at build time. No third-party icon sets are bundled.",
              "languageScope": "Traditional Chinese and English authored core; interface strings in 36 languages; other languages for content require the configured AI translation route.",
              "billingScope": "First section of every course is free; remaining sections require an active pass. Live checkout requires the operator's configured gateway.",
              "aiScope": "Optional generative tutor through configured routes (OpenAI-compatible, Anthropic, Gemini, llama.cpp, Ollama). No weights or keys bundled."}
    (DATA / "release.json").write_text(json.dumps(counts, ensure_ascii=False, indent=2), encoding="utf-8")
    # catalog index csv for humans
    with (DATA / "catalog-index.csv").open("w", encoding="utf-8-sig") as f:
        f.write("id,title_zh,title_en,faculty,department,kind,tiers,steps,flagship\n")
        for c in catalog:
            f.write(",".join([c["id"], '"' + c["title"].replace('"', '""') + '"', '"' + c["titleEn"].replace('"', '""') + '"', c["faculty"], c["department"], c["kind"], "+".join(c["tiers"]), str(c["stepCount"]), "1" if c["flagship"] else "0"]) + "\n")
    print(json.dumps(counts, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
