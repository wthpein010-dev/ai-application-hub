# PureShrink browser runtime notices

PureShrink serves these files from its own GitHub Pages origin so media never needs to be sent to a CDN. They are pinned copies of the listed npm releases; only trailing whitespace is normalized and the upstream empty single-thread worker file contains one explanatory comment.

| Package | Version | Vendored files | npm integrity |
| --- | --- | --- | --- |
| `@ffmpeg/ffmpeg` | 0.11.6 | `ffmpeg.min.js`, `046d0074eee1d99a674a.js` | `sha512-uN8J8KDjADEavPhNva6tYO9Fj0lWs9z82swF3YXnTxWMBoFLGq3LZ6FLlIldRKEzhOBKnkVfA8UnFJuvGvNxcA==` |
| `@ffmpeg/core-st` | 0.11.1 | `ffmpeg-core.js`, `ffmpeg-core.worker.js`, `ffmpeg-core.wasm` | `sha512-8R0kdXjQjjOgVaChDMUx/abrTD5/g9JFnuZLqB+lvzJbfNpNEFEZPxFR1Fu4eoON+fVq3K3URVKZcHEEGKZVTQ==` |
| `fflate` | 0.8.2 | `fflate.min.js` | `sha512-cPJU47OaAoCbg0pBvzsgpTPhmhqI5eJjh/JIu8tPj5q+T7iLvW/JAYUqmE7KOB4R1ZyEhzBaIQpQpardBF5z8A==` |

The single-thread core is used so the app works on ordinary static hosting without `SharedArrayBuffer` or cross-origin-isolation headers. Its published worker file is intentionally empty; the local placeholder comment keeps package verification explicit. The package is archived on [npm as `@ffmpeg/core-st` 0.11.1](https://www.npmjs.com/package/@ffmpeg/core-st/v/0.11.1), and its release-family source is available at [ffmpeg.wasm-core v0.11.0](https://github.com/ffmpegwasm/ffmpeg.wasm-core/tree/v0.11.0). FFmpeg itself is distributed under the LGPL 2.1 or later, with optional components covered by their respective licenses; see the source tree’s `LICENSE.md` for the exact build terms.

## `@ffmpeg/ffmpeg` and `@ffmpeg/core-st`

MIT License

Copyright (c) 2019 Jerome Wu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## `fflate`

MIT License

Copyright (c) 2023 Arjun Barrett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
