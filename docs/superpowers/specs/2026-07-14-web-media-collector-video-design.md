# Web Media Collector Tutorial Video Design

## Goal

Add a short Chinese-caption tutorial for the Web Media Collector desktop app and route the hub card's Video action to a dedicated player page.

## Deliverables

- An H.264 MP4 tutorial at `projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源/web-media-collector-tutorial.mp4`.
- A lightweight player page at `projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源/演示视频.html`.
- A `video` route for `web-media-collector` in the script loaded by the hub home page.
- A regression test that verifies the route, player page, and MP4 asset.

## Video

The 16:9 video runs for about 50 seconds. It uses Chinese on-screen captions without narration so it is small and works consistently on Windows, macOS, and mobile browsers.

1. Introduce the desktop tool and its use with public web resources.
2. Show entering a web address and starting a scan.
3. Show filtering, previewing, and selecting image, video, audio, and document assets.
4. Show adding approved assets to the download queue.
5. Explain Windows and macOS source-package use, plus the public-resource boundary.

## Player Page

The page matches the existing video-page pattern: it loads immediately, does not download the MP4 until the viewer selects Play, exposes a direct MP4 link, provides links to the product page and hub, and uses responsive 16:9 playback.

## Data Flow

The hub's current runtime script provides the `video` field. The card's Video button uses that value to open the player page. The player assigns the MP4 source only after a viewer action. The browser then streams the MP4 from the same GitHub Pages directory.

## Compatibility And Boundaries

The MP4 will use H.264 video in an MP4 container for Windows, macOS, and current browser support. The tutorial describes scanning only publicly accessible resources and does not claim to bypass sign-in, payment, DRM, or site permission controls.

## Validation

- Regression test confirms the hub runtime route, player page, and video file exist.
- Video metadata confirms a playable MP4 with a 16:9 frame and a duration near 50 seconds.
- Local player page is checked for its lazy-load control and navigation links.
- GitHub Pages is checked after publishing for the hub route, player HTML response, and MP4 response.
