# PureShrink Desktop

PureShrink Desktop wraps the public local-first workbench in an isolated Electron window and uses the platform-specific `ffmpeg-static` binary.

## Safety boundaries

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- IPC channels are fixed and only expose file selection, compression, cancellation, output reveal, and environment metadata.
- FFmpeg receives an argument array through `spawn` with `shell: false`.
- Outputs use `-pureshrink` plus collision-safe numbering and never overwrite a source.

## Build

```text
npm ci
npm run test
npm run dist:win
```

On macOS, use `npm run dist:mac:x64` or `npm run dist:mac:arm64` on the matching runner.

## macOS first launch

The public build is ad-hoc signed and is not Apple-notarized because this project does not store a Developer ID credential. After extracting the download, Control-click `PureShrink.app`, choose **Open**, then confirm **Open**. If macOS still blocks it, use **System Settings → Privacy & Security → Open Anyway**. Never disable Gatekeeper globally.
