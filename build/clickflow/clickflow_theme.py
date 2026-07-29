from __future__ import annotations

import json
import os
import platform
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Optional


THEME_CHOICES = ("system", "light", "dark")
THEME_LABELS = {
    "system": "跟随系统",
    "light": "明亮主题",
    "dark": "深色主题",
}
THEME_VALUES_BY_LABEL = {label: value for value, label in THEME_LABELS.items()}


@dataclass(frozen=True)
class ThemePalette:
    background: str
    card: str
    card_alt: str
    text: str
    muted: str
    border: str
    accent: str
    accent_hover: str
    accent_text: str
    danger: str
    danger_hover: str
    field: str
    selected: str
    success: str
    warning: str


LIGHT_PALETTE = ThemePalette(
    background="#F5F3FA",
    card="#FFFFFF",
    card_alt="#F8F7FC",
    text="#211D2B",
    muted="#736C7D",
    border="#DED9E7",
    accent="#6D5CE7",
    accent_hover="#5E4BD8",
    accent_text="#FFFFFF",
    danger="#C93D59",
    danger_hover="#B12F49",
    field="#FBFAFD",
    selected="#ECE8FF",
    success="#26866B",
    warning="#B36A16",
)

DARK_PALETTE = ThemePalette(
    background="#17151D",
    card="#211E28",
    card_alt="#292530",
    text="#F4F0FA",
    muted="#B2AABB",
    border="#3D3746",
    accent="#6D5CE7",
    accent_hover="#8272F2",
    accent_text="#FFFFFF",
    danger="#F06A82",
    danger_hover="#FF7F95",
    field="#1B1821",
    selected="#37304F",
    success="#5FD0AB",
    warning="#F0B05C",
)


def normalize_theme(value: object) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        normalized = THEME_VALUES_BY_LABEL.get(value.strip(), normalized)
        if normalized in THEME_CHOICES:
            return normalized
    return "system"


def _detect_windows_theme() -> str:
    try:
        import winreg

        key_path = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
        return "light" if int(value) else "dark"
    except (OSError, TypeError, ValueError):
        return "light"


def detect_windows_theme() -> str:
    """Compatibility wrapper for callers from ClickFlow 2.0."""

    return _detect_windows_theme()


def detect_system_theme(
    system_name: Optional[str] = None,
    *,
    run: Optional[Callable[..., object]] = None,
) -> str:
    system = system_name or platform.system()
    if system == "Windows":
        return _detect_windows_theme()
    if system == "Darwin":
        runner = run or subprocess.run
        try:
            result = runner(
                ["defaults", "read", "-g", "AppleInterfaceStyle"],
                capture_output=True,
                text=True,
                timeout=1.0,
                check=False,
            )
            return (
                "dark"
                if str(getattr(result, "stdout", "")).strip().lower() == "dark"
                else "light"
            )
        except (OSError, subprocess.SubprocessError, TypeError, ValueError):
            return "light"
    return "light"


def settings_path(
    system_name: Optional[str] = None,
    *,
    environ: Optional[Mapping[str, str]] = None,
    home: Optional[Path] = None,
) -> Path:
    system = system_name or platform.system()
    environment = os.environ if environ is None else environ
    home_path = Path.home() if home is None else Path(home)
    if system == "Windows":
        base = environment.get("APPDATA")
        root = Path(base) if base else home_path / "AppData" / "Roaming"
    elif system == "Darwin":
        root = home_path / "Library" / "Application Support"
    else:
        root = home_path / ".config"
    return root / "ClickFlow" / "settings.json"


def load_theme(path: Optional[Path] = None) -> str:
    target = path or settings_path()
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return "system"
    if not isinstance(raw, dict):
        return "system"
    return normalize_theme(raw.get("theme"))


def save_theme(path: Path, value: object) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {"theme": normalize_theme(value)}
    target.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def palette_for(
    value: object,
    *,
    system_theme: Optional[str] = None,
) -> ThemePalette:
    choice = normalize_theme(value)
    if choice == "system":
        choice = normalize_theme(system_theme or detect_system_theme())
        if choice == "system":
            choice = "light"
    return DARK_PALETTE if choice == "dark" else LIGHT_PALETTE
