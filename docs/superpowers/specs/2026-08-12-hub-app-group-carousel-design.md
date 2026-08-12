# Hub Application Group and Carousel Status Design

## Goal

Improve the homepage hierarchy by moving PlanMap and SimuAI into the application collection and replacing the crowded per-project carousel dots with one compact current-project status control.

## Scope

- Change the default status of `planmap` and `simuai` from `engineering` to `assistant`.
- Keep both projects adjacent and preserve their names, descriptions, tags, demo links, video links, folders, and platform metadata.
- Preserve the latest online PlanMap name and badge (`思维导图快捷工具`, `脑图 + AI`) and change SimuAI's badge to `AI 实验工具`.
- Migrate legacy locally stored `engineering` classification and the old SimuAI badge to the new defaults without overwriting user-edited copy or links.
- Replace the one-dot-per-project control with previous and next buttons around a current-project name, padded position, total count, and thin progress line.
- Preserve carousel order, wraparound navigation, selected-card synchronization, and persisted selection.

## Interaction

The status control exposes the selected project as `项目名 · NN / NN`. The progress line fills to the selected item's one-based position. Previous and next buttons continue to call the existing navigation function and wrap across application projects, games, and remaining engineering experiences in their existing order.

On narrow screens, the project name truncates with an ellipsis while the position remains visible. The control must not create horizontal overflow or overlap the hero content.

## Compatibility

The implementation remains static HTML, CSS, and JavaScript with no external runtime dependency. Paths and project links remain relative so copied folders continue to work on Windows and macOS as well as GitHub Pages.

## Verification

- Catalog tests cover new defaults, legacy localStorage migration, and preservation of customized content.
- Carousel tests cover the semantic status text, progress value, absence of per-project dot buttons, and previous/next wraparound behavior.
- Existing Hub tests and publication audit remain green.
- Browser checks at `1440x900` and `390x844` confirm correct grouping, selection synchronization, navigation updates, no overflow, and no console or request errors.
