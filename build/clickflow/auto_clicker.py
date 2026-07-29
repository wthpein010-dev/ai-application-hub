from __future__ import annotations

import json
import platform
import queue
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Callable, List, Optional

from clickflow_core import (
    ClickStep,
    PlaybackConfig,
    move_step,
    run_point_clicks,
    run_playback,
    sequence_duration,
)
from clickflow_input import InputControlError, PynputMouse, button_name
from clickflow_theme import (
    THEME_LABELS,
    THEME_VALUES_BY_LABEL,
    ThemePalette,
    load_theme,
    normalize_theme,
    palette_for,
    save_theme,
    settings_path,
)


BUTTON_LABELS = {
    "left": "左键",
    "right": "右键",
    "middle": "中键",
}
BUTTON_VALUES_BY_LABEL = {label: value for value, label in BUTTON_LABELS.items()}


class ClickRecorder:
    def __init__(
        self,
        on_step: Callable[[ClickStep], None],
        listener_factory: Callable[[Callable[..., None]], object],
        button_mapper: Callable[[object], Optional[str]] = button_name,
        default_hold: int = 20,
        default_restore: bool = True,
        capture_filter: Optional[Callable[[int, int], bool]] = None,
        clock: Optional[Callable[[], float]] = None,
    ):
        self.on_step = on_step
        self.listener_factory = listener_factory
        self.button_mapper = button_mapper
        self.default_hold = max(1, int(default_hold))
        self.default_restore = bool(default_restore)
        self.capture_filter = capture_filter or (lambda _x, _y: True)
        self.clock = clock or time.perf_counter
        self._listener: Optional[object] = None
        self._last_time: Optional[float] = None

    def start(self) -> None:
        if self._listener is not None:
            return
        self._last_time = None
        try:
            listener = self.listener_factory(self.on_click)
            listener.start()
        except InputControlError:
            raise
        except Exception as exc:
            raise InputControlError("启动鼠标录制监听失败。") from exc
        self._listener = listener

    def stop(self) -> None:
        listener = self._listener
        self._listener = None
        if listener is None:
            return
        try:
            listener.stop()
            listener.join(timeout=0.8)
        except Exception:
            pass

    def on_click(
        self,
        x: float,
        y: float,
        button: object,
        pressed: bool,
    ) -> None:
        if not pressed:
            return
        name = self.button_mapper(button)
        point_x, point_y = int(x), int(y)
        if name is None or not self.capture_filter(point_x, point_y):
            return
        now = self.clock()
        delay = (
            0.0
            if self._last_time is None
            else max(0.0, now - self._last_time)
        )
        self._last_time = now
        self.on_step(
            ClickStep(
                x=point_x,
                y=point_y,
                button=name,
                delay=delay,
                hold_ms=self.default_hold,
                restore_cursor=self.default_restore,
            )
        )


