import threading
import unittest

from clickflow_core import (
    ClickStep,
    PlaybackConfig,
    move_step,
    run_point_clicks,
    run_playback,
    sequence_duration,
)


class ClickStepTests(unittest.TestCase):
    def test_legacy_json_defaults_keep_old_files_compatible(self):
        step = ClickStep.from_dict(
            {
                "x": "12",
                "y": 34,
                "button": "right",
                "delay": "0.75",
            }
        )

        self.assertEqual(
            step,
            ClickStep(
                x=12,
                y=34,
                button="right",
                delay=0.75,
                hold_ms=20,
                restore_cursor=True,
            ),
        )

    def test_click_step_round_trip_keeps_all_fields(self):
        original = ClickStep(
            x=900,
            y=540,
            button="middle",
            delay=1.25,
            hold_ms=35,
            restore_cursor=False,
        )

        self.assertEqual(ClickStep.from_dict(original.to_dict()), original)


class PlaybackTests(unittest.TestCase):
    def test_multiple_loops_run_when_gap_is_zero(self):
        steps = [
            ClickStep(10, 20, "left", 0.0),
            ClickStep(30, 40, "left", 0.0),
        ]
        calls = []
        config = PlaybackConfig(
            loops=3,
            loop_gap=0.0,
            speed=1.0,
            fixed_interval=0.1,
            use_recorded_delays=True,
            restore_cursor=True,
        )

        completed = run_playback(
            steps=steps,
            config=config,
            stop_event=threading.Event(),
            click=lambda step, restore: calls.append((step.x, step.y, restore)),
            wait=lambda seconds: False,
        )

        self.assertEqual(completed, 3)
        self.assertEqual(
            calls,
            [
                (10, 20, True),
                (30, 40, True),
                (10, 20, True),
                (30, 40, True),
                (10, 20, True),
                (30, 40, True),
            ],
        )

    def test_recorded_delays_are_scaled_by_speed(self):
        steps = [
            ClickStep(1, 1, "left", 0.0),
            ClickStep(2, 2, "left", 1.5),
        ]
        waits = []
        config = PlaybackConfig(
            loops=1,
            loop_gap=0.0,
            speed=3.0,
            fixed_interval=9.0,
            use_recorded_delays=True,
            restore_cursor=False,
        )

        run_playback(
            steps=steps,
            config=config,
            stop_event=threading.Event(),
            click=lambda step, restore: None,
            wait=lambda seconds: waits.append(seconds) or False,
        )

        self.assertEqual(waits, [0, 0.5])

    def test_fixed_interval_is_used_when_recorded_delays_are_disabled(self):
        steps = [
            ClickStep(1, 1, "left", 0.0),
            ClickStep(2, 2, "left", 8.0),
        ]
        waits = []
        config = PlaybackConfig(
            loops=1,
            loop_gap=0.0,
            speed=2.0,
            fixed_interval=0.6,
            use_recorded_delays=False,
            restore_cursor=True,
        )

        run_playback(
            steps=steps,
            config=config,
            stop_event=threading.Event(),
            click=lambda step, restore: None,
            wait=lambda seconds: waits.append(seconds) or False,
        )

        self.assertEqual(waits, [0, 0.3])

    def test_stop_during_wait_prevents_later_clicks(self):
        steps = [
            ClickStep(1, 1, "left", 0.0),
            ClickStep(2, 2, "left", 1.0),
        ]
        calls = []
        config = PlaybackConfig(
            loops=1,
            loop_gap=0.0,
            speed=1.0,
            fixed_interval=1.0,
            use_recorded_delays=True,
            restore_cursor=True,
        )

        completed = run_playback(
            steps=steps,
            config=config,
            stop_event=threading.Event(),
            click=lambda step, restore: calls.append(step.x),
            wait=lambda seconds: seconds > 0,
        )

        self.assertEqual(completed, 0)
        self.assertEqual(calls, [1])

    def test_sequence_duration_includes_loop_gaps(self):
        steps = [
            ClickStep(1, 1, "left", 0.0),
            ClickStep(2, 2, "left", 1.2),
            ClickStep(3, 3, "left", 0.8),
        ]
        config = PlaybackConfig(
            loops=3,
            loop_gap=0.5,
            speed=2.0,
            fixed_interval=4.0,
            use_recorded_delays=True,
            restore_cursor=True,
        )

        self.assertAlmostEqual(sequence_duration(steps, config), 4.0)


class PointClickTests(unittest.TestCase):
    def test_finite_point_task_stops_at_requested_count(self):
        calls = []
        waits = []

        completed = run_point_clicks(
            count=3,
            interval=0.2,
            stop_event=threading.Event(),
            click=lambda: calls.append("click"),
            wait=lambda seconds: waits.append(seconds) or False,
        )

        self.assertEqual(completed, 3)
        self.assertEqual(calls, ["click", "click", "click"])
        self.assertEqual(waits, [0, 0.2, 0, 0.2, 0])

    def test_infinite_point_task_can_be_stopped_during_interval(self):
        calls = []

        completed = run_point_clicks(
            count=0,
            interval=1.0,
            stop_event=threading.Event(),
            click=lambda: calls.append("click"),
            wait=lambda seconds: seconds > 0,
        )

        self.assertEqual(completed, 1)
        self.assertEqual(calls, ["click"])


class StepOrderingTests(unittest.TestCase):
    def setUp(self):
        self.steps = [
            ClickStep(1, 1, "left", 0.0),
            ClickStep(2, 2, "left", 1.0),
            ClickStep(3, 3, "right", 2.0),
        ]

    def test_step_moves_up_one_position(self):
        reordered, selected = move_step(self.steps, index=2, delta=-1)

        self.assertEqual([step.x for step in reordered], [1, 3, 2])
        self.assertEqual(selected, 1)

    def test_step_moves_down_one_position(self):
        reordered, selected = move_step(self.steps, index=0, delta=1)

        self.assertEqual([step.x for step in reordered], [2, 1, 3])
        self.assertEqual(selected, 1)

    def test_step_stays_inside_boundaries(self):
        at_top, selected_top = move_step(self.steps, index=0, delta=-1)
        at_bottom, selected_bottom = move_step(self.steps, index=2, delta=1)

        self.assertEqual([step.x for step in at_top], [1, 2, 3])
        self.assertEqual(selected_top, 0)
        self.assertEqual([step.x for step in at_bottom], [1, 2, 3])
        self.assertEqual(selected_bottom, 2)


if __name__ == "__main__":
    unittest.main()
