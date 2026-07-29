from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Callable, Dict, Iterable, List, Protocol, Sequence


class StopEvent(Protocol):
    def is_set(self) -> bool: ...

    def wait(self, timeout: float) -> bool: ...


@dataclass(frozen=True)
class ClickStep:
    x: int
    y: int
    button: str
    delay: float
    hold_ms: int = 20
    restore_cursor: bool = True

    def to_dict(self) -> Dict:
        return asdict(self)

    @staticmethod
    def from_dict(data: Dict) -> "ClickStep":
        return ClickStep(
            x=int(data.get("x", 0)),
            y=int(data.get("y", 0)),
            button=str(data.get("button", "left")),
            delay=float(data.get("delay", 0.0)),
            hold_ms=int(data.get("hold_ms", 20)),
            restore_cursor=bool(data.get("restore_cursor", True)),
        )


@dataclass(frozen=True)
class PlaybackConfig:
    loops: int
    loop_gap: float
    speed: float
    fixed_interval: float
    use_recorded_delays: bool
    restore_cursor: bool

    def __post_init__(self) -> None:
        if self.loops < 0:
            raise ValueError("loops cannot be negative")
        if self.loop_gap < 0:
            raise ValueError("loop_gap cannot be negative")
        if self.speed <= 0:
            raise ValueError("speed must be greater than zero")
        if self.fixed_interval < 0:
            raise ValueError("fixed_interval cannot be negative")


WaitCallback = Callable[[float], bool]
ClickCallback = Callable[[ClickStep, bool], None]
PointClickCallback = Callable[[], None]


def _step_delay(
    index: int,
    step: ClickStep,
    config: PlaybackConfig,
) -> float:
    if index == 0:
        return 0.0
    raw_delay = step.delay if config.use_recorded_delays else config.fixed_interval
    return max(0.0, raw_delay / config.speed)


def run_playback(
    steps: Sequence[ClickStep],
    config: PlaybackConfig,
    stop_event: StopEvent,
    click: ClickCallback,
    wait: WaitCallback | None = None,
) -> int:
    wait_callback = wait or stop_event.wait
    loops_done = 0

    while not stop_event.is_set():
        if config.loops > 0 and loops_done >= config.loops:
            break

        for index, step in enumerate(steps):
            if stop_event.is_set():
                return loops_done

            delay = _step_delay(index, step, config)
            if wait_callback(delay):
                return loops_done

            click(step, config.restore_cursor)

        loops_done += 1
        if config.loops > 0 and loops_done >= config.loops:
            break
        if config.loop_gap > 0 and wait_callback(config.loop_gap):
            break

    return loops_done


def run_point_clicks(
    count: int,
    interval: float,
    stop_event: StopEvent,
    click: PointClickCallback,
    wait: WaitCallback | None = None,
) -> int:
    if count < 0:
        raise ValueError("count cannot be negative")
    if interval < 0:
        raise ValueError("interval cannot be negative")

    wait_callback = wait or stop_event.wait
    executed = 0
    while not stop_event.is_set():
        if count > 0 and executed >= count:
            break
        if wait_callback(0):
            break
        click()
        executed += 1
        if count > 0 and executed >= count:
            break
        if wait_callback(interval):
            break
    return executed


def sequence_duration(
    steps: Sequence[ClickStep],
    config: PlaybackConfig,
) -> float:
    if config.loops == 0:
        return math.inf
    one_loop = sum(_step_delay(index, step, config) for index, step in enumerate(steps))
    return one_loop * config.loops + config.loop_gap * max(0, config.loops - 1)


def move_step(
    steps: Sequence[ClickStep],
    index: int,
    delta: int,
) -> tuple[List[ClickStep], int]:
    if not steps:
        return [], 0
    if index < 0 or index >= len(steps):
        raise IndexError("step index out of range")
    target = max(0, min(len(steps) - 1, index + delta))
    reordered = list(steps)
    step = reordered.pop(index)
    reordered.insert(target, step)
    return reordered, target