class AutoClickerApp:
    VERSION = "2.0.0"

    def __init__(
        self,
        root: Optional[tk.Tk] = None,
        *,
        start_timers: bool = True,
        settings_file: Optional[Path] = None,
        mouse: Optional[object] = None,
    ):
        self.root = root or tk.Tk()
        self.start_timers = start_timers
        self.settings_file = Path(settings_file) if settings_file else settings_path()
        self.input_initialization_error: Optional[InputControlError] = None
        if mouse is None:
            try:
                mouse = PynputMouse()
            except InputControlError as exc:
                self.input_initialization_error = exc
        self.mouse = mouse
        self._window_bounds: Optional[tuple[int, int, int, int]] = None
        self.style = ttk.Style(self.root)
        if "clam" in self.style.theme_names():
            self.style.theme_use("clam")

        self.root.title("ClickFlow · 鼠标自动化工作台")
        self.root.geometry("1160x780")
        self.root.minsize(920, 640)

        self.ui_queue: "queue.Queue[Callable[[], None]]" = queue.Queue()
        self.log_queue: "queue.Queue[str]" = queue.Queue()
        self.record_queue: "queue.Queue[ClickStep]" = queue.Queue()
        self.steps: List[ClickStep] = []
        self.recorder: Optional[ClickRecorder] = None
        self.is_recording = False

        self.single_task: Optional[threading.Thread] = None
        self.single_stop = threading.Event()
        self.single_pause = threading.Event()
        self.seq_task: Optional[threading.Thread] = None
        self.seq_stop = threading.Event()
        self.seq_pause = threading.Event()

        self.active_mode = tk.StringVar(value="point")
        self.theme_choice = tk.StringVar(value=load_theme(self.settings_file))
        self.theme_label = tk.StringVar(
            value=THEME_LABELS[self.theme_choice.get()]
        )
        self.log_expanded = tk.BooleanVar(value=False)

        self.status_state = tk.StringVar(value="ready")
        self.status_title = tk.StringVar(value="系统就绪")
        self.status_detail = tk.StringVar(value="等待开始任务")
        self.recorder_summary = tk.StringVar(value="尚未录制动作")
        self.cursor_summary = tk.StringVar(value="当前位置 0, 0")
        self.point_frequency = tk.StringVar(value="0.5 次/秒")
        self.point_count_summary = tk.StringVar(value="持续")
        self.point_restore_summary = tk.StringVar(value="已开启")
        self.sequence_summary = tk.StringVar(value="0 个动作 · 总时长 0 秒")

        self.single_x = tk.StringVar(value="842")
        self.single_y = tk.StringVar(value="516")
        self.single_interval = tk.StringVar(value="2.0")
        self.single_count = tk.StringVar(value="0")
        self.single_hold = tk.StringVar(value="20")
        self.single_button = tk.StringVar(value="left")
        self.single_button_label = tk.StringVar(value=BUTTON_LABELS["left"])
        self.single_restore = tk.BooleanVar(value=True)

        self.seq_loop_count = tk.StringVar(value="5")
        self.seq_loop_gap = tk.StringVar(value="1.0")
        self.seq_speed = tk.StringVar(value="1.0")
        self.seq_fixed_interval = tk.StringVar(value="1.0")
        self.seq_use_recorded = tk.BooleanVar(value=True)
        self.seq_restore_all = tk.BooleanVar(value=True)
        self.seq_hold = tk.StringVar(value="20")

        self.current_palette: ThemePalette = palette_for(self.theme_choice.get())

        self._build_ui()
        self._apply_theme_choice(self.theme_choice.get())
        self._bind_close()
        self._bind_shortcuts()
        self._bind_variable_updates()
        self._show_mode("point")
        self._refresh_steps_view()
        self._update_point_summary()
        self._refresh_window_bounds()

        if self.input_initialization_error is not None:
            self._set_status(
                "error",
                "鼠标输入不可用",
                self._format_input_error(self.input_initialization_error),
            )

        if self.start_timers:
            self.root.after(120, self._tick_log)
            self.root.after(200, self._update_cursor_preview)
        else:
            self._drain_log_queue()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------
    def _build_ui(self) -> None:
        self.root.grid_columnconfigure(0, weight=1)
        self.root.grid_rowconfigure(2, weight=1)

        self._build_topbar()
        self._build_mode_navigation()

        self.content_host = ttk.Frame(self.root, style="App.TFrame", padding=(18, 6, 18, 10))
        self.content_host.grid(row=2, column=0, sticky="nsew")
        self.content_host.grid_columnconfigure(0, weight=1)
        self.content_host.grid_rowconfigure(0, weight=1)

        self.point_frame = ttk.Frame(self.content_host, style="App.TFrame")
        self.sequence_frame = ttk.Frame(self.content_host, style="App.TFrame")
        for frame in (self.point_frame, self.sequence_frame):
            frame.grid(row=0, column=0, sticky="nsew")

        self._build_point_workspace()
        self._build_sequence_workspace()
        self._build_status_area()

    def _build_topbar(self) -> None:
        topbar = ttk.Frame(self.root, style="App.TFrame", padding=(22, 18, 22, 10))
        topbar.grid(row=0, column=0, sticky="ew")
        topbar.grid_columnconfigure(1, weight=1)

        mark = ttk.Label(topbar, text="●", style="BrandMark.TLabel")
        mark.grid(row=0, column=0, rowspan=2, padx=(0, 12))
        ttk.Label(topbar, text="ClickFlow", style="Brand.TLabel").grid(
            row=0, column=1, sticky="sw"
        )
        ttk.Label(topbar, text="鼠标自动化工作台", style="Muted.TLabel").grid(
            row=1, column=1, sticky="nw"
        )

        self.status_badge = ttk.Label(
            topbar,
            textvariable=self.status_title,
            style="StatusPill.TLabel",
            padding=(10, 5),
        )
        self.status_badge.grid(row=0, column=2, rowspan=2, padx=(12, 18))

        theme_box = ttk.Combobox(
            topbar,
            textvariable=self.theme_label,
            values=list(THEME_VALUES_BY_LABEL),
            state="readonly",
            width=10,
            style="App.TCombobox",
        )
        theme_box.grid(row=0, column=3, rowspan=2, padx=(0, 10))
        theme_box.bind("<<ComboboxSelected>>", self._on_theme_selected)

        self.stop_all_btn = ttk.Button(
            topbar,
            text="停止全部 · F9",
            command=self._stop_all,
            style="Danger.TButton",
        )
        self.stop_all_btn.grid(row=0, column=4, rowspan=2)

    def _build_mode_navigation(self) -> None:
        nav = ttk.Frame(self.root, style="App.TFrame", padding=(22, 6, 22, 8))
        nav.grid(row=1, column=0, sticky="ew")
        nav.grid_columnconfigure(0, weight=1)
        nav.grid_columnconfigure(1, weight=1)

        self.point_mode_btn = ttk.Button(
            nav,
            text="定点点击",
            command=lambda: self._show_mode("point"),
            style="Mode.TButton",
        )
        self.point_mode_btn.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        self.sequence_mode_btn = ttk.Button(
            nav,
            text="录制回放",
            command=lambda: self._show_mode("sequence"),
            style="Mode.TButton",
        )
        self.sequence_mode_btn.grid(row=0, column=1, sticky="ew", padx=(5, 0))

    def _build_point_workspace(self) -> None:
        self.point_frame.grid_columnconfigure(0, weight=7, uniform="point")
        self.point_frame.grid_columnconfigure(1, weight=4, uniform="point")
        self.point_frame.grid_rowconfigure(0, weight=1)

        form_card = ttk.Frame(
            self.point_frame,
            style="Card.TFrame",
            padding=22,
        )
        form_card.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        form_card.grid_columnconfigure(0, weight=1)

        preview_card = ttk.Frame(
            self.point_frame,
            style="Card.TFrame",
            padding=22,
        )
        preview_card.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        preview_card.grid_columnconfigure(0, weight=1)
        preview_card.grid_rowconfigure(2, weight=1)

        ttk.Label(form_card, text="点击位置", style="CardTitle.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(
            form_card,
            text="移动鼠标后拾取，或直接填写屏幕坐标",
            style="CardMuted.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(3, 14))

        coords = ttk.Frame(form_card, style="Card.TFrame")
        coords.grid(row=2, column=0, sticky="ew")
        coords.grid_columnconfigure(0, weight=1)
        coords.grid_columnconfigure(1, weight=1)

        self.single_x_entry = self._field(
            coords, "X 坐标", self.single_x, row=0, column=0, padx=(0, 6)
        )
        self.single_y_entry = self._field(
            coords, "Y 坐标", self.single_y, row=0, column=1, padx=(6, 0)
        )

        pickup_row = ttk.Frame(form_card, style="Card.TFrame")
        pickup_row.grid(row=3, column=0, sticky="ew", pady=(10, 18))
        pickup_row.grid_columnconfigure(0, weight=1)
        ttk.Label(
            pickup_row,
            textvariable=self.cursor_summary,
            style="CardMuted.TLabel",
        ).grid(row=0, column=0, sticky="w")
        ttk.Button(
            pickup_row,
            text="拾取位置",
            command=self._pickup_cursor,
            style="Secondary.TButton",
        ).grid(row=0, column=1)

        ttk.Separator(form_card, orient="horizontal").grid(
            row=4, column=0, sticky="ew", pady=(0, 18)
        )
        ttk.Label(form_card, text="执行规则", style="CardTitle.TLabel").grid(
            row=5, column=0, sticky="w"
        )
        ttk.Label(
            form_card,
            text="设置点击节奏和停止条件",
            style="CardMuted.TLabel",
        ).grid(row=6, column=0, sticky="w", pady=(3, 14))

        rules = ttk.Frame(form_card, style="Card.TFrame")
        rules.grid(row=7, column=0, sticky="ew")
        rules.grid_columnconfigure(0, weight=1)
        rules.grid_columnconfigure(1, weight=1)
        self.single_interval_entry = self._field(
            rules,
            "点击间隔（秒）",
            self.single_interval,
            row=0,
            column=0,
            padx=(0, 6),
        )
        self.single_count_entry = self._field(
            rules,
            "执行次数（0 为持续）",
            self.single_count,
            row=0,
            column=1,
            padx=(6, 0),
        )
        self.single_button_box = self._combo_field(
            rules,
            "鼠标按键",
            self.single_button_label,
            list(BUTTON_VALUES_BY_LABEL),
            row=2,
            column=0,
            padx=(0, 6),
        )
        self.single_hold_entry = self._field(
            rules,
            "按下时长（毫秒）",
            self.single_hold,
            row=2,
            column=1,
            padx=(6, 0),
        )

        self.restore_check = ttk.Checkbutton(
            form_card,
            text="点击后恢复鼠标位置，减少对手动操作的影响",
            variable=self.single_restore,
            style="Card.TCheckbutton",
        )
        self.restore_check.grid(row=8, column=0, sticky="w", pady=(14, 18))

        action_row = ttk.Frame(form_card, style="Card.TFrame")
        action_row.grid(row=9, column=0, sticky="ew")
        action_row.grid_columnconfigure(0, weight=1)
        ttk.Label(
            action_row,
            text="0 次表示持续运行，可随时停止",
            style="CardMuted.TLabel",
        ).grid(row=0, column=0, sticky="w")
        self.point_start_btn = ttk.Button(
            action_row,
            text="开始点击 · F8",
            command=self._toggle_point_task,
            style="Primary.TButton",
        )
        self.point_start_btn.grid(row=0, column=1)

        ttk.Label(preview_card, text="位置预览", style="CardTitle.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(
            preview_card,
            text="按当前屏幕比例显示目标点",
            style="CardMuted.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(3, 12))

        self.point_canvas = tk.Canvas(
            preview_card,
            height=260,
            highlightthickness=1,
            bd=0,
        )
        self.point_canvas.grid(row=2, column=0, sticky="nsew")
        self.point_canvas.bind("<Configure>", lambda _event: self._draw_point_preview())

        stats = ttk.Frame(preview_card, style="Card.TFrame")
        stats.grid(row=3, column=0, sticky="ew", pady=(16, 0))
        for column in range(3):
            stats.grid_columnconfigure(column, weight=1)
        self._stat(stats, "频率", self.point_frequency, 0)
        self._stat(stats, "次数", self.point_count_summary, 1)
        self._stat(stats, "光标保护", self.point_restore_summary, 2)

    def _build_sequence_workspace(self) -> None:
        self.sequence_frame.grid_columnconfigure(0, weight=7, uniform="sequence")
        self.sequence_frame.grid_columnconfigure(1, weight=4, uniform="sequence")
        self.sequence_frame.grid_rowconfigure(0, weight=1)

        timeline_card = ttk.Frame(
            self.sequence_frame,
            style="Card.TFrame",
            padding=20,
        )
        timeline_card.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        timeline_card.grid_columnconfigure(0, weight=1)
        timeline_card.grid_rowconfigure(3, weight=1)

        playback_card = ttk.Frame(
            self.sequence_frame,
            style="Card.TFrame",
            padding=20,
        )
        playback_card.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        playback_card.grid_columnconfigure(0, weight=1)

        title_row = ttk.Frame(timeline_card, style="Card.TFrame")
        title_row.grid(row=0, column=0, sticky="ew")
        title_row.grid_columnconfigure(0, weight=1)
        ttk.Label(title_row, text="动作时间线", style="CardTitle.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        self.btn_record = ttk.Button(
            title_row,
            text="开始录制 · F6",
            command=self._toggle_recording,
            style="Secondary.TButton",
        )
        self.btn_record.grid(row=0, column=1, padx=(8, 0))
        ttk.Button(
            title_row,
            text="添加动作",
            command=self._add_current_as_step,
            style="Secondary.TButton",
        ).grid(row=0, column=2, padx=(8, 0))

        ttk.Label(
            timeline_card,
            textvariable=self.sequence_summary,
            style="CardMuted.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(4, 12))

        columns = ("index", "action", "position", "delay", "hold", "restore")
        self.seq_tree = ttk.Treeview(
            timeline_card,
            columns=columns,
            show="headings",
            selectmode="extended",
            style="Sequence.Treeview",
        )
        headings = {
            "index": "#",
            "action": "动作",
            "position": "坐标",
            "delay": "等待",
            "hold": "按下",
            "restore": "光标保护",
        }
        widths = {
            "index": 42,
            "action": 78,
            "position": 112,
            "delay": 74,
            "hold": 74,
            "restore": 82,
        }
        for name in columns:
            self.seq_tree.heading(name, text=headings[name])
            self.seq_tree.column(
                name,
                width=widths[name],
                minwidth=38,
                anchor="center",
                stretch=name in {"action", "position"},
            )

        tree_wrap = ttk.Frame(timeline_card, style="Card.TFrame")
        tree_wrap.grid(row=3, column=0, sticky="nsew")
        tree_wrap.grid_columnconfigure(0, weight=1)
        tree_wrap.grid_rowconfigure(0, weight=1)
        self.seq_tree.grid(in_=tree_wrap, row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(
            tree_wrap,
            orient="vertical",
            command=self.seq_tree.yview,
        )
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.seq_tree.configure(yscrollcommand=scrollbar.set)
        self.seq_tree.bind("<Double-1>", lambda _event: self._edit_selected_step())

        timeline_actions = ttk.Frame(timeline_card, style="Card.TFrame")
        timeline_actions.grid(row=4, column=0, sticky="ew", pady=(12, 0))
        timeline_actions.grid_columnconfigure(6, weight=1)
        ttk.Button(
            timeline_actions,
            text="编辑",
            command=self._edit_selected_step,
            style="Ghost.TButton",
        ).grid(row=0, column=0)
        ttk.Button(
            timeline_actions,
            text="上移",
            command=lambda: self._move_selected_step(-1),
            style="Ghost.TButton",
        ).grid(row=0, column=1, padx=(6, 0))
        ttk.Button(
            timeline_actions,
            text="下移",
            command=lambda: self._move_selected_step(1),
            style="Ghost.TButton",
        ).grid(row=0, column=2, padx=(6, 0))
        ttk.Button(
            timeline_actions,
            text="删除所选",
            command=self._delete_selected,
            style="Ghost.TButton",
        ).grid(row=0, column=3, padx=(6, 0))
        ttk.Button(
            timeline_actions,
            text="清空",
            command=self._clear_steps,
            style="Ghost.TButton",
        ).grid(row=0, column=4, padx=(6, 0))
        ttk.Button(
            timeline_actions,
            text="保存",
            command=self._save_steps,
            style="Ghost.TButton",
        ).grid(row=0, column=7, padx=(6, 0))
        ttk.Button(
            timeline_actions,
            text="打开",
            command=self._load_steps,
            style="Ghost.TButton",
        ).grid(row=0, column=8, padx=(6, 0))

        ttk.Label(playback_card, text="回放设置", style="CardTitle.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(
            playback_card,
            text="控制循环、速度和动作间隔",
            style="CardMuted.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(3, 14))

        playback_fields = ttk.Frame(playback_card, style="Card.TFrame")
        playback_fields.grid(row=2, column=0, sticky="ew")
        playback_fields.grid_columnconfigure(0, weight=1)
        playback_fields.grid_columnconfigure(1, weight=1)
        self._field(
            playback_fields,
            "循环次数（0 为持续）",
            self.seq_loop_count,
            row=0,
            column=0,
            padx=(0, 6),
        )
        self._field(
            playback_fields,
            "循环间隔（秒）",
            self.seq_loop_gap,
            row=0,
            column=1,
            padx=(6, 0),
        )
        self._field(
            playback_fields,
            "播放速度",
            self.seq_speed,
            row=2,
            column=0,
            padx=(0, 6),
        )
        self._field(
            playback_fields,
            "固定间隔（秒）",
            self.seq_fixed_interval,
            row=2,
            column=1,
            padx=(6, 0),
        )
        self._field(
            playback_fields,
            "录制默认按下（毫秒）",
            self.seq_hold,
            row=4,
            column=0,
            columnspan=2,
        )

        ttk.Checkbutton(
            playback_card,
            text="使用录制时的真实间隔",
            variable=self.seq_use_recorded,
            style="Card.TCheckbutton",
        ).grid(row=3, column=0, sticky="w", pady=(16, 6))
        ttk.Checkbutton(
            playback_card,
            text="每步完成后恢复鼠标位置",
            variable=self.seq_restore_all,
            style="Card.TCheckbutton",
        ).grid(row=4, column=0, sticky="w", pady=6)

        self.sequence_start_btn = ttk.Button(
            playback_card,
            text="开始回放 · F7",
            command=self._toggle_sequence_task,
            style="Primary.TButton",
        )
        self.sequence_start_btn.grid(row=5, column=0, sticky="ew", pady=(18, 0))

    def _build_status_area(self) -> None:
        status = ttk.Frame(self.root, style="App.TFrame", padding=(22, 10, 22, 12))
        status.grid(row=3, column=0, sticky="ew")
        status.grid_columnconfigure(2, weight=1)

        self.status_dot = ttk.Label(status, text="●", style="StatusDot.TLabel")
        self.status_dot.grid(row=0, column=0, padx=(0, 8))
        ttk.Label(
            status,
            textvariable=self.status_title,
            style="StatusTitle.TLabel",
        ).grid(row=0, column=1, sticky="w")
        ttk.Label(
            status,
            textvariable=self.status_detail,
            style="Muted.TLabel",
        ).grid(row=0, column=2, sticky="w", padx=(10, 0))
        ttk.Label(
            status,
            text="F6 录制 · F7 回放 · F8 定点点击 · F9 停止全部",
            style="Muted.TLabel",
        ).grid(row=0, column=3, padx=(12, 8))
        self.log_toggle_btn = ttk.Button(
            status,
            text="运行日志",
            command=self._toggle_log,
            style="Ghost.TButton",
        )
        self.log_toggle_btn.grid(row=0, column=4)

        self.log_frame = ttk.Frame(
            self.root,
            style="Log.TFrame",
            padding=(18, 0, 18, 14),
        )
        self.log_frame.grid(row=4, column=0, sticky="ew")
        self.log_frame.grid_columnconfigure(0, weight=1)
        self.log_box = tk.Text(
            self.log_frame,
            height=6,
            state="disabled",
            wrap="word",
            font=("Cascadia Mono", 9),
            relief="flat",
            padx=12,
            pady=10,
        )
        self.log_box.grid(row=0, column=0, sticky="ew")
        self.log_frame.grid_remove()

    def _field(
        self,
        parent: ttk.Frame,
        label: str,
        variable: tk.Variable,
        *,
        row: int,
        column: int,
        columnspan: int = 1,
        padx: tuple[int, int] = (0, 0),
    ) -> ttk.Entry:
        wrapper = ttk.Frame(parent, style="Card.TFrame")
        wrapper.grid(
            row=row,
            column=column,
            columnspan=columnspan,
            sticky="ew",
            padx=padx,
            pady=(0, 10),
        )
        wrapper.grid_columnconfigure(0, weight=1)
        ttk.Label(wrapper, text=label, style="FieldLabel.TLabel").grid(
            row=0, column=0, sticky="w", pady=(0, 5)
        )
        entry = ttk.Entry(wrapper, textvariable=variable, style="App.TEntry")
        entry.grid(row=1, column=0, sticky="ew")
        return entry

    def _combo_field(
        self,
        parent: ttk.Frame,
        label: str,
        variable: tk.Variable,
        values: List[str],
        *,
        row: int,
        column: int,
        padx: tuple[int, int] = (0, 0),
    ) -> ttk.Combobox:
        wrapper = ttk.Frame(parent, style="Card.TFrame")
        wrapper.grid(
            row=row,
            column=column,
            sticky="ew",
            padx=padx,
            pady=(0, 10),
        )
        wrapper.grid_columnconfigure(0, weight=1)
        ttk.Label(wrapper, text=label, style="FieldLabel.TLabel").grid(
            row=0, column=0, sticky="w", pady=(0, 5)
        )
        combo = ttk.Combobox(
            wrapper,
            textvariable=variable,
            values=values,
            state="readonly",
            style="App.TCombobox",
        )
        combo.grid(row=1, column=0, sticky="ew")
        combo.bind(
            "<<ComboboxSelected>>",
            lambda _event: self.single_button.set(
                BUTTON_VALUES_BY_LABEL.get(self.single_button_label.get(), "left")
            ),
        )
        return combo

    def _stat(
        self,
        parent: ttk.Frame,
        label: str,
        variable: tk.StringVar,
        column: int,
    ) -> None:
        frame = ttk.Frame(parent, style="Card.TFrame")
        frame.grid(row=0, column=column, sticky="ew", padx=(0 if column == 0 else 8, 0))
        ttk.Label(frame, text=label, style="CardMuted.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(frame, textvariable=variable, style="Stat.TLabel").grid(
            row=1, column=0, sticky="w", pady=(3, 0)
        )

    # ------------------------------------------------------------------
    # Theme and navigation
    # ------------------------------------------------------------------
    def _on_theme_selected(self, _event=None) -> None:
        value = THEME_VALUES_BY_LABEL.get(self.theme_label.get(), "system")
        self._apply_theme_choice(value)

    def _apply_theme_choice(self, choice: object) -> None:
        normalized = normalize_theme(choice)
        self.theme_choice.set(normalized)
        self.theme_label.set(THEME_LABELS[normalized])
        self.current_palette = palette_for(normalized)
        save_theme(self.settings_file, normalized)
        self._configure_styles(self.current_palette)
        self._refresh_widget_colors()
        self._draw_point_preview()

    def _configure_styles(self, palette: ThemePalette) -> None:
        self.root.configure(bg=palette.background)

        self.style.configure("App.TFrame", background=palette.background)
        self.style.configure("Card.TFrame", background=palette.card)
        self.style.configure("Log.TFrame", background=palette.background)

        self.style.configure(
            "TLabel",
            background=palette.background,
            foreground=palette.text,
            font=("Segoe UI", 10),
        )
        self.style.configure(
            "BrandMark.TLabel",
            background=palette.accent,
            foreground=palette.accent_text,
            font=("Segoe UI", 13, "bold"),
            padding=(10, 7),
        )
        self.style.configure(
            "Brand.TLabel",
            background=palette.background,
            foreground=palette.text,
            font=("Segoe UI Variable Display", 18, "bold"),
        )
        self.style.configure(
            "Muted.TLabel",
            background=palette.background,
            foreground=palette.muted,
            font=("Segoe UI", 9),
        )
        self.style.configure(
            "CardTitle.TLabel",
            background=palette.card,
            foreground=palette.text,
            font=("Segoe UI Variable Display", 12, "bold"),
        )
        self.style.configure(
            "CardMuted.TLabel",
            background=palette.card,
            foreground=palette.muted,
            font=("Segoe UI", 9),
        )
        self.style.configure(
            "FieldLabel.TLabel",
            background=palette.card,
            foreground=palette.text,
            font=("Segoe UI", 9),
        )
        self.style.configure(
            "Stat.TLabel",
            background=palette.card,
            foreground=palette.text,
            font=("Segoe UI", 10, "bold"),
        )
        self.style.configure(
            "StatusTitle.TLabel",
            background=palette.background,
            foreground=palette.text,
            font=("Segoe UI", 10, "bold"),
        )
        self.style.configure(
            "StatusPill.TLabel",
            background=palette.selected,
            foreground=palette.accent,
            font=("Segoe UI", 9, "bold"),
        )
        self.style.configure(
            "StatusDot.TLabel",
            background=palette.background,
            foreground=palette.success,
            font=("Segoe UI", 9),
        )

        base_button = {
            "font": ("Segoe UI", 9),
            "padding": (13, 8),
            "borderwidth": 0,
        }
        self.style.configure(
            "Primary.TButton",
            **base_button,
            background=palette.accent,
            foreground=palette.accent_text,
        )
        self.style.map(
            "Primary.TButton",
            background=[
                ("pressed", palette.accent_hover),
                ("active", palette.accent_hover),
                ("disabled", palette.border),
            ],
            foreground=[("disabled", palette.muted)],
        )
        self.style.configure(
            "Danger.TButton",
            **base_button,
            background=palette.danger,
            foreground=palette.accent_text,
        )
        self.style.map(
            "Danger.TButton",
            background=[
                ("pressed", palette.danger_hover),
                ("active", palette.danger_hover),
            ],
        )
        self.style.configure(
            "Secondary.TButton",
            **base_button,
            background=palette.selected,
            foreground=palette.accent,
        )
        self.style.map(
            "Secondary.TButton",
            background=[("pressed", palette.border), ("active", palette.card_alt)],
        )
        self.style.configure(
            "Ghost.TButton",
            **base_button,
            background=palette.card,
            foreground=palette.text,
        )
        self.style.map(
            "Ghost.TButton",
            background=[("pressed", palette.selected), ("active", palette.card_alt)],
        )
        mode_button = {**base_button, "padding": (16, 10)}
        self.style.configure(
            "Mode.TButton",
            **mode_button,
            background=palette.card_alt,
            foreground=palette.muted,
        )
        self.style.configure(
            "Selected.Mode.TButton",
            **mode_button,
            background=palette.accent,
            foreground=palette.accent_text,
        )
        self.style.map(
            "Mode.TButton",
            background=[("active", palette.selected)],
            foreground=[("active", palette.text)],
        )
        self.style.map(
            "Selected.Mode.TButton",
            background=[
                ("active", palette.accent_hover),
                ("pressed", palette.accent_hover),
            ],
        )

        self.style.configure(
            "App.TEntry",
            fieldbackground=palette.field,
            foreground=palette.text,
            bordercolor=palette.border,
            lightcolor=palette.border,
            darkcolor=palette.border,
            insertcolor=palette.text,
            padding=(9, 8),
        )
        self.style.configure(
            "App.TCombobox",
            fieldbackground=palette.field,
            background=palette.field,
            foreground=palette.text,
            arrowcolor=palette.text,
            bordercolor=palette.border,
            lightcolor=palette.border,
            darkcolor=palette.border,
            padding=(8, 7),
        )
        self.style.map(
            "App.TCombobox",
            fieldbackground=[("readonly", palette.field)],
            foreground=[("readonly", palette.text)],
            selectbackground=[("readonly", palette.field)],
            selectforeground=[("readonly", palette.text)],
        )
        self.style.configure(
            "Card.TCheckbutton",
            background=palette.card,
            foreground=palette.text,
            indicatorcolor=palette.field,
            padding=(0, 4),
        )
        self.style.map(
            "Card.TCheckbutton",
            background=[("active", palette.card)],
            indicatorcolor=[
                ("selected", palette.accent),
                ("pressed", palette.accent_hover),
            ],
        )
        self.style.configure(
            "Sequence.Treeview",
            background=palette.card,
            fieldbackground=palette.card,
            foreground=palette.text,
            bordercolor=palette.border,
            rowheight=36,
            font=("Segoe UI", 9),
        )
        self.style.configure(
            "Sequence.Treeview.Heading",
            background=palette.card_alt,
            foreground=palette.muted,
            bordercolor=palette.border,
            font=("Segoe UI", 9, "bold"),
            padding=(6, 8),
        )
        self.style.map(
            "Sequence.Treeview",
            background=[("selected", palette.selected)],
            foreground=[("selected", palette.text)],
        )

    def _refresh_widget_colors(self) -> None:
        palette = self.current_palette
        if hasattr(self, "point_canvas"):
            self.point_canvas.configure(
                bg=palette.card_alt,
                highlightbackground=palette.border,
                highlightcolor=palette.accent,
            )
        if hasattr(self, "log_box"):
            self.log_box.configure(
                bg=palette.card,
                fg=palette.text,
                insertbackground=palette.text,
                selectbackground=palette.selected,
                selectforeground=palette.text,
            )

    def _show_mode(self, name: str) -> None:
        if name not in {"point", "sequence"}:
            raise ValueError(f"Unknown mode: {name}")
        target = self.point_frame if name == "point" else self.sequence_frame
        target.tkraise()
        self.active_mode.set(name)
        self.point_mode_btn.configure(
            style="Selected.Mode.TButton" if name == "point" else "Mode.TButton"
        )
        self.sequence_mode_btn.configure(
            style="Selected.Mode.TButton" if name == "sequence" else "Mode.TButton"
        )

    def _toggle_log(self) -> None:
        expanded = not self.log_expanded.get()
        self.log_expanded.set(expanded)
        if expanded:
            self.log_frame.grid()
            self.log_toggle_btn.configure(text="收起日志")
            self._drain_log_queue()
        else:
            self.log_frame.grid_remove()
            self.log_toggle_btn.configure(text="运行日志")

    # ------------------------------------------------------------------
    # Shared status and validation
    # ------------------------------------------------------------------
    def _set_status(self, state: str, title: str, detail: str) -> None:
        self.status_state.set(state)
        self.status_title.set(title)
        self.status_detail.set(detail)
        color = {
            "ready": self.current_palette.success,
            "running": self.current_palette.accent,
            "recording": self.current_palette.danger,
            "paused": self.current_palette.warning,
            "error": self.current_palette.danger,
        }.get(state, self.current_palette.muted)
        self.style.configure(
            "StatusDot.TLabel",
            foreground=color,
            background=self.current_palette.background,
        )

    def _dispatch_ui(self, callback: Callable[[], None]) -> None:
        self.ui_queue.put(callback)

    @staticmethod
    def _cooperative_wait(
        pause_event: threading.Event,
        stop_event: threading.Event,
        seconds: float,
    ) -> bool:
        remaining = max(0.0, seconds)
        while remaining > 0 or pause_event.is_set():
            if stop_event.is_set():
                return True
            if pause_event.is_set():
                stop_event.wait(0.05)
                continue
            slice_seconds = min(0.05, remaining)
            started = time.monotonic()
            if stop_event.wait(slice_seconds):
                return True
            remaining = max(0.0, remaining - (time.monotonic() - started))
        return stop_event.is_set()

    def _read_int(
        self,
        variable: tk.StringVar,
        label: str,
        *,
        minimum: Optional[int] = None,
    ) -> int:
        try:
            value = int(float(variable.get()))
        except ValueError as exc:
            raise ValueError(f"{label}必须是整数") from exc
        if minimum is not None and value < minimum:
            raise ValueError(f"{label}不能小于 {minimum}")
        return value

    def _read_float(
        self,
        variable: tk.StringVar,
        label: str,
        *,
        minimum: Optional[float] = None,
    ) -> float:
        try:
            value = float(variable.get())
        except ValueError as exc:
            raise ValueError(f"{label}必须是数字") from exc
        if minimum is not None and value < minimum:
            raise ValueError(f"{label}不能小于 {minimum}")
        return value

    def _show_validation_error(self, error: ValueError) -> None:
        self._set_status("error", "参数有误", str(error))
        messagebox.showerror("参数有误", str(error), parent=self.root)

    def _log(self, message: str) -> None:
        self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] {message}")

    @staticmethod
    def _format_input_error(error: BaseException) -> str:
        message = str(error)
        if platform.system() == "Darwin":
            message += (
                "\n\n请在“系统设置 → 隐私与安全性”中允许 ClickFlow 使用"
                "“辅助功能”；如果录制仍不可用，请同时检查“输入监控”，"
                "然后彻底退出并重新打开应用。"
            )
        return message

    def _require_mouse(self) -> object:
        if self.mouse is not None:
            return self.mouse
        if self.input_initialization_error is not None:
            raise self.input_initialization_error
        raise InputControlError("鼠标输入组件不可用。")

    def _refresh_window_bounds(self) -> None:
        try:
            if (
                not self.root.winfo_exists()
                or not self.root.winfo_ismapped()
                or self.root.state() in ("withdrawn", "iconic")
            ):
                self._window_bounds = None
                return
            left = int(self.root.winfo_rootx())
            top = int(self.root.winfo_rooty())
            width = int(self.root.winfo_width())
            height = int(self.root.winfo_height())
            if width <= 1 or height <= 1:
                self._window_bounds = None
                return
            self._window_bounds = (
                left,
                top,
                left + width,
                top + height,
            )
        except tk.TclError:
            self._window_bounds = None

    def _is_recordable_point(self, x: int, y: int) -> bool:
        bounds = self._window_bounds
        if bounds is None:
            return True
        left, top, right, bottom = bounds
        inside = left <= int(x) < right and top <= int(y) < bottom
        return not inside

    def _drain_log_queue(self) -> None:
        if not hasattr(self, "log_box"):
            return
        try:
            while True:
                message = self.log_queue.get_nowait()
                self.log_box.configure(state="normal")
                self.log_box.insert("end", message + "\n")
                self.log_box.configure(state="disabled")
                self.log_box.see("end")
        except queue.Empty:
            pass

    def _drain_ui_queue(self) -> None:
        try:
            while True:
                callback = self.ui_queue.get_nowait()
                try:
                    callback()
                except tk.TclError:
                    pass
        except queue.Empty:
            pass

    def _drain_record_queue(self) -> None:
        try:
            while True:
                self._append_step(self.record_queue.get_nowait())
        except queue.Empty:
            pass

    def _tick_log(self) -> None:
        self._refresh_window_bounds()
        self._drain_ui_queue()
        self._drain_record_queue()
        self._drain_log_queue()
        if self.start_timers:
            self.root.after(120, self._tick_log)

    # ------------------------------------------------------------------
    # Point-click workspace
    # ------------------------------------------------------------------
    def _bind_variable_updates(self) -> None:
        for variable in (
            self.single_x,
            self.single_y,
            self.single_interval,
            self.single_count,
        ):
            variable.trace_add("write", self._point_value_changed)
        self.single_restore.trace_add("write", self._point_value_changed)

    def _point_value_changed(self, *_args) -> None:
        self._update_point_summary()
        self._draw_point_preview()

    def _update_point_summary(self) -> None:
        try:
            interval = float(self.single_interval.get())
            frequency = 1.0 / interval if interval > 0 else 0.0
            self.point_frequency.set(f"{frequency:.2g} 次/秒")
        except ValueError:
            self.point_frequency.set("—")

        try:
            count = int(float(self.single_count.get()))
            self.point_count_summary.set("持续" if count == 0 else f"{count} 次")
        except ValueError:
            self.point_count_summary.set("—")
        self.point_restore_summary.set(
            "已开启" if self.single_restore.get() else "已关闭"
        )

    def _update_cursor_preview(self) -> None:
        try:
            x, y = self._require_mouse().get_cursor_pos()
            self.cursor_summary.set(f"当前位置 {x}, {y}")
        except Exception as exc:
            self.cursor_summary.set("无法读取鼠标位置")
            self._log(f"读取鼠标位置失败：{self._format_input_error(exc)}")
        if self.start_timers:
            self.root.after(200, self._update_cursor_preview)

    def _draw_point_preview(self) -> None:
        if not hasattr(self, "point_canvas"):
            return
        canvas = self.point_canvas
        width = max(120, canvas.winfo_width())
        height = max(160, canvas.winfo_height())
        palette = self.current_palette
        canvas.delete("all")

        grid_color = palette.border
        for x in range(0, width, 28):
            canvas.create_line(x, 0, x, height, fill=grid_color)
        for y in range(0, height, 28):
            canvas.create_line(0, y, width, y, fill=grid_color)

        try:
            target_x = int(float(self.single_x.get()))
            target_y = int(float(self.single_y.get()))
        except ValueError:
            target_x = target_y = 0

        screen_width = max(1, self.root.winfo_screenwidth())
        screen_height = max(1, self.root.winfo_screenheight())
        px = max(18, min(width - 18, target_x / screen_width * width))
        py = max(18, min(height - 18, target_y / screen_height * height))

        canvas.create_oval(
            px - 18,
            py - 18,
            px + 18,
            py + 18,
            outline=palette.accent,
            width=2,
        )
        canvas.create_line(px - 28, py, px + 28, py, fill=palette.accent, width=1)
        canvas.create_line(px, py - 28, px, py + 28, fill=palette.accent, width=1)
        canvas.create_text(
            px,
            min(height - 12, py + 35),
            text=f"{target_x} × {target_y}",
            fill=palette.text,
            font=("Segoe UI", 9, "bold"),
        )

    def _pickup_cursor(self) -> None:
        try:
            x, y = self._require_mouse().get_cursor_pos()
        except Exception as exc:
            message = self._format_input_error(exc)
            self._set_status("error", "读取失败", message)
            messagebox.showerror("读取失败", message, parent=self.root)
            return
        self.single_x.set(str(x))
        self.single_y.set(str(y))
        self._set_status("ready", "位置已更新", f"目标坐标 {x}, {y}")
        self._log(f"拾取位置：({x}, {y})")

    def _toggle_point_task(self) -> None:
        if self.single_task and self.single_task.is_alive():
            if self.single_pause.is_set():
                self.single_pause.clear()
                self.point_start_btn.configure(text="暂停点击 · F8")
                self._set_status(
                    "running",
                    "定点点击运行中",
                    "已继续执行",
                )
            else:
                self.single_pause.set()
                self.point_start_btn.configure(text="继续点击 · F8")
                self._set_status(
                    "paused",
                    "定点点击已暂停",
                    "点击继续或按 F9 停止",
                )
        else:
            self._start_single()

    def _start_single(self) -> None:
        try:
            x = self._read_int(self.single_x, "X 坐标")
            y = self._read_int(self.single_y, "Y 坐标")
            interval = self._read_float(
                self.single_interval,
                "点击间隔",
                minimum=0.001,
            )
            count = self._read_int(self.single_count, "执行次数", minimum=0)
            hold = self._read_int(self.single_hold, "按下时长", minimum=1)
        except ValueError as error:
            self._show_validation_error(error)
            return

        self.single_stop.clear()
        self.single_pause.clear()
        button = BUTTON_VALUES_BY_LABEL.get(
            self.single_button_label.get(),
            self.single_button.get(),
        )
        self.single_button.set(button)
        restore = bool(self.single_restore.get())
        self.single_task = threading.Thread(
            target=self._single_worker,
            args=(x, y, interval, count, button, hold, restore),
            daemon=True,
        )
        self.single_task.start()
        self.point_start_btn.configure(text="暂停点击 · F8")
        self._set_status("running", "定点点击运行中", f"每 {interval:g} 秒执行一次")
        self._log(
            f"开始定点点击：({x}, {y})，{button}，间隔 {interval:g} 秒，"
            f"次数 {'持续' if count == 0 else count}"
        )

    def _single_worker(
        self,
        x: int,
        y: int,
        interval: float,
        count: int,
        button: str,
        hold: int,
        restore: bool,
    ) -> None:
        executed = 0
        failed = False
        try:
            visible_count = 0

            def click_once() -> None:
                nonlocal visible_count
                self._require_mouse().click(
                    x=x,
                    y=y,
                    button=button,
                    hold_ms=hold,
                    restore_cursor=restore,
                )
                visible_count += 1
                self._dispatch_ui(
                    lambda done=visible_count: self.status_detail.set(
                        f"已执行 {done} 次 · 下一次将在 {interval:g} 秒后"
                    )
                )

            executed = run_point_clicks(
                count=count,
                interval=interval,
                stop_event=self.single_stop,
                click=click_once,
                wait=lambda seconds: self._cooperative_wait(
                    self.single_pause,
                    self.single_stop,
                    seconds,
                ),
            )
        except Exception as exc:
            failed = True
            message = self._format_input_error(exc)
            self._log(f"定点点击失败：{message}")
            self._dispatch_ui(
                lambda detail=message: self._set_status(
                    "error",
                    "定点点击失败",
                    detail,
                )
            )
            self._dispatch_ui(
                lambda detail=message: messagebox.showerror(
                    "定点点击失败",
                    detail,
                    parent=self.root,
                )
            )
        finally:
            self._dispatch_ui(
                lambda: self.point_start_btn.configure(text="开始点击 · F8")
            )
            if not failed:
                self._dispatch_ui(
                    lambda: self._set_status(
                        "ready",
                        "定点点击已停止",
                        f"本次执行 {executed} 次",
                    )
                )
            self._log(f"定点点击结束，共执行 {executed} 次")

    def _stop_single(self) -> None:
        self.single_stop.set()
        self.single_pause.clear()
        if hasattr(self, "point_start_btn"):
            self.point_start_btn.configure(text="开始点击 · F8")

    # ------------------------------------------------------------------
    # Recording and sequence playback
    # ------------------------------------------------------------------
    def _toggle_recording(self) -> None:
        if self.is_recording:
            self._stop_record()
        else:
            self._start_record()

    def _start_record(self) -> None:
        try:
            hold = self._read_int(self.seq_hold, "默认按下时长", minimum=1)
            mouse = self._require_mouse()
        except ValueError as error:
            self._show_validation_error(error)
            return
        except InputControlError as error:
            message = self._format_input_error(error)
            self._set_status("error", "无法开始录制", message)
            messagebox.showerror("无法开始录制", message, parent=self.root)
            return

        self._refresh_window_bounds()
        recorder = ClickRecorder(
            on_step=self.record_queue.put,
            listener_factory=mouse.create_listener,
            default_hold=hold,
            default_restore=bool(self.seq_restore_all.get()),
            capture_filter=self._is_recordable_point,
        )
        try:
            recorder.start()
        except Exception as error:
            message = self._format_input_error(error)
            self._set_status("error", "无法开始录制", message)
            messagebox.showerror("无法开始录制", message, parent=self.root)
            self._log(f"开始录制失败：{message}")
            return

        self.recorder = recorder
        self.is_recording = True
        self.btn_record.configure(text="结束录制 · F6")
        self._set_status("recording", "正在录制动作", "点击屏幕任意位置以添加动作")
        self._log("开始录制鼠标点击")

    def _stop_record(self) -> None:
        if not self.is_recording:
            return
        self.is_recording = False
        if self.recorder:
            self.recorder.stop()
            self.recorder = None
        self._drain_record_queue()
        if hasattr(self, "btn_record"):
            self.btn_record.configure(text="开始录制 · F6")
        self._set_status(
            "ready",
            "录制已结束",
            f"当前共有 {len(self.steps)} 个动作",
        )
        self._log(f"结束录制，共 {len(self.steps)} 个动作")

    def _append_step(self, step: ClickStep) -> None:
        self.steps.append(step)
        self._refresh_steps_view(select_index=len(self.steps) - 1)
        self._set_status(
            "recording" if self.is_recording else "ready",
            "正在录制动作" if self.is_recording else "动作已添加",
            f"已添加第 {len(self.steps)} 个动作",
        )

    def _add_current_as_step(self) -> None:
        try:
            x, y = self._require_mouse().get_cursor_pos()
            hold = self._read_int(self.seq_hold, "默认按下时长", minimum=1)
        except InputControlError as error:
            message = self._format_input_error(error)
            self._set_status("error", "读取失败", message)
            messagebox.showerror("读取失败", message, parent=self.root)
            return
        except ValueError as error:
            self._show_validation_error(error)
            return
        step = ClickStep(
            x=x,
            y=y,
            button=BUTTON_VALUES_BY_LABEL.get(
                self.single_button_label.get(),
                "left",
            ),
            delay=0.0,
            hold_ms=hold,
            restore_cursor=bool(self.seq_restore_all.get()),
        )
        self._append_step(step)
        self._log(f"手动添加动作：({x}, {y})")

    def _selected_indices(self) -> List[int]:
        return sorted(self.seq_tree.index(item) for item in self.seq_tree.selection())

    def _move_selected_step(self, delta: int) -> None:
        indices = self._selected_indices()
        if len(indices) != 1:
            self._set_status("ready", "请选择一个动作", "每次只能调整一个动作")
            return
        self.steps, selected_index = move_step(self.steps, indices[0], delta)
        self._refresh_steps_view(select_index=selected_index)
        self._set_status(
            "ready",
            "动作顺序已更新",
            f"当前为第 {selected_index + 1} 个动作",
        )

    def _edit_selected_step(self) -> None:
        indices = self._selected_indices()
        if len(indices) != 1:
            self._set_status("ready", "请选择一个动作", "双击或选中一行后编辑")
            return
        index = indices[0]
        step = self.steps[index]

        dialog = tk.Toplevel(self.root)
        dialog.title(f"编辑动作 {index + 1}")
        dialog.transient(self.root)
        dialog.resizable(False, False)
        dialog.configure(bg=self.current_palette.background)
        dialog.grab_set()

        body = ttk.Frame(dialog, style="Card.TFrame", padding=20)
        body.grid(row=0, column=0, sticky="nsew", padx=12, pady=12)
        body.grid_columnconfigure(0, weight=1)
        body.grid_columnconfigure(1, weight=1)

        x_var = tk.StringVar(value=str(step.x))
        y_var = tk.StringVar(value=str(step.y))
        button_label_var = tk.StringVar(
            value=BUTTON_LABELS.get(step.button, BUTTON_LABELS["left"])
        )
        delay_var = tk.StringVar(value=f"{step.delay:g}")
        hold_var = tk.StringVar(value=str(step.hold_ms))
        restore_var = tk.BooleanVar(value=step.restore_cursor)

        self._field(body, "X 坐标", x_var, row=0, column=0, padx=(0, 5))
        self._field(body, "Y 坐标", y_var, row=0, column=1, padx=(5, 0))

        button_wrap = ttk.Frame(body, style="Card.TFrame")
        button_wrap.grid(row=2, column=0, sticky="ew", padx=(0, 5), pady=(0, 10))
        button_wrap.grid_columnconfigure(0, weight=1)
        ttk.Label(
            button_wrap,
            text="鼠标按键",
            style="FieldLabel.TLabel",
        ).grid(row=0, column=0, sticky="w", pady=(0, 5))
        ttk.Combobox(
            button_wrap,
            textvariable=button_label_var,
            values=list(BUTTON_VALUES_BY_LABEL),
            state="readonly",
            style="App.TCombobox",
        ).grid(row=1, column=0, sticky="ew")

        self._field(
            body,
            "等待时间（秒）",
            delay_var,
            row=2,
            column=1,
            padx=(5, 0),
        )
        self._field(
            body,
            "按下时长（毫秒）",
            hold_var,
            row=4,
            column=0,
            columnspan=2,
        )
        ttk.Checkbutton(
            body,
            text="完成后恢复鼠标位置",
            variable=restore_var,
            style="Card.TCheckbutton",
        ).grid(row=6, column=0, columnspan=2, sticky="w", pady=(2, 12))

        actions = ttk.Frame(body, style="Card.TFrame")
        actions.grid(row=7, column=0, columnspan=2, sticky="e")

        def save_edit() -> None:
            try:
                updated = ClickStep(
                    x=self._read_int(x_var, "X 坐标"),
                    y=self._read_int(y_var, "Y 坐标"),
                    button=BUTTON_VALUES_BY_LABEL.get(
                        button_label_var.get(),
                        "left",
                    ),
                    delay=self._read_float(
                        delay_var,
                        "等待时间",
                        minimum=0.0,
                    ),
                    hold_ms=self._read_int(
                        hold_var,
                        "按下时长",
                        minimum=1,
                    ),
                    restore_cursor=bool(restore_var.get()),
                )
            except ValueError as error:
                messagebox.showerror(
                    "参数有误",
                    str(error),
                    parent=dialog,
                )
                return
            self.steps[index] = updated
            self._refresh_steps_view(select_index=index)
            self._set_status(
                "ready",
                "动作已更新",
                f"已保存第 {index + 1} 个动作",
            )
            dialog.destroy()

        ttk.Button(
            actions,
            text="取消",
            command=dialog.destroy,
            style="Ghost.TButton",
        ).grid(row=0, column=0)
        ttk.Button(
            actions,
            text="保存修改",
            command=save_edit,
            style="Primary.TButton",
        ).grid(row=0, column=1, padx=(8, 0))
        dialog.bind("<Escape>", lambda _event: dialog.destroy())
        dialog.bind("<Return>", lambda _event: save_edit())
        dialog.update_idletasks()
        dialog.geometry(
            f"+{self.root.winfo_rootx() + 80}+{self.root.winfo_rooty() + 80}"
        )

    def _delete_selected(self) -> None:
        indices = set(self._selected_indices())
        if not indices:
            return
        self.steps = [step for index, step in enumerate(self.steps) if index not in indices]
        self._refresh_steps_view()
        self._set_status("ready", "动作已删除", f"还剩 {len(self.steps)} 个动作")
        self._log(f"删除 {len(indices)} 个动作")

    def _clear_steps(self) -> None:
        if not self.steps:
            return
        if not messagebox.askyesno(
            "清空动作",
            "确定删除全部已录制动作吗？",
            parent=self.root,
        ):
            return
        self.steps.clear()
        self._refresh_steps_view()
        self._set_status("ready", "动作已清空", "可重新录制或打开序列")
        self._log("清空全部动作")

    def _refresh_steps_view(self, select_index: Optional[int] = None) -> None:
        if not hasattr(self, "seq_tree"):
            return
        self.seq_tree.delete(*self.seq_tree.get_children())
        for index, step in enumerate(self.steps, start=1):
            item = self.seq_tree.insert(
                "",
                "end",
                values=(
                    index,
                    BUTTON_LABELS.get(step.button, step.button),
                    f"{step.x}, {step.y}",
                    "立即" if index == 1 else f"{step.delay:.2f} 秒",
                    f"{step.hold_ms} ms",
                    "开启" if step.restore_cursor else "关闭",
                ),
            )
            if select_index == index - 1:
                self.seq_tree.selection_set(item)
                self.seq_tree.see(item)
        total = sum(max(0.0, step.delay) for step in self.steps[1:])
        self.sequence_summary.set(
            f"{len(self.steps)} 个动作 · 总时长 {total:.2f} 秒"
        )
        self.recorder_summary.set(f"已记录 {len(self.steps)} 个动作")

    def _save_steps(self) -> None:
        if not self.steps:
            messagebox.showwarning("无法保存", "当前没有可保存的动作。", parent=self.root)
            return
        file_path = filedialog.asksaveasfilename(
            title="保存动作序列",
            defaultextension=".json",
            filetypes=[("JSON 文件", "*.json"), ("所有文件", "*.*")],
            parent=self.root,
        )
        if not file_path:
            return
        payload = {
            "version": self.VERSION,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "steps": [step.to_dict() for step in self.steps],
        }
        try:
            Path(file_path).write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as exc:
            messagebox.showerror("保存失败", str(exc), parent=self.root)
            self._set_status("error", "保存失败", str(exc))
            return
        self._set_status("ready", "序列已保存", Path(file_path).name)
        self._log(f"保存 {len(self.steps)} 个动作到 {file_path}")

    def _load_steps(self) -> None:
        file_path = filedialog.askopenfilename(
            title="打开动作序列",
            filetypes=[("JSON 文件", "*.json"), ("所有文件", "*.*")],
            parent=self.root,
        )
        if not file_path:
            return
        try:
            raw = json.loads(Path(file_path).read_text(encoding="utf-8"))
            raw_steps = raw.get("steps", [])
            if not isinstance(raw_steps, list):
                raise ValueError("动作序列格式无效")
            loaded_steps = [ClickStep.from_dict(item) for item in raw_steps]
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            messagebox.showerror("打开失败", str(exc), parent=self.root)
            self._set_status("error", "打开失败", str(exc))
            self._log(f"打开序列失败：{exc}")
            return
        self.steps = loaded_steps
        self._refresh_steps_view()
        self._set_status("ready", "序列已打开", f"{len(self.steps)} 个动作")
        self._log(f"从 {file_path} 打开 {len(self.steps)} 个动作")

    def _toggle_sequence_task(self) -> None:
        if self.seq_task and self.seq_task.is_alive():
            if self.seq_pause.is_set():
                self.seq_pause.clear()
                self.sequence_start_btn.configure(text="暂停回放 · F7")
                self._set_status("running", "序列回放中", "已继续执行")
            else:
                self.seq_pause.set()
                self.sequence_start_btn.configure(text="继续回放 · F7")
                self._set_status(
                    "paused",
                    "序列回放已暂停",
                    "点击继续或按 F9 停止",
                )
        else:
            self._start_sequence()

    def _playback_config(self) -> PlaybackConfig:
        return PlaybackConfig(
            loops=self._read_int(self.seq_loop_count, "循环次数", minimum=0),
            loop_gap=self._read_float(
                self.seq_loop_gap,
                "循环间隔",
                minimum=0.0,
            ),
            speed=self._read_float(self.seq_speed, "播放速度", minimum=0.01),
            fixed_interval=self._read_float(
                self.seq_fixed_interval,
                "固定间隔",
                minimum=0.0,
            ),
            use_recorded_delays=bool(self.seq_use_recorded.get()),
            restore_cursor=bool(self.seq_restore_all.get()),
        )

    def _start_sequence(self) -> None:
        if not self.steps:
            messagebox.showwarning(
                "没有动作",
                "请先录制、添加或打开动作序列。",
                parent=self.root,
            )
            return
        try:
            config = self._playback_config()
        except ValueError as error:
            self._show_validation_error(error)
            return

        self.seq_stop.clear()
        self.seq_pause.clear()
        self.seq_task = threading.Thread(
            target=self._sequence_worker,
            args=(list(self.steps), config),
            daemon=True,
        )
        self.seq_task.start()
        self.sequence_start_btn.configure(text="暂停回放 · F7")
        duration = sequence_duration(self.steps, config)
        duration_text = "持续循环" if config.loops == 0 else f"预计 {duration:.2f} 秒"
        self._set_status("running", "序列回放中", duration_text)
        self._log(
            f"开始回放：{'持续' if config.loops == 0 else config.loops} 轮，"
            f"速度 {config.speed:g}×"
        )

    def _sequence_worker(
        self,
        steps: List[ClickStep],
        config: PlaybackConfig,
    ) -> None:
        try:
            completed = run_playback(
                steps=steps,
                config=config,
                stop_event=self.seq_stop,
                click=lambda step, restore: self._require_mouse().click(
                    x=step.x,
                    y=step.y,
                    button=step.button,
                    hold_ms=step.hold_ms,
                    restore_cursor=restore,
                ),
                wait=lambda seconds: self._cooperative_wait(
                    self.seq_pause,
                    self.seq_stop,
                    seconds,
                ),
            )
            self._dispatch_ui(
                lambda: self._set_status(
                    "ready",
                    "序列回放已停止",
                    f"完成 {completed} 轮",
                )
            )
            self._log(f"序列回放结束，共完成 {completed} 轮")
        except Exception as exc:
            message = self._format_input_error(exc)
            self._log(f"序列回放失败：{message}")
            self._dispatch_ui(
                lambda detail=message: self._set_status(
                    "error",
                    "序列回放失败",
                    detail,
                )
            )
            self._dispatch_ui(
                lambda detail=message: messagebox.showerror(
                    "序列回放失败",
                    detail,
                    parent=self.root,
                )
            )
        finally:
            self._dispatch_ui(
                lambda: self.sequence_start_btn.configure(text="开始回放 · F7")
            )

    def _stop_sequence(self) -> None:
        self.seq_stop.set()
        self.seq_pause.clear()
        if hasattr(self, "sequence_start_btn"):
            self.sequence_start_btn.configure(text="开始回放 · F7")

    def _stop_all(self) -> None:
        had_work = (
            self.is_recording
            or bool(self.single_task and self.single_task.is_alive())
            or bool(self.seq_task and self.seq_task.is_alive())
        )
        self._stop_record()
        self._stop_single()
        self._stop_sequence()
        self._set_status(
            "ready",
            "已停止全部任务" if had_work else "系统就绪",
            "没有正在运行的自动化",
        )
        if had_work:
            self._log("停止全部任务")

    # ------------------------------------------------------------------
    # App lifecycle
    # ------------------------------------------------------------------
    def _bind_close(self) -> None:
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _bind_shortcuts(self) -> None:
        self.root.bind_all("<F6>", lambda _event: self._toggle_recording())
        self.root.bind_all("<F7>", lambda _event: self._toggle_sequence_task())
        self.root.bind_all("<F8>", lambda _event: self._toggle_point_task())
        self.root.bind_all("<F9>", lambda _event: self._stop_all())
        self.root.bind_all("<Control-s>", lambda _event: self._save_steps())
        self.root.bind_all("<Control-o>", lambda _event: self._load_steps())

    def _on_close(self) -> None:
        self._stop_all()
        self.root.after(80, self.root.destroy)

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    AutoClickerApp().run()
