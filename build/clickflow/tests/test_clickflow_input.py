import unittest

from clickflow_input import InputControlError, PynputMouse, button_name


class FakeButtons:
    left = object()
    right = object()
    middle = object()


class FakeController:
    def __init__(self):
        self._position = (10, 20)
        self.events = []

    @property
    def position(self):
        self.events.append(("get", self._position))
        return self._position

    @position.setter
    def position(self, value):
        self._position = tuple(value)
        self.events.append(("move", self._position))

    def press(self, button):
        self.events.append(("press", button))

    def release(self, button):
        self.events.append(("release", button))


class FakeListener:
    def __init__(self, *, on_click):
        self.on_click = on_click


class BrokenController(FakeController):
    @property
    def position(self):
        raise OSError("blocked")


class InputAdapterTests(unittest.TestCase):
    def test_button_name_maps_supported_buttons_and_ignores_unknown(self):
        self.assertEqual(button_name(FakeButtons.left, FakeButtons), "left")
        self.assertEqual(button_name(FakeButtons.right, FakeButtons), "right")
        self.assertEqual(button_name(FakeButtons.middle, FakeButtons), "middle")
        self.assertIsNone(button_name(object(), FakeButtons))

    def test_cursor_position_is_normalized_to_integer_coordinates(self):
        controller = FakeController()
        controller._position = (10.8, 20.2)
        mouse = PynputMouse(
            controller=controller,
            button_type=FakeButtons,
            listener_type=FakeListener,
        )

        self.assertEqual(mouse.get_cursor_pos(), (10, 20))

    def test_click_moves_presses_releases_and_restores_in_order(self):
        controller = FakeController()
        sleeps = []
        mouse = PynputMouse(
            controller=controller,
            button_type=FakeButtons,
            listener_type=FakeListener,
            sleep=sleeps.append,
        )

        mouse.click(40, 50, button="right", hold_ms=35, restore_cursor=True)

        self.assertEqual(
            controller.events,
            [
                ("get", (10, 20)),
                ("move", (40, 50)),
                ("press", FakeButtons.right),
                ("release", FakeButtons.right),
                ("move", (10, 20)),
            ],
        )
        self.assertEqual(sleeps, [0.004, 0.035])

    def test_click_does_not_restore_when_option_is_disabled(self):
        controller = FakeController()
        mouse = PynputMouse(
            controller=controller,
            button_type=FakeButtons,
            listener_type=FakeListener,
            sleep=lambda _seconds: None,
        )

        mouse.click(40, 50, restore_cursor=False)

        self.assertEqual(controller._position, (40, 50))
        self.assertNotIn(("move", (10, 20)), controller.events)

    def test_invalid_click_button_has_a_user_facing_error(self):
        mouse = PynputMouse(
            controller=FakeController(),
            button_type=FakeButtons,
            listener_type=FakeListener,
        )

        with self.assertRaisesRegex(InputControlError, "不支持的鼠标按键"):
            mouse.click(40, 50, button="extra")

    def test_controller_failures_are_wrapped_as_input_errors(self):
        mouse = PynputMouse(
            controller=BrokenController(),
            button_type=FakeButtons,
            listener_type=FakeListener,
        )

        with self.assertRaisesRegex(InputControlError, "读取鼠标位置失败"):
            mouse.get_cursor_pos()

    def test_listener_factory_receives_the_same_callback(self):
        mouse = PynputMouse(
            controller=FakeController(),
            button_type=FakeButtons,
            listener_type=FakeListener,
        )
        received = []

        listener = mouse.create_listener(
            lambda x, y, button, pressed: received.append(
                (x, y, button, pressed)
            )
        )
        listener.on_click(4, 5, FakeButtons.left, True)

        self.assertEqual(received, [(4, 5, FakeButtons.left, True)])


if __name__ == "__main__":
    unittest.main()
