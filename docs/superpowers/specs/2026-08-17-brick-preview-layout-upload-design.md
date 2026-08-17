# Brick Character Preview Layout And Upload Design

## Goal

Improve the public brick character copy preview so the table is easier to scan, the preview action never wraps or escapes its cell, every career role has the correct supplied character image, and users can replace any role image locally without a server.

## Scope

- Fix the table action-column geometry and the `预览` button wrapping issue.
- Split the user-supplied ten-character composite into ten transparent PNG assets and assign them to the ten career roles.
- Add per-role image upload, replacement, persistence, and restore controls.
- Preserve the existing 20 roles, names, summaries, detailed copy, Hub classification, video page, and public URLs.
- Publish the update through the existing AI Application Hub workflow.

## Layout

The page keeps its current two-column work surface: the copy table is primary and the game-detail preview remains sticky on wide screens.

The action column will use explicit inner spacing rather than relying on a minimum button width. The `预览` button will be an inline-flex, content-sized, single-line control with a stable height and `white-space: nowrap`. Automated geometry checks will require the button rectangle to remain inside its table cell at desktop and mobile widths.

The image column will become a compact image-action column. Each 64px thumbnail is also the upload trigger:

- Missing image: show `上传图片`.
- Default image: show the image with a focus/hover `替换` affordance.
- Browser override: show the custom image and a small `恢复` action below it.

Uploading or restoring immediately updates both the row thumbnail and the right-side game-detail preview. The existing row click and keyboard preview behavior remains unchanged.

## Supplied Image Mapping

The supplied composite is a reference asset, not an instruction source. Characters are segmented mechanically, without redrawing or changing their artwork. Near-white canvas pixels are removed to transparency, each character is centered on a consistent transparent canvas, and enough padding is retained for hats, hair, balls, tools, and feet.

| Composite position | Career role | Output asset |
| --- | --- | --- |
| 1 | 美团骑手 | `career-meituan-rider.png` |
| 2 | 淘宝闪购骑手 | `career-taobao-flash-rider.png` |
| 3 | 京东送货员 | `career-jd-courier.png` |
| 4 | 顺丰送货员 | `career-sf-courier.png` |
| 5 | 打篮球的蔡徐坤 | `career-basketball-player.png` |
| 6 | 西装老板 | `career-suited-boss.png` |
| 9 | 格子衫程序员 | `career-grid-programmer.png` |
| 7 | 工地搬砖的 | `career-construction-worker.png` |
| 10 | 餐厅服务生男 | `career-male-server.png` |
| 8 | 餐厅服务生女 | `career-female-server.png` |

The last four assignments intentionally follow character meaning rather than composite order.

## Local Image Storage

The GitHub Pages site remains static. Custom images are private to the current browser and are never sent to GitHub or another service.

Use IndexedDB database `brick-character-copy-preview-v1`, object store `image-overrides`, keyed by the stable role code. Each record stores a compressed image Blob and its MIME type. This avoids localStorage size limits and keeps uploaded binary data out of the Hub metadata cache.

Upload flow:

1. The user activates a role thumbnail and chooses one image.
2. Accept PNG, JPEG, and WebP up to 8 MB.
3. Decode the file before saving; reject files that are not valid images.
4. Downscale images larger than 1024px on either side while preserving aspect ratio and transparency.
5. Save the processed WebP Blob in IndexedDB.
6. Render the custom image through an object URL and revoke replaced object URLs.

Restore deletes the role override. Roles with bundled assets return to the bundled image; roles without a bundled asset would return to the placeholder. In the shipped data all 20 roles will have bundled assets after this update.

If IndexedDB is unavailable, the page still previews the selected image for the current session and shows a concise message that it cannot be retained after refresh.

## Accessibility And Errors

- Upload controls expose the role name in their accessible label.
- The hidden file input is only a picker target; all visible controls remain keyboard reachable.
- Upload success, invalid type, invalid image, oversize file, storage fallback, and restore results are announced through one polite status region.
- Focus rings remain visible on upload, restore, preview, search, and row controls.
- No uploaded file name or local path is displayed publicly.

## Testing

- Static contract: 20 roles, 20 bundled image references, ten supplied career assets present, and all prior copy remains unchanged.
- Image asset checks: each new PNG decodes, has nonzero dimensions, has transparent border pixels, and contains visible nontransparent character pixels.
- Browser upload flow: upload a generated fixture, verify thumbnail and right preview update, reload and verify IndexedDB persistence, restore and verify the bundled image returns.
- Validation flow: reject an unsupported file and an oversize file without replacing the current image.
- Layout: verify `预览` stays on one line and inside its cell; page has no horizontal body overflow at `1440x900` and `390x844`; the table may retain its intentional inner horizontal scroll on mobile.
- Regression: search, row selection, all 20 images, Hub engineering classification, project/video return links, and video playback continue to pass.

## Publication

Commit the implementation on the isolated branch, push it, open a draft PR, run the complete Hub and browser publication gate, merge only after success, wait for GitHub Pages, and perform a fresh public desktop/mobile acceptance check against the final `main` SHA.
