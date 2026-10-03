# Lighthouse Live Inbox Overflow Fail-Stop Design

## Intent

An authorised future Douyin adapter must not silently lose viewer input when the bounded Unity inbox fills. The public game remains a local simulation until an actual SDK, permissions and test room are available.

## Behaviour

- `LiveMessageInbox` distinguishes an accepted post, an invalid/unbound post and a full queue, while retaining the existing `Post(...): bool` convenience API.
- The `ILiveMessageSource.Start` callback still returns `false` when input cannot be queued. A full queue additionally sets a thread-safe terminal overflow signal; invalid input or an ordinary disconnection does not.
- At the start of the next Unity frame, before draining the inbox or advancing the timer, `RescueController` consumes that signal, marks the live session `Faulted`, stops the source, suppresses all pending receipts, and recovers the last readable durable same-room snapshot plus journal. Host controls remain disabled until restart. An already acknowledged, durable action survives recovery; queued unacknowledged actions do not apply.
- The streamer sees `直播已停止 · 输入过载` and `弹幕输入过载，已停止；检查流量后重启。`. A storage fault keeps its distinct diagnosis. Weather audio and lightning stop in either fault.
- An ordinary network disconnect still drains messages accepted before disconnect and then pauses. A post rejected only because the source is disconnected does not trigger overflow.

## Boundaries

- No official SDK types, credentials, or speculative ACK calls enter the shared Windows/WebGL runtime.
- A callback from a background thread may only set the signal or append to the inbox; it must not call Unity UI, stop the SDK source, or read mutable game state.
- Overflow handling is fail-stop for this process. Backpressure, SDK redelivery and official fulfilment ACK semantics require an authorised real room to validate.

## Verification

- Unity EditMode: post-result classification; overflow before frame drain; already durable action retained; no receipt for queued messages; host controls disabled; disconnect still drains; distinct diagnostic.
- Build Windows x64 and WebGL; freshly extracted Windows short/long full rounds, WebGL refresh recovery and desktop/390px full rounds, publication audit and relevant Node tests.
- Release through a normal PR; verify the exact merge SHA in Pages and full remote CI, public ZIP hash, playable page and video.
