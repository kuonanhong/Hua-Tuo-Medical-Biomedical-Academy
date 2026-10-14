"""Local retrieval for the AI mentor. No network, no embeddings, no execution of documents.

Two sources feed the generative tutor as untrusted reference passages:
  * KnowledgeIndex   – portable/data/knowledge.json built by tools/index_documents.py from
                       local-documents/ (PDF, DOCX, PPTX, TXT, MD, CSV, JSON).
  * CurriculumIndex  – the academy's own catalog and step files (public/academy/data), so a
                       question about "LI4" or "CABG" retrieves the matching course steps.
Both use the same bilingual keyword scoring (Latin tokens + Chinese bigrams).
"""
import json
import math
import re
import threading
import time
from pathlib import Path

STOP = {"the", "and", "for", "with", "this", "that", "from", "what", "how", "why", "into", "please", "about", "does", "which", "when", "are", "was", "can", "you", "your",
        "is", "it", "in", "of", "to", "on", "at", "by", "or", "an", "as", "be", "do", "we", "me", "my", "if", "so", "up", "used", "use", "tell", "explain", "step", "steps"}


def terms(text):
    latin = {x for x in re.findall(r"[a-z][a-z0-9_-]{1,}", str(text).casefold()) if x not in STOP}
    chinese = set()
    for run in re.findall(r"[㐀-鿿]+", str(text)):
        chinese.update(run[i:i + 2] for i in range(len(run) - 1))
        if len(run) == 1:
            chinese.add(run)
    return latin | chinese


def score(query_terms, doc_terms, idf=None):
    """IDF-weighted overlap with gentle length normalisation (short documents are not favoured)."""
    matched = query_terms & doc_terms
    if not matched:
        return 0.0
    weight = sum((idf or {}).get(t, 1.0) for t in matched)
    return weight / (max(len(doc_terms), 1) ** 0.25)


class KnowledgeIndex:
    def __init__(self, path):
        self.path = Path(path)
        self.stamp = None
        self.rows = []
        self.lock = threading.Lock()

    def available(self):
        return self.path.is_file()

    def _reload(self):
        stamp = self.path.stat().st_mtime_ns
        if stamp == self.stamp:
            return
        if self.path.stat().st_size > 64 * 1024 * 1024:
            self.rows, self.stamp = [], stamp
            return
        doc = json.loads(self.path.read_text(encoding="utf-8"))
        rows = doc.get("chunks") if isinstance(doc, dict) and doc.get("version") == 1 else None
        if not isinstance(rows, list) or len(rows) > 50000:
            self.rows, self.stamp = [], stamp
            return
        self.rows = [(r, terms(r["text"])) for r in rows
                     if isinstance(r, dict) and isinstance(r.get("text"), str) and isinstance(r.get("source"), str)
                     and 0 < len(r["source"]) <= 500 and len(r["text"]) <= 1600
                     and isinstance(r.get("page", 1), int) and not isinstance(r.get("page", 1), bool) and 0 < r.get("page", 1) <= 1_000_000]
        self.stamp = stamp

    def search(self, query, limit=4):
        with self.lock:
            try:
                if not self.path.is_file():
                    return []
                self._reload()
            except (OSError, ValueError, TypeError, KeyError):
                return []
            q = terms(query)
            if not q:
                return []
            minimum = 1 if len(q) <= 2 else 2
            scored = [(score(q, words), row) for row, words in self.rows if len(q & words) >= minimum]
            scored.sort(key=lambda pair: pair[0], reverse=True)
            return [{k: r[k] for k in ("source", "page", "text") if k in r} for _, r in scored[:limit]]


