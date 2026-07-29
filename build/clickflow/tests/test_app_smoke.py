import tempfile
import tkinter as tk
import unittest
from pathlib import Path
from unittest.mock import patch

from auto_clicker import AutoClickerApp
from clickflow_core import ClickStep
from clickflow_input import InputControlError


class FakeMouse:
    def __init__(self):
        self.position = (100, 200)
        self.clicks = []

    def get_cursor_pos(self):
        return self.position

    def click(self, **kwargs):
        self.clicks.append(kwargs)

    def create_listener(self, _on_click):
        raise AssertionError("listener was not expected in this smoke test")


class BrokenMouse(FakeMouse):
    def get_cursor_pos(self):
        raise InputControlError("读取鼠标位置失败。")


class FakeRecorder:
    def __init__(self, on_step, **_kwargs):
        self.on_step = on_step
        self.started = False

    def start(self):
        self.started = True

    def stop(self):
        self.started = False


class ClickFlowAppSmokeTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = tk.Tk()
        self.root.withdraw()
        self.app = AutoClickerApp(
            root=self.root,
            start_timers=False,
            settings_file=Path(self.temp_dir.name) / "settings.json",
            mouse=FakeMouse(),
        )
        self.root.update_idletasks()

    def tearDown(self):
        self.app._stop_all()
        self.root.update_idletasks()
        self.root.destroy()
        self.temp_dir.cleanup()

    def test_both_mode_frames_exist_and_point_is_default(self):
        self.assertTrue(self.app.point_frame.winfo_exists())
        self.assertTrue(self.app.sequence_frame.winfo_exists())
        self.assertEqual(self.app.active_mode.get(), "point")

        self.app._show_mode("sequence")
        self.root.update_idletasks()

        self.assertEqual(self.app.active_mode.get(), "sequence")
        self.assertEqual(
            self.app.sequence_mode_btn.cget("style"),
            "Selected.Mode.TButton",
        )

    def test_minimum_size_and_stop_all_are_always_available(self):
        self.assertEqual(self.root.minsize(), (920, 640))
        self.assertTrue(self.app.stop_all_btn.winfo_exists())
        self.assertNotEqual(self.app.stop_all_btn.cget("state"), "disabled")

    def test_theme_change_updates_current_palette_and_is_saved(self):
        self.app._apply_theme_choice("dark")

        self.assertEqual(self.app.theme_choice.get(), "dark")
        self.assertEqual(self.app.current_palette.background, "#17151D")
        self.assertEqual(
            (Path(self.temp_dir.name) / "settings.json").read_text(encoding="utf-8"),
            '{\n  "theme": "dark"\n}',
        )

    def test_window_rectangle_filters_inside_and_preserves_outside_points(self):
        self.app._window_bounds = (10, 20, 110, 220)

        self.assertFalse(self.app._is_recordable_point(10, 20))
        self.assertFalse(self.app._is_recordable_point(109, 219))
        self.assertTrue(self.app._is_recordable_point(110, 220))
        self.assertTrue(self.app._is_recordable_point(9, 20))
        self.assertTrue(self.app._is_recordable_point(10, 220))

    def test_missing_window_rectangle_allows_recording(self):
        self.app._window_bounds = None

        self.assertTrue(self.app._is_recordable_point(10, 20))

    def test_visible_window_refreshes_cached_screen_rectangle(self):
        self.root.deiconify()
        self.root.update()
        self.app._refresh_window_bounds()
        left, top, right, bottom = self.app._window_bounds

        self.assertEqual(left, self.root.winfo_rootx())
        self.assertEqual(top, self.root.winfo_rooty())
        self.assertEqual(right, left + self.root.winfo_width())
        self.assertEqual(bottom, top + self.root.winfo_height())

    def test_log_panel_can_expand_and_collapse(self):
        self.assertFalse(self.app.log_expanded.get())

        self.app._toggle_log()
        self.root.update_idletasks()
        self.assertTrue(self.app.log_expanded.get())
        self.assertNotEqual(self.app.log_frame.grid_info(), {})

        self.app._toggle_log()
        self.root.update_idletasks()
        self.assertFalse(self.app.log_expanded.get())
        self.assertEqual(self.app.log_frame.grid_info(), {})

    def test_running_point_task_toggles_pause_instead_of_stopping(self):
        class AliveTask:
            @staticmethod
            def is_alive():
                return True

        self.app.single_task = AliveTask()

        self.app._toggle_point_task()
        self.assertTrue(self.app.single_pause.is_set())
        self.assertFalse(self.app.single_stop.is_set())
        self.assertEqual(self.app.point_start_btn.cget("text"), "继续点击 · F8")

        self.app._toggle_point_task()
        self.assertFalse(self.app.single_pause.is_set())
        self.assertEqual(self.app.point_start_btn.cget("text"), "暂停点击 · F8")

    def test_stop_all_clears_pauses_and_sets_stop_events(self):
        self.app.single_pause.set()
        self.app.seq_pause.set()

        self.app._stop_all()

        self.assertFalse(self.app.single_pause.is_set())
        self.assertFalse(self.app.seq_pause.is_set())
        self.assertTrue(self.app.single_stop.is_set())
        self.assertTrue(self.app.seq_stop.is_set())

    def test_function_key_shortcuts_dispatch_to_dedicated_actions(self):
        called = []
        original_record = self.app._toggle_recording
        original_replay = self.app._toggle_sequence_task
        original_point = self.app._toggle_point_task
        original_stop = self.app._stop_all
        self.app._toggle_recording = lambda: called.append("record")
        self.app._toggle_sequence_task = lambda: called.append("replay")
        self.app._toggle_point_task = lambda: called.append("point")
        self.app._stop_all = lambda: called.append("stop")
        self.root.deiconify()
        self.root.focus_force()
        self.root.update()

        try:
            for sequence in ("<F6>", "<F7>", "<F8>", "<F9>"):
                self.root.event_generate(sequence, when="tail")
                self.root.update()
        finally:
            self.app._toggle_recording = original_record
            self.app._toggle_sequence_task = original_replay
            self.app._toggle_point_task = original_point
            self.app._stop_all = original_stop

        self.assertEqual(called, ["record", "replay", "point", "stop"])

    def test_function_buttons_show_their_shortcuts(self):
        self.assertIn("F6", self.app.btn_record.cget("text"))
        self.assertIn("F7", self.app.sequence_start_btn.cget("text"))
        self.assertIn("F8", self.app.point_start_btn.cget("text"))
        self.assertIn("F9", self.app.stop_all_btn.cget("text"))

    def test_file_shortcuts_remain_bound(self):
        for sequence in ("<Control-s>", "<Control-o>"):
            self.assertTrue(self.root.bind_all(sequence))

    def test_macos_input_failure_in_manual_add_shows_permission_guidance(self):
        self.app.mouse = BrokenMouse()

        with (
            patch("auto_clicker.platform.system", return_value="Darwin"),
            patch("auto_clicker.messagebox.showerror") as show_error,
        ):
            self.app._add_current_as_step()

        title, detail = show_error.call_args.args[:2]
        self.assertEqual(title, "读取失败")
        self.assertIn("辅助功能", detail)
        self.assertIn("输入监控", detail)
        self.assertEqual(self.app.steps, [])

    def test_recorded_step_waits_in_queue_until_ui_thread_drains_it(self):
        step = ClickStep(x=25, y=35, button="left", delay=0.0)

        with patch("auto_clicker.ClickRecorder", FakeRecorder):
            self.app._start_record()
            self.app.recorder.on_step(step)

        self.assertEqual(self.app.steps, [])
        self.assertEqual(self.app.record_queue.qsize(), 1)

        self.app._drain_record_queue()

        self.assertEqual(self.app.steps, [step])
        self.assertEqual(self.app.record_queue.qsize(), 0)

    def test_worker_ui_callback_waits_in_queue_until_ui_thread_drains_it(self):
        called = []

        self.app._dispatch_ui(lambda: called.append("done"))

        self.assertEqual(called, [])
        self.assertEqual(self.app.ui_queue.qsize(), 1)

        self.app._drain_ui_queue()

        self.assertEqual(called, ["done"])
        self.assertEqual(self.app.ui_queue.qsize(), 0)


if __name__ == "__main__":
    unittest.main()
