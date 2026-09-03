# Loop BGM Lab Lossless Markdown Handoff Design

## Context

Loop BGM Lab exports canonical JSON that can restore the complete project and a human-readable Markdown handoff that cannot currently be imported. Cross-computer continuation therefore depends on keeping two files synchronized. The next slice makes the Markdown download independently restorable without weakening the existing portable-state validation.

This slice is deliberately separate from the later external-license bundle schema. The project schema remains version 2.

## Goals

- A Markdown file downloaded from the UI restores the exact validated project state on another computer.
- The readable sections remain useful to a person or Codex even when the machine envelope is ignored.
- Accidental truncation or mutation of the embedded state is detected before JSON parsing or state replacement.
- JSON and Markdown imports share the same project migration, portable-safety, and cross-field validation.
- Import remains atomic: a failed read, envelope check, digest check, validation, or staged render leaves the current project and audio state untouched.
- The export contains no audio bytes, local paths, personal file names, credentials, cookies, tokens, API keys, recovery keys, or browser session data.

## Non-goals

- The SHA-256 digest is an integrity check, not an authenticity signature. A malicious editor able to replace both payload and digest is not detected as an author.
- Human-written Markdown without a Loop BGM Lab envelope is not heuristically parsed into project state.
- Audio files are not embedded; they must still be selected again locally.
- This slice does not add `candidateSource`, preview-only, ShareAlike, license evidence, or license-bundle fields.
- This slice does not add Suno API or browser automation.

## Document format

The existing readable Markdown is followed by exactly one machine envelope at the end of the file:

````markdown
<!-- LOOP-BGM-LAB-PORTABLE-STATE-BEGIN
version=1
encoding=base64url
byteLength=12345
sha256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
-->
```loop-bgm-lab-state
eyJiYXRjaGVzIjpbLi4uXX0
```
<!-- LOOP-BGM-LAB-PORTABLE-STATE-END -->
````

The payload is the UTF-8 bytes of `exportProjectJson(project)`, encoded as unpadded base64url and wrapped at 96 columns. `byteLength` and `sha256` describe the decoded canonical JSON bytes. Export always uses LF newlines and lowercase hexadecimal.

The importer requires the begin marker, the four exact metadata keys, the state code fence, and the end marker. It accepts an optional UTF-8 BOM and LF or CRLF around the envelope, requires the envelope to be the final non-whitespace content, and rejects missing, duplicate, nested, or out-of-order markers. Unknown envelope versions, encodings, metadata keys, malformed base64url, invalid UTF-8, decoded-length mismatch, and digest mismatch are rejected.

Readable Markdown before the begin marker may be edited without invalidating the embedded state. Editing the embedded state is detected unless the editor deliberately recomputes its metadata; project validation remains the security boundary in either case. Before appending the envelope, the exporter replaces exact reserved begin/end marker text in the readable portion with an explanatory placeholder. This keeps every otherwise-valid project export importable even if a human note contains a reserved marker; the original note remains exact inside the canonical payload.

## Core API

Create `projects/loop-bgm-lab/core/portable-handoff.mjs` with these public interfaces:

```js
export const MAX_PROJECT_DOCUMENT_BYTES = 48 * 1024 * 1024;
export const MAX_EMBEDDED_PROJECT_BYTES = 16 * 1024 * 1024;

export async function exportProjectHandoffMarkdown(project) {
  // Returns readable Markdown plus the version-1 envelope.
}

export async function importProjectDocument(text) {
  // Returns { project, format: "json" | "markdown" }.
}
```

`exportProjectHandoffMarkdown` calls the existing `exportProjectMarkdown` for the readable portion and `exportProjectJson` for canonical state. It hashes UTF-8 bytes with `globalThis.crypto.subtle.digest("SHA-256", bytes)` and does not persist or transmit the payload.