class CurriculumIndex:
    """Searches catalog summaries, then loads the matching course file for step detail."""

    def __init__(self, public_root):
        self.root = Path(public_root)
        self.lock = threading.Lock()
        self.items = []
        self.idf = {}
        self.loaded_at = 0
        self.course_cache = {}

    def _load(self):
        path = self.root / "data" / "catalog.json"
        if not path.is_file():
            self.items = []
            return
        stamp = path.stat().st_mtime_ns
        if stamp == self.loaded_at:
            return
        catalog = json.loads(path.read_text(encoding="utf-8"))
        self.items = []
        df = {}
        for c in catalog:
            if not isinstance(c, dict) or not isinstance(c.get("id"), str):
                continue
            hay = " ".join(str(c.get(k, "")) for k in ("id", "title", "titleEn", "summary", "summaryEn", "departmentTitle", "departmentTitleEn")) + " " + " ".join(c.get("tags", []) or [])
            words = terms(hay)
            title_words = terms(" ".join(str(c.get(k, "")) for k in ("title", "titleEn")) + " " + c["id"].replace("-", " "))
            self.items.append((c, words, title_words))
            for w in words:
                df[w] = df.get(w, 0) + 1
        n = max(len(self.items), 1)
        self.idf = {w: math.log(1 + n / d) for w, d in df.items()}
        self.loaded_at = stamp
        self.course_cache = {}

    def _course(self, item):
        file = re.sub(r"\.js$", ".json", item.get("courseFile") or f"courses/{item.get('department')}.json")
        dep = item.get("department")
        with self.lock:
            if dep not in self.course_cache:
                path = (self.root / "data" / file).resolve()
                try:
                    if not path.is_relative_to((self.root / "data").resolve()):
                        return None
                    courses = json.loads(path.read_text(encoding="utf-8"))
                    self.course_cache[dep] = {c["id"]: c for c in courses if isinstance(c, dict) and "id" in c}
                except (OSError, ValueError, TypeError, KeyError):
                    self.course_cache[dep] = {}
            return self.course_cache[dep].get(item["id"])

    def search(self, query, language="zh-TW", limit=3, max_chars=3600):
        try:
            with self.lock:
                self._load()
        except (OSError, ValueError, TypeError):
            return []
        q = terms(query)
        if not q:
            return []
        zh = str(language).lower().startswith("zh")
        # Exact point / formula codes such as LI4, ST36, 四君子湯 score first.
        scored = []
        for item, words, title_words in self.items:
            s = score(q, words, self.idf)
            if s <= 0:
                continue
            # Title hits and exact identifiers (LI4, cabg, tka) count extra.
            s += 0.6 * sum(self.idf.get(t, 1.0) for t in q & title_words)
            ident = item["id"].lower()
            for token in q:
                if token == ident or ident.endswith("-" + token):
                    s += 6
            scored.append((s, item))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        passages = []
        budget = max_chars
        top = scored[0][0] if scored else 0
        for s, item in scored[:limit]:
            if s < 0.4 * top:
                break
            title = item.get("title" if zh else "titleEn") or item.get("titleEn") or item.get("title")
            summary = item.get("summary" if zh else "summaryEn") or item.get("summaryEn") or ""
            text = f"{title}: {summary}"
            course = self._course(item)
            if course:
                lines = []
                for stage in course.get("stages", [])[:4]:
                    for step in stage.get("steps", [])[:6]:
                        t = step.get("title" if zh else "titleEn") or step.get("titleEn") or ""
                        ins = step.get("instruction" if zh else "instructionEn") or step.get("instructionEn") or ""
                        chk = step.get("check" if zh else "checkEn") or step.get("checkEn") or ""
                        lines.append(f"- {t}: {ins} ({'驗收' if zh else 'check'}: {chk})")
                text += "\n" + "\n".join(lines)
            text = text[:1400]
            if len(text) > budget:
                break
            budget -= len(text)
            passages.append({"source": "curriculum:" + item["id"], "title": title, "text": text})
        return passages


def cheap_summary(question, passages, language):
    """Deterministic fallback used when no generative route is configured."""
    zh = str(language).lower().startswith("zh")
    if not passages:
        return "教材中沒有直接相符的主題；請改用課程名稱、穴位代碼或手術名稱提問。" if zh else "No matching topic in the curriculum; try a course name, point code or operation name."
    head = "依教材整理（非生成式回答）：\n" if zh else "From the curriculum (not a generative answer):\n"
    return head + "\n\n".join(p["text"] for p in passages[:3])


__all__ = ["KnowledgeIndex", "CurriculumIndex", "terms", "cheap_summary", "time"]
