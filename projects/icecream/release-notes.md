# IceCream 1.1.0

- Unity version: 2022.3.62f3c1.
- Ten levels, editable 750 x 1624 UI, persistent progress and direct gameplay startup.
- Fixed missing gameplay camera, unbound prefab action buttons and swapped yellow/green sprites.
- Windows: extract the whole ZIP, then run IceCream.exe with its Data folder beside it.
- macOS: extract IceCream.app and move it to Applications. Supports Apple Silicon and Intel.
- The Mac build has an ad-hoc signature, not Apple Developer ID signing or notarization.
  If macOS blocks the downloaded app, review it and use System Settings > Privacy & Security >
  Open Anyway. Do not disable Gatekeeper globally.
- WebGL: start-on-demand online preview, initialization retry and next-level flow verified.

## Verification

- Unity EditMode: 22 passed, 0 failed.
- Native Windows, Apple Silicon Mac and Intel Mac: make three cones, serve customers,
  display success and enter level 2; all ten level configurations are validated.
- WebGL: real canvas pixels, three served customers, result popup and next-level button;
  desktop/mobile shell has no browser errors or horizontal overflow.
- Exact hashes and native runner evidence are in release-manifest.json.
