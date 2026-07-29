import os
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == "nt", "source ZIP packaging runs on Windows")
class PackagingBehaviorTests(unittest.TestCase):
    def test_windows_build_script_parses_in_windows_powershell(self):
        powershell = shutil.which("powershell")
        self.assertIsNotNone(powershell)
        script = PROJECT_ROOT / "scripts" / "build_windows.ps1"
        command = (
            "$ErrorActionPreference='Stop'; "
            f"$text=Get-Content -Raw -LiteralPath '{script}'; "
            "[void][scriptblock]::Create($text)"
        )

        result = subprocess.run(
            [powershell, "-NoProfile", "-Command", command],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
        )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}",
        )

    def test_macos_source_script_builds_a_complete_source_only_archive(self):
        powershell = shutil.which("powershell")
        self.assertIsNotNone(powershell)
        script = PROJECT_ROOT / "scripts" / "package_macos_source.ps1"
        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                [
                    powershell,
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(script),
                    "-OutputDirectory",
                    temp_dir,
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
                check=False,
            )
            self.assertEqual(
                result.returncode,
                0,
                msg=f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}",
            )
            archive = Path(temp_dir) / "ClickFlow-macOS-build.zip"
            self.assertTrue(archive.is_file())

            with zipfile.ZipFile(archive) as package:
                names = {name.replace("\\", "/") for name in package.namelist()}

        required = {
            "ClickFlow-macOS-build/auto_clicker.py",
            "ClickFlow-macOS-build/clickflow_core.py",
            "ClickFlow-macOS-build/clickflow_input.py",
            "ClickFlow-macOS-build/clickflow_theme.py",
            "ClickFlow-macOS-build/ClickFlow.spec",
            "ClickFlow-macOS-build/requirements.txt",
            "ClickFlow-macOS-build/requirements-build.txt",
            "ClickFlow-macOS-build/build_macos.sh",
            "ClickFlow-macOS-build/README-macOS.md",
            "ClickFlow-macOS-build/tests/test_clickflow_input.py",
        }
        self.assertTrue(required.issubset(names), required - names)
        self.assertFalse(
            any(name.endswith((".app", ".exe")) for name in names),
            names,
        )
        self.assertFalse(
            any("__pycache__/" in name or name.endswith(".pyc") for name in names),
            names,
        )


if __name__ == "__main__":
    unittest.main()