`importProjectDocument` first enforces the whole-document size bound. A document whose first non-whitespace character is `{` is passed unchanged to `importProjectJson`. Every other document must carry the strict Markdown envelope. After base64url decoding, size and digest verification, the decoded text is passed unchanged to `importProjectJson`; no second schema or permissive Markdown parser is introduced.

The existing synchronous `exportProjectJson`, `importProjectJson`, and `exportProjectMarkdown` remain compatible for current callers. The UI switches only its Markdown download and shared file-import path to the new asynchronous API.

## Browser flow

- The file picker accepts `.json`, `.md`, `application/json`, and `text/markdown` and describes both as fully restorable.
- Before reading, the UI rejects files larger than `MAX_PROJECT_DOCUMENT_BYTES`.
- Markdown export disables its button while hashing and always restores the button state in `finally`.
- Import displays whether JSON or Markdown was restored.
- The existing staged render runs before project assignment, generation counters, audio release, persistence, and the final full render.
- Failure reports a concise reason and leaves project data, selected candidate, object URLs, audio elements, and local storage unchanged.

## Invalid local-state quarantine

Startup must distinguish local-storage access failure from a stored payload that was read successfully but cannot be migrated or validated. When an existing stored payload is invalid or from an unsupported future schema, the page opens a default in-memory project in protected mode, shows the validation failure, and blocks every automatic persistence attempt. It does not delete, rewrite, or relabel the stored value as a storage outage.

A successful explicit JSON or Markdown import is the only action in this slice that clears protected mode and replaces the quarantined value. A failed import leaves protected mode and the original stored bytes unchanged. This prevents an ordinary form edit after startup from silently overwriting the only copy of a project that a newer or older tool could still recover.

## Security and privacy invariants

- The embedded payload is produced only after `validateProject` succeeds.
- A recomputed but unsafe envelope still fails `assertPortableValue`, URL credential/secret-parameter checks, exact schema checks, and all identity invariants through `importProjectJson`.
- Base64url is transport encoding only; it is never described as encryption or redaction.
- The importer performs no network requests and loads no external resources.
- A malformed document is rejected before large decoded allocations where possible; decoded content is capped independently.
- JSON parse, digest, UTF-8, and validation errors cannot partially mutate application state.
- Invalid or future-schema local state cannot be overwritten by startup, rendering, or later automatic persistence.

## Compatibility

- Project schema stays at version 2 and its v1-to-v2 migration remains unchanged.
- Existing `.json` exports continue to import through the same UI.
- Existing human-only Markdown remains readable but is intentionally not importable because it cannot prove a complete state snapshot.
- The readable section keeps current headings and evidence so existing users and documentation links remain useful.

## Verification

Core tests must prove:

- A complete project round-trips exactly through Markdown and reports `format: "markdown"`.
- Canonical JSON still imports and reports `format: "json"`.
- Editing readable prose before the envelope does not alter the restored project.
- Truncated, duplicated, reordered, malformed, unknown-version, oversized, length-mismatched, and digest-mismatched envelopes are rejected.
- An unsafe project wrapped with a freshly computed valid digest is still rejected by the existing portable-state validation.
- UTF-8 and base64url handling preserves non-ASCII display labels.
- Reserved marker text inside a review note is redacted only in readable prose and round-trips exactly through the embedded state.

Browser tests must prove:

- A downloaded Markdown handoff can be imported into a fresh page and restores a visible project value.
- A corrupted Markdown import leaves the current state and local storage unchanged.
- Invalid or future-schema local storage enters protected mode and is not overwritten by subsequent edits; a successful explicit import clears the mode and replaces it.
- JSON import still follows the staged-render-before-commit ordering.
- Four responsive viewports, keyboard focus, reduced motion, and zero browser errors remain green.

## Acceptance criteria

- One UI-generated Markdown file is sufficient to restore every field represented by canonical project JSON.
- The restored project is deep-equal to `validateProject(project)`.
- No audio bytes, local path, personal file name, or secret appears in the Markdown.
- All focused core, page, browser, privacy, full repository, publication-audit, and Pages checks pass before release.
