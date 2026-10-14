#!/usr/bin/env python3
"""Build the local AI reference index from local-documents/ (教材、講義、指引 PDF/DOCX/PPTX/TXT/MD/CSV/JSON).

The originals and the index stay outside the public web root; the AI mentor retrieves matching
passages and cites file name + page. Scanned PDFs without a text layer need OCR first.
"""
import argparse
import hashlib
import json
import os
import re
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUPPORTED = {".pdf", ".txt", ".md", ".csv", ".json", ".pptx", ".docx"}


def pages(path):
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".json"}:
        yield 1, path.read_text(encoding="utf-8-sig", errors="replace")
    elif suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError("PDF import needs: python3 -m pip install -r requirements-documents.txt") from None
        for i, page in enumerate(PdfReader(path).pages, 1):
            yield i, page.extract_text() or ""
    elif suffix in {".pptx", ".docx"}:
        with zipfile.ZipFile(path) as archive:
            if suffix == ".docx":
                names = ["word/document.xml"]
            else:
                names = sorted([n for n in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)], key=lambda n: int(re.search(r"(\d+)\.xml", n).group(1)))
            for i, name in enumerate(names, 1):
                if archive.getinfo(name).file_size > 16 * 1024 * 1024:
                    raise ValueError("Oversized XML part")
                tree = ET.fromstring(archive.read(name))
                yield i, "\n".join(n.text or "" for n in tree.iter() if n.tag.endswith("}t"))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "local-documents")
    parser.add_argument("--output", type=Path, default=ROOT / "portable/data/knowledge.json")
    parser.add_argument("--chunk", type=int, default=1100, help="characters per passage")
    args = parser.parse_args(argv)
    if not args.source.is_dir():
        parser.error("Source folder is missing. Create local-documents/ and add files, or pass --source DIRECTORY.")
    chunks, documents, skipped = [], [], []
    for path in sorted(args.source.rglob("*")):
        if path.is_symlink() or not path.is_file() or path.suffix.lower() not in SUPPORTED:
            continue
        relative = path.relative_to(args.source)
        if any(part.startswith(".") for part in relative.parts) or path.name == "README.md":
            continue
        if path.stat().st_size > 120 * 1024 * 1024:
            skipped.append({"file": str(relative), "reason": "File exceeds 120 MiB"})
            continue
        current = []
        try:
            for number, body in pages(path):
                body = re.sub(r"\s+", " ", body).strip()
                step = max(300, args.chunk - 120)
                for offset in range(0, len(body), step):
                    fragment = body[offset:offset + args.chunk]
                    if len(fragment) >= 30:
                        current.append({"source": str(relative), "page": number, "text": fragment})
            if not current:
                skipped.append({"file": str(relative), "reason": "No embedded text; scanned files need OCR first."})
                continue
            chunks.extend(current)
            documents.append({"file": str(relative), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "chunks": len(current)})
        except Exception as error:
            skipped.append({"file": str(relative), "reason": str(error)[:180]})
    if len(chunks) > 50000:
        parser.error("Index exceeds 50,000 passages; split the collection. Existing index retained.")
    if not chunks:
        print(json.dumps({"indexed": 0, "skipped": skipped}, ensure_ascii=False, indent=2))
        parser.error("No indexable content; existing index retained.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps({"version": 1, "documents": documents, "chunks": chunks, "skipped": skipped}, ensure_ascii=False)
    if len(encoded.encode()) > 64 * 1024 * 1024:
        parser.error("Index exceeds 64 MiB; existing index retained.")
    fd, temporary = tempfile.mkstemp(prefix="knowledge-", suffix=".tmp", dir=args.output.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            file.write(encoded)
        os.replace(temporary, args.output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps({"indexedDocuments": len(documents), "passages": len(chunks), "output": str(args.output), "skipped": skipped}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
