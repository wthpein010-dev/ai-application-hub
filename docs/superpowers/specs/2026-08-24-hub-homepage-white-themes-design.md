# AI Application Hub White Workspace Design

## Goal

Turn the AI Application Hub homepage into a clean, white-first project workspace that is easier to scan and operate while preserving the existing catalog, selected-card carousel, editing panel, local-storage migrations, project order, and public links.

## Approved Direction

Use the "clean project workspace" direction. Borrow Nyokore's clear module grouping and comfortable filter-to-grid flow without copying its mechanical theme. Borrow GamePulse's compact top-right theme menu with named color swatches and immediate application.

## Layout

- Keep a compact sticky header with brand, four existing navigation links, a theme control, update, and edit actions.
- Keep the hero as a two-column overview: editable title, description, actions, and three metrics on the left; the selected project carousel on the right.
- Reduce hero height so the application workspace is visible near the first viewport edge.
- Replace the permanent left filter rail with a sticky horizontal filter toolbar.
- Show concise public tool-type tabs for all applications plus the six approved types. Keep category and sort controls as selects.
- Keep application, game, engineering, platform, and maintenance sections in their current order.
- Keep four cards per row on wide desktop, two on tablet, and one on mobile.

## Cards

- Preserve click-to-select, keyboard selection, selected styling, and carousel synchronization.
- Show type, category, title, a concise description, up to two tags, and a `+N` overflow marker.
- Keep actions aligned to the card bottom in a two-column grid.
- Use the public labels `网页预览`, `介绍视频`, `Wins下载`, `Mac下载`, and `iOS安装`.
- Keep first-load entrance motion only. Filtering, sorting, card selection, and carousel navigation must not replay entrance motion.

## Themes

- Default: `clean`, a clean white background with graphite text and cobalt/teal accents.
- Alternatives: `mist`, a cool mist-blue theme; `coral`, a warm white coral theme; `night`, a dark graphite theme.
- The top-right theme button opens an accessible menu containing paired swatches, a name, a short description, and a selected checkmark.
- Theme changes apply immediately, persist under a new local-storage key, and do not touch catalog or editable-copy storage.
- Invalid stored theme values fall back to `clean`.
- Respect `prefers-reduced-motion` and maintain visible focus states.

## Responsive And Accessibility

- At 390px the header becomes two rows without horizontal overflow.
- The filter tabs scroll horizontally and the form controls stack cleanly.
- The hero becomes a single column and keeps carousel controls reachable.
- Theme menu uses `aria-expanded`, `role=menu`, and `role=menuitemradio`.
- Selected project cards retain `aria-current=true`.

## Preservation Rules

- Do not replace user-edited homepage text.
- Do not change existing storage keys for apps, editable page text, or selected project.
- Do not reorder catalog entries.
- Do not change project URLs, video URLs, or download artifacts.
- Do not run, build, display, download, or regenerate ClickFlow on Windows.
