import unittest

from auto_clicker import ClickRecorder


class FakeListener:
    def __init__(self, on_click):
        self.on_click = on_click
        self.started = False
        self.stopped = False
        self.join_timeout = None

    def start(self):
        self.started = True
        return self

    def stop(self):
        self.stopped = True

    def join(self, timeout=None):
        self.join_timeout = timeout


class ListenerFactory:
    def __init__(self):
        self.listeners = []

    def __call__(self, on_click):
        listener = FakeListener(on_click)
        self.listeners.append(listener)
        return listener


LEFT = object()
RIGHT = object()
MIDDLE = object()
UNKNOWN = object()
BUTTON_NAMES = {
    LEFT: "left",
    RIGHT: "right",
    MIDDLE: "middle",
}


class ClickRecorderTests(unittest.TestCase):
    def make_recorder(self, **overrides):
        factory = overrides.pop("listener_factory", ListenerFactory())
        recorder = ClickRecorder(
            on_step=overrides.pop("on_step", lambda _step: None),
            listener_factory=factory,
            button_mapper=overrides.pop(
                "button_mapper",
                lambda button: BUTTON_NAMES.get(button),
            ),
            **overrides,
        )
        return recorder, factory

    def test_start_creates_one_listener_and_stop_releases_it(self):
        recorder, factory = self.make_recorder()

        recorder.start()
        recorder.start()
        recorder.stop()

        self.assertEqual(len(factory.listeners), 1)
        self.assertTrue(factory.listeners[0].started)
        self.assertTrue(factory.listeners[0].stopped)
        self.assertEqual(factory.listeners[0].join_timeout, 0.8)

    def test_pressed_supported_button_emits_step_with_recording_defaults(self):
        captured = []
        recorder, _factory = self.make_recorder(
            on_step=captured.append,
            default_hold=35,
            default_restore=False,
            clock=lambda: 10.0,
        )

        recorder.on_click(120.8, 80.2, RIGHT, True)

        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0].x, 120)
        self.assertEqual(captured[0].y, 80)
        self.assertEqual(captured[0].button, "right")
        self.assertEqual(captured[0].delay, 0.0)
        self.assertEqual(captured[0].hold_ms, 35)
        self.assertFalse(captured[0].restore_cursor)

    def test_release_and_unknown_button_do_not_emit_steps(self):
        captured = []
        recorder, _factory = self.make_recorder(on_step=captured.append)

        recorder.on_click(120, 80, LEFT, False)
        recorder.on_click(120, 80, UNKNOWN, True)

        self.assertEqual(captured, [])

    def test_denied_point_does_not_emit_step(self):
        captured = []
        recorder, _factory = self.make_recorder(
            on_step=captured.append,
            capture_filter=lambda _x, _y: False,
        )

        recorder.on_click(120, 80, LEFT, True)

        self.assertEqual(captured, [])

    def test_denied_click_does_not_reset_delay_between_allowed_clicks(self):
        times = iter([10.0, 13.0])
        captured = []
        recorder, _factory = self.make_recorder(
            on_step=captured.append,
            capture_filter=lambda x, _y: x != 200,
            clock=lambda: next(times),
        )

        recorder.on_click(100, 80, LEFT, True)
        recorder.on_click(200, 80, LEFT, True)
        recorder.on_click(300, 80, LEFT, True)

        self.assertEqual(len(captured), 2)
        self.assertEqual(captured[1].delay, 3.0)


if __name__ == "__main__":
    unittest.main()
