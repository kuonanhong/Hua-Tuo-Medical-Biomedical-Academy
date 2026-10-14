#!/usr/bin/env python3
"""Run the test suite without pytest: python3 tests/run_tests.py  (pytest is used automatically when installed)."""
import importlib
import inspect
import os
import shutil
import sys
import tempfile
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

try:
    import pytest  # noqa: F401
    sys.exit(os.system(f"{sys.executable} -m pytest -q {HERE}") >> 8)
except ImportError:
    pass


class MonkeyPatch:
    def __init__(self):
        self.saved = {}

    def setenv(self, key, value):
        self.saved.setdefault(key, os.environ.get(key))
        os.environ[key] = value

    def delenv(self, key, raising=True):
        self.saved.setdefault(key, os.environ.get(key))
        os.environ.pop(key, None)

    def undo(self):
        for key, value in self.saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def main():
    conftest = importlib.import_module("conftest")
    modules = [importlib.import_module(p.stem) for p in sorted(HERE.glob("test_*.py"))]
    fixtures = {name: obj for name, obj in vars(conftest).items() if getattr(obj, "_is_fixture", False)}
    passed, failed = 0, []
    for module in modules:
        for name, func in sorted(vars(module).items()):
            if not name.startswith("test_") or not callable(func):
                continue
            tmp = Path(tempfile.mkdtemp(prefix="huatuo-test-"))
            patch = MonkeyPatch()
            generators = []
            kwargs = {}
            try:
                for param in inspect.signature(func).parameters:
                    if param == "tmp_path":
                        kwargs[param] = tmp
                    elif param == "monkeypatch":
                        kwargs[param] = patch
                    elif param in fixtures:
                        fx = fixtures[param]
                        fx_kwargs = {}
                        for fp in inspect.signature(fx).parameters:
                            fx_kwargs[fp] = tmp if fp == "tmp_path" else patch if fp == "monkeypatch" else None
                        gen = fx(**fx_kwargs)
                        if inspect.isgenerator(gen):
                            kwargs[param] = next(gen)
                            generators.append(gen)
                        else:
                            kwargs[param] = gen
                    else:
                        raise RuntimeError(f"unknown fixture {param}")
                func(**kwargs)
                passed += 1
                print(f"PASS {module.__name__}.{name}")
            except Exception:
                failed.append(f"{module.__name__}.{name}")
                print(f"FAIL {module.__name__}.{name}\n{traceback.format_exc()}")
            finally:
                for gen in generators:
                    try:
                        next(gen)
                    except StopIteration:
                        pass
                patch.undo()
                shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{passed} passed, {len(failed)} failed")
    if failed:
        print("\n".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
