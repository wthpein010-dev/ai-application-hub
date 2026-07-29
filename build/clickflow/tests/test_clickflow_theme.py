import tempfile
import unittest
from pathlib import Path, PureWindowsPath
from types import SimpleNamespace
from unittest.mock import patch

from clickflow_theme import (
    detect_system_theme,
    load_theme,
    normalize_theme,
    palette_for,
    save_theme,
    settings_path,
)


class ThemeSettingsTests(unittest.TestCase):
    def test_invalid_theme_normalizes_to_system(self):
        self.assertEqual(normalize_theme("unknown"), "system")
        self.assertEqual(normalize_theme(None), "system")

    def test_theme_round_trip(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "settings.json"

            save_theme(path, "dark")

            self.assertEqual(load_theme(path), "dark")
            self.assertEqual(path.read_text(encoding="utf-8"), '{\n  "theme": "dark"\n}')

    def test_malformed_settings_fall_back_to_system(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "settings.json"
            path.write_text("{broken", encoding="utf-8")

            self.assertEqual(load_theme(path), "system")

    def test_system_palette_uses_detected_theme_choice(self):
        self.assertEqual(
            palette_for("system", system_theme="dark"),
            palette_for("dark"),
        )
        self.assertEqual(
            palette_for("system", system_theme="light"),
            palette_for("light"),
        )

    def test_light_and_dark_palettes_keep_the_same_accent_identity(self):
        light = palette_for("light")
        dark = palette_for("dark")

        self.assertEqual(light.accent, dark.accent)
        self.assertNotEqual(light.background, dark.background)
        self.assertNotEqual(light.text, dark.text)

    def test_windows_settings_path_uses_appdata(self):
        path = settings_path(
            system_name="Windows",
            environ={"APPDATA": r"C:\Users\Test\AppData\Roaming"},
            home=Path(r"C:\Users\Test"),
        )

        self.assertEqual(
            PureWindowsPath(path),
            PureWindowsPath(r"C:\Users\Test\AppData\Roaming\ClickFlow\settings.json"),
        )

    def test_macos_settings_path_uses_application_support(self):
        path = settings_path(
            system_name="Darwin",
            environ={},
            home=Path("/Users/test"),
        )

        self.assertEqual(
            path,
            Path("/Users/test/Library/Application Support/ClickFlow/settings.json"),
        )

    def test_windows_system_theme_uses_platform_detector(self):
        with patch("clickflow_theme._detect_windows_theme", return_value="dark"):
            self.assertEqual(detect_system_theme("Windows"), "dark")

    def test_macos_dark_appearance_is_detected(self):
        calls = []

        def fake_run(command, **kwargs):
            calls.append((command, kwargs))
            return SimpleNamespace(stdout="Dark\n")

        result = detect_system_theme("Darwin", run=fake_run)

        self.assertEqual(result, "dark")
        self.assertEqual(
            calls[0][0],
            ["defaults", "read", "-g", "AppleInterfaceStyle"],
        )

    def test_theme_detection_failures_and_unknown_platform_fall_back_to_light(self):
        def failed_run(_command, **_kwargs):
            raise OSError("defaults unavailable")

        self.assertEqual(
            detect_system_theme("Darwin", run=failed_run),
            "light",
        )
        self.assertEqual(detect_system_theme("Linux"), "light")


if __name__ == "__main__":
    unittest.main()
