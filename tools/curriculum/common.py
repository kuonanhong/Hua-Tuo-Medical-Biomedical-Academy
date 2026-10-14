"""Shared helpers for the Hua Tuo curriculum source modules.

Each department is a dict produced by D(); each topic is a dict produced by T().
Kinds drive the step-template chosen by build_curriculum.py:
  procedure  surgical / interventional procedure (indication → pre-op → steps → post-op)
  technique  bedside / laboratory / imaging technique
  device     implant, instrument or medical device
  test       laboratory or physiological test and its interpretation
  concept    disease mechanism, physiology, theory
  skill      hands-on clinical skill (nursing, emergency, examination)
  acupoint   acupuncture point
  manual     tuina / massage / manipulation technique
  formula    classical herbal formula
  herb       single medicinal
  syndrome   TCM pattern / disorder
  classic    TCM classic text or physician
  prize      Nobel-prize discovery
  research   research technique (PCR, cryo-EM …)
  ai         machine-learning / computational method
  case       internship case family
"""

KINDS = ("procedure", "technique", "device", "test", "concept", "skill", "acupoint", "manual",
         "formula", "herb", "syndrome", "classic", "prize", "research", "ai", "case")


def T(suffix, zh, en, kind, focus_zh, focus_en, **extra):
    assert kind in KINDS, kind
    topic = {"suffix": suffix, "zh": zh, "en": en, "kind": kind, "focus_zh": focus_zh, "focus_en": focus_en}
    topic.update(extra)
    return topic


def D(dep_id, zh, en, faculty, glyph, accent, intro_zh, intro_en, topics, **extra):
    dep = {"id": dep_id, "zh": zh, "en": en, "faculty": faculty, "glyph": glyph, "accent": accent,
           "intro_zh": intro_zh, "intro_en": intro_en, "topics": topics}
    dep.update(extra)
    return dep
