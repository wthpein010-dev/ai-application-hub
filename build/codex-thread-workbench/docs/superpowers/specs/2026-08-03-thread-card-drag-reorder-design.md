# Thread Card Drag Reorder Design

## Goal

Add comfortable, visually clear drag-and-drop reordering to the Codex multi-thread workspace. A user can drag one open thread card onto another card, release it, and exchange the two cards' grid positions. The chosen order persists across refreshes and application restarts.

## Scope

- Support the existing one-to-six-card `UniformGrid` layouts.
- Start dragging from the card title bar, including a visible drag grip.
- Ignore drag gestures that start on stop, minimize, close, approval, send, or input controls.
- Exchange the source and target card positions on a valid drop.
- Preserve the current conversation, draft text, task state, approval state, scroll behavior, and card view-model instances.
- Persist the resulting `OpenThreadIds` order using the existing `WorkspaceStore`.
- Update the public demo, versioned Windows and macOS packages, and GitHub Pages release to v1.3.0.

## Interaction Design

### Starting a drag

The full non-button area of the 45-pixel card title bar is draggable. A six-dot grip appears beside the status dot so the affordance is discoverable without adding another toolbar button. The title bar uses the move cursor and exposes the tooltip “拖动调整任务位置”.

A pointer press only arms the gesture. Dragging begins after the pointer moves at least 6 logical pixels, which keeps ordinary clicks comfortable and avoids accidental reordering.

### Drag feedback

- The source card receives a `dragging` visual state: opacity reduces slightly, shadow grows, and the border uses the primary green.
- A card currently accepting the drop receives a `drop-target` state: a two-pixel green outline and a very light green header tint.
- Internal conversation content does not gain hover, click, selection, gray-box, or blue-box effects.
- Drag feedback is removed immediately when the drag is dropped, cancelled, leaves the workspace, or fails.

### Completing a drag

Dropping on another open card exchanges the two cards' collection indexes. Dropping on the source card, empty workspace, outside the workspace, or an unavailable card does nothing. Pressing Escape or cancelling the platform drag leaves the order unchanged.

The operation is an exchange, not insertion. For example, dragging position 1 onto position 4 produces `4, 2, 3, 1`; cards between them do not shift.

## Architecture

### View layer

`ThreadCardView` owns pointer threshold detection and the native Avalonia drag/drop lifecycle because these concerns depend on pointer coordinates and visual states. It transfers only the source thread ID in a private application data format. Each card accepts move drops, validates that the source differs from its own thread ID, and raises a reorder request containing source and target IDs.

`MainWindow` receives the reorder request from the card template and delegates it to `MainViewModel`. It does not calculate business ordering and does not recreate cards.

### Presentation layer

`MainViewModel.SwapOpenThreadsAsync(string sourceThreadId, string targetThreadId)` will:

1. Resolve both IDs in `OpenThreads`.
2. Return `false` without saving when an ID is missing or both positions are identical.
3. Exchange the two existing `ThreadCardViewModel` instances at their indexes.
4. Save the workspace once and return `true`.

The method preserves object identity so status polling, unsent drafts, messages, approvals, and command state remain attached to the same task.

### Persistence

No new settings schema is required. `SaveWorkspaceAsync` already serializes `OpenThreads` as ordered `OpenThreadIds`, and initialization already restores IDs in saved order. Reordering therefore uses the established workspace contract and remains backward compatible with v1.2.0 settings.

## Error Handling

- Missing, stale, or duplicate drag IDs result in a no-op rather than an exception.
- Workspace-save failure is caught by the UI request handler, exposed through the existing global error surface, and does not crash the application. The visible in-memory order remains usable for the current session.
- Native drag cancellation always clears source and target visual states in `finally` cleanup.
- Status refreshes continue to update cards by thread ID and do not alter their positions.

## Visual Details

- Keep the current light neutral shell, green primary color, rounded 12-pixel cards, and compact 45-pixel title bar.
- Add only the six-dot grip, move cursor, stronger source shadow, and green drop outline; no large instructional panel or global statistics.
- Preserve the current Codex-style conversation treatment: green user bubble, borderless Codex response, and non-selectable display containers.
- Use short transitions for opacity, border, and header color where supported; reordering itself completes immediately so the application remains responsive.

## Testing

### Presentation tests

- Swapping two valid IDs produces the exact exchanged order.
- A swap preserves both `ThreadCardViewModel` object identities and draft text.
- Same-card and missing-ID requests are no-ops and report `false`.
- The exchanged order is written to `WorkspaceStore` and restored by a fresh view model.

### Desktop tests

- The title bar exposes a named drag surface and visible drag grip.
- The card accepts drop operations while input, send, stop, minimize, and close controls remain present.
- The conversation message containers remain non-selectable and keep the user/Codex visual split.

### Manual Windows acceptance

- Open at least four real Codex tasks.
- Drag the first card onto the fourth and verify only those two positions exchange.
- Verify source lift and target outline appear, then disappear after drop.
- Type unsent text before dragging and confirm it remains with the correct task.
- Refresh, restart, and confirm the exchanged order persists.
- Verify message scrolling, sending, stopping, minimizing, closing, approvals, status refresh, full screen, and windowed mode still work.

## Release Plan

- Bump the application and public package metadata to v1.3.0.
- Build and test Windows x64, replace the fixed local delivery EXE/ZIP, keep the desktop shortcut targeting the fixed EXE, restart the application, and open the delivery folder.
- Sync the updated application snapshot into `build/codex-thread-workbench` in a clean Hub worktree based on the latest remote `main`.
- Update the public interaction demo to show the grip, drag feedback, and exchanged card order.
- Build macOS arm64 and x64 through the existing GitHub Actions workflow.
- Publish versioned download manifests/parts without exposing an incomplete package, merge through a reviewed branch, wait for Pages, and verify the Hub card, demo, video, Windows download, and Mac download.

## Non-Goals

- Free-form pixel positioning or overlapping cards.
- Resizable individual cards.
- Dragging a card to another monitor or another application window.
- Reordering closed tasks in the task picker.
- Changing the existing maximum of six simultaneously open tasks.
