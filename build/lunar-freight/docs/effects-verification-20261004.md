# Real-time effects upgrade — 2026-10-04

Source: published Hub `build/lunar-freight`, based on main `7a235c8`.
Only lunar source, built lunar game and its dedicated verification workflow changed.
No video, prerendered animation, physics/rule changes, new application permissions,
shared Hub catalog changes or changes to other projects.

## Windows local evidence

- Node 24.15.0: `npm test` — 19/19 pass.
- Physical campaign route: five deliveries in 185.7167 simulation seconds,
  one pickup, zero impacts/resets, rank S.
- Existing rock/building collision, drop/recovery and reset regression tests pass.
- `npm run typecheck` and `npm run build -- --configLoader runner` pass.
  Runner mode avoids writing Vite's temporary config into a read-only reused
  dependency directory. CI uses a normal local install and standard build.
- Explicitly scoped Hub publication test: 5/5 pass. ClickFlow is excluded;
  its existing unconditional Windows Python-suite skip was checked before tests.
- Chrome/SwiftShader browser: 1440×900, 390×844, 844×390. Five Blender models
  load, driving emits dust, pause freezes simulation/particle count, restart
  clears particles/deliveries, NPC dialog and confirmation remain in viewport,
  no horizontal overflow or uncaught page errors.
- Browser renderer + real physics harness: five successful delivery cues,
  real rock collision damage cue, pickup cue and upright recovery pass.
- Stress test: 10,000 emissions use exactly 180 fixed slots and expire.
- Six-second driving frame samples (software rendering, not hardware/device
  certification): desktop median 83.3 ms / p95 83.4 ms; portrait and landscape
  median 50 ms / p95 66.7 ms. No claim of hardware performance or 60 FPS.
- Built JS gzip: 290.64 kB; dust uses one instanced draw, no shadows; five
  fixed pulse meshes and five recovery rings. GPU resources use existing disposal.

## Cross-platform and release gate

Browser game requires WebGL; there is no Windows/macOS native installer.
Dedicated CI now tests Linux, Windows and macOS with Node 22 and Chromium.
macOS Safari and physical iOS/Android devices have not been tested locally.
Do not claim these platforms passed until the relevant CI/manual evidence exists.
Create a draft PR first. Public deployment is contingent on sufficient CI evidence
and successful Pages deployment plus public asset verification.

No supported per-thread fast/normal mode control is available in this execution
environment; no global settings or database are modified.
