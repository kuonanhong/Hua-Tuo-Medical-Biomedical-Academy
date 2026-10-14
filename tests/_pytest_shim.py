"""Tiny stand-in used only when pytest is not installed (python3 tests/run_tests.py)."""
def fixture(func=None, **kwargs):
    def wrap(f):
        f._is_fixture = True
        return f
    return wrap(func) if func else wrap
