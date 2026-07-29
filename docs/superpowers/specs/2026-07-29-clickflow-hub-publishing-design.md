# ClickFlow Hub Publishing Design

## Goal

Publish ClickFlow as the final card in the AI Application Hub application collection, with a public interactive guide, a browser-playable tutorial video, expanded usage documentation, and verified Windows and macOS release downloads.

## Release Surface

- Hub project id: `clickflow`
- Public name: `ClickFlow 鼠标自动化工作台`
- Project page: `projects/clickflow/index.html`
- Video page: `projects/clickflow/video/index.html`
- Release tag: `clickflow-v2.0.0`
- Windows asset: `ClickFlow-Windows-x64.zip`
- macOS asset: `ClickFlow-macOS.zip`
- Card action order: `演示 / 视频 / Wins下载 / Mac下载`
- The card is appended after all existing application cards without reordering existing projects.

## Interactive Guide

The public guide is a safe browser simulation and never controls the visitor's system mouse. It mirrors the shipped desktop application with two equal modes:

1. `定点点击` lets the visitor change X/Y, interval, count, button, hold time, and cursor restoration. Starting the simulation animates only the target preview and updates the local status.
2. `录制回放` lets the visitor add simulated actions, start and stop simulated recording, select a row, save a JSON example, and preview replay progress. It explains F6/F7/F8/F9 and the ClickFlow-window capture filter.

The page includes installation steps, macOS Accessibility/Input Monitoring guidance, the fact that shortcuts are application-window shortcuts, and the limitation that cursor restoration reduces but cannot eliminate interference at the instant of a real click.

## Tutorial Video

The tutorial is generated from deterministic browser scenes rather than a screen recording, so it does not move the user's physical mouse. It is 1280×720 H.264/YUV420p, under four minutes, and uses the shared lazy-loaded Hub video player.

The five scenes cover:

1. Enter a fixed coordinate and interval.
2. Enable cursor restoration and start with F8.
3. Record clicks with F6 while ClickFlow filters its own window.
4. Edit, save, and replay a sequence with F7.
5. Stop everything with F9 and choose the correct platform package.

Each scene has one short Chinese WebVTT cue. No cue contains an embedded line break, and cue time ranges do not overlap.

## Packages

The existing Windows x64 package is uploaded unchanged after hash, extraction, executable presence, and startup smoke verification.

The Hub stores a buildable ClickFlow source snapshot under `build/clickflow`. A GitHub Actions workflow builds on:

- `macos-14` for arm64
- `macos-15-intel` for x64

Each job runs syntax checks and the full Python test suite, builds `ClickFlow.app` with PyInstaller, applies ad-hoc signing, verifies the bundle and executable architecture, launches the packaged app long enough to prove startup, and uploads a per-architecture artifact. A packaging job combines both verified apps into `ClickFlow-macOS.zip` with `arm64/` and `x64/` directories.

The public Mac download is the combined runnable package. The source-only macOS ZIP is retained only as a local build aid and is never linked as the Mac product download.

## Tests and Acceptance

Focused Node tests prove:

- ClickFlow is the final application card.
- The four actions use the required order and release URLs.
- The guide and video pages use the shared Hub shell and return-home control.
- Documentation includes shortcuts, platform permissions, cursor-restoration limitations, and safe-use guidance.
- The tutorial is decodable H.264 at 1280×720, lasts between 30 and 240 seconds, and uses non-overlapping one-line captions.
- Windows and macOS archives have recorded SHA-256 values and expected entry programs.

Browser smoke tests cover desktop and 390px mobile layouts, horizontal overflow, console/page errors, guide interactions, video loading, and actual playback progress.

Publication is complete only after the branch tests pass, the macOS workflow succeeds, both assets are attached to the GitHub Release, the final commit reaches `main`, GitHub Pages succeeds, and all four public card links are verified over HTTPS.
