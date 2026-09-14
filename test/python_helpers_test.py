"""Host-side helper checks only; does not emulate PixelMug or validate MicroPython hardware."""
import contextlib
import io
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import traceback
import types
import unittest

STUDIO = Path(__file__).resolve().parent.parent

class HelpersTest(unittest.TestCase):
    def sandbox(self, root):
        def path(value):
            target = (root / str(value).lstrip("/")).resolve()
            if target != root and root not in target.parents:
                raise ValueError("outside test workspace")
            return target
        fake = types.SimpleNamespace(
            chdir=lambda value: path(value),
            stat=lambda value: os.stat(path(value)),
            listdir=lambda value: os.listdir(path(value)),
            remove=lambda value: os.remove(path(value)),
            rmdir=lambda value: os.rmdir(path(value)),
        )
        return path, fake

    def test_cleanup_preserves_only_root_startup_files(self):
        source = (STUDIO / "deploy.mjs").read_text(encoding="utf-8")
        clean = re.search(r"export const CLEAN = \x60(.*?)\x60;", source, re.S).group(1)
        with tempfile.TemporaryDirectory(prefix="studio-clean-") as directory:
            root = Path(directory).resolve()
            for name in ("boot.py", "webrepl_cfg.py", "old.py"):
                (root / name).write_text(name, encoding="utf-8")
            (root / "nested").mkdir()
            (root / "nested" / "boot.py").write_text("old", encoding="utf-8")
            _, fake = self.sandbox(root)
            original = sys.modules["os"]
            try:
                sys.modules["os"] = fake
                with contextlib.redirect_stdout(io.StringIO()):
                    exec(compile(clean, "device-clean", "exec"), {})
            finally:
                sys.modules["os"] = original
            self.assertEqual(sorted(p.name for p in root.iterdir()), ["boot.py", "webrepl_cfg.py"])
            self.assertEqual((root / "webrepl_cfg.py").read_text(), "webrepl_cfg.py")

    def check_bootstrap(self, program):
        with tempfile.TemporaryDirectory(prefix="studio-boot-") as directory:
            root = Path(directory).resolve()
            (root / "__main__.py").write_text(program, encoding="utf-8")
            path, fake = self.sandbox(root)
            namespace = {"open": lambda name, *args: open(path(name), *args)}
            original = sys.modules["os"]
            previous = getattr(sys, "print_exception", None)
            output = io.StringIO()
            try:
                sys.modules["os"] = fake
                sys.print_exception = lambda error: traceback.print_exception(error, file=sys.stdout)
                exec(compile((STUDIO / "src" / "device-bootstrap.py").read_text(encoding="utf-8"), "device-bootstrap.py", "exec"), namespace)
                with contextlib.redirect_stdout(output):
                    namespace["run"]("test-launch", "test-nonce")
            finally:
                sys.modules["os"] = original
                if previous is None:
                    del sys.print_exception
                else:
                    sys.print_exception = previous
            result = output.getvalue()
            events = [json.loads(line.split("STUDIO:test-nonce:", 1)[1]) for line in result.split("\n") if "STUDIO:test-nonce:" in line]
            return result, [event["state"] for event in events]

    def test_bootstrap_normal_exit(self):
        output, states = self.check_bootstrap('print(__name__, __file__)')
        self.assertEqual(states, ["running", "completed"])
        self.assertIn("__main__ /__main__.py", output)

    def test_bootstrap_preserves_traceback_filename(self):
        output, states = self.check_bootstrap('raise RuntimeError("test failure")')
        self.assertEqual(states, ["running", "failed"])
        self.assertIn('/__main__.py", line 1', output)

    def test_syntax_error_does_not_report_running(self):
        _, states = self.check_bootstrap("if:")
        self.assertEqual(states, ["failed"])

if __name__ == "__main__":
    unittest.main()

