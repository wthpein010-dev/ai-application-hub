from __future__ import annotations

import time
from typing import Callable, Optional


try:
    from pynput.mouse import Button as _PynputButton
    from pynput.mouse import Controller as _PynputController
    from pynput.mouse import Listener as _PynputListener
except Exception as exc:  # pragma: no cover - depends on host input services
    _PynputButton = None
    _PynputController = None
    _PynputListener = None
    _PYNPUT_IMPORT_ERROR: Optional[BaseException] = exc
else:
    _PYNPUT_IMPORT_ERROR = None


class InputControlError(RuntimeError):
    """A mouse-input failure that can be shown directly in the UI."""


def button_name(button: object, button_type: object = None) -> Optional[str]:
    buttons = button_type or _PynputButton
    if buttons is None:
        return None
    for name in ("left", "right", "middle"):
        candidate = getattr(buttons, name, None)
        if button is candidate or button == candidate:
            return name
    return None


class PynputMouse:
    def __init__(
        self,
        *,
        controller: object = None,
        button_type: object = None,
        listener_type: object = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self._buttons = button_type or _PynputButton
        self._listener_type = listener_type or _PynputListener
        self._sleep = sleep

        if controller is None:
            if _PynputController is None:
                raise InputControlError(
                    "鼠标输入组件不可用，请重新安装或重新构建 ClickFlow。"
                ) from _PYNPUT_IMPORT_ERROR
            try:
                controller = _PynputController()
            except Exception as exc:
                raise InputControlError("初始化鼠标输入组件失败。") from exc

        if self._buttons is None or self._listener_type is None:
            raise InputControlError(
                "鼠标输入组件不可用，请重新安装或重新构建 ClickFlow。"
            ) from _PYNPUT_IMPORT_ERROR
        self._controller = controller

    def get_cursor_pos(self) -> tuple[int, int]:
        try:
            x, y = self._controller.position
            return int(x), int(y)
        except Exception as exc:
            raise InputControlError("读取鼠标位置失败。") from exc

    def set_cursor_pos(self, x: int, y: int) -> None:
        try:
            self._controller.position = (int(x), int(y))
        except Exception as exc:
            raise InputControlError("设置鼠标位置失败。") from exc

    def click(
        self,
        x: int,
        y: int,
        button: str = "left",
        hold_ms: int = 20,
        restore_cursor: bool = True,
    ) -> None:
        if button not in ("left", "right", "middle"):
            raise InputControlError(f"不支持的鼠标按键：{button}")

        original = self.get_cursor_pos()
        target = (int(x), int(y))
        moved = target != original
        try:
            if moved:
                self.set_cursor_pos(*target)
                self._sleep(0.004)
            self._controller.press(getattr(self._buttons, button))
            self._sleep(max(0, int(hold_ms)) / 1000.0)
            self._controller.release(getattr(self._buttons, button))
        except InputControlError:
            raise
        except Exception as exc:
            raise InputControlError("执行鼠标点击失败。") from exc
        finally:
            if restore_cursor and moved:
                self.set_cursor_pos(*original)

    def create_listener(self, on_click: Callable[..., None]) -> object:
        try:
            return self._listener_type(on_click=on_click)
        except Exception as exc:
            raise InputControlError("启动鼠标录制监听失败。") from exc
