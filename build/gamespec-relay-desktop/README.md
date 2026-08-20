# GameSpec Relay Desktop

Electron desktop shell for the shared offline GameSpec Relay web workbench.

- Renderer isolation: `contextIsolation`, sandbox, and web security stay enabled.
- Native bridge: source selection, project save/load, exports, and encrypted optional-model settings only.
- Windows: portable x64 executable plus unpacked package for launch verification.
- macOS: independently built x64 and arm64 application ZIPs.
- Smoke mode: `--smoke-test` drives the real built-in sample through the renderer and verifies a JSON export.

Unsigned development packages may require the user to choose the operating system's explicit “Open” action.
