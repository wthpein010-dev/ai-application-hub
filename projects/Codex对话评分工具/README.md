# Codex Conversation Validator

Tools for local Codex conversation/session data.

Both tools work across Windows, macOS, and Linux by probing common Codex data
locations, while still allowing explicit paths for computers where Codex was
installed or configured differently.

## Prompt Review Excel

`codex_conversation_reviewer.py` reads local Codex conversations, extracts real
user prompts, scores each prompt, adds short feedback, and exports an Excel
workbook.

The workbook contains:

- `总览`: overall prompt count, average score, grade distribution, main themes.
- `逐条评分`: one row per user prompt, including score, feedback, suggested rewrite,
  and the original prompt text.
- `会话汇总`: one row per Codex conversation/thread.
- `评分规则`: rubric definitions.

Formatting defaults:

- Rows are grouped by conversation name, then sorted from oldest to newest.
- Timestamps are shown as `YYYY-MM-DD HH:MM`.
- Score cells are color-coded by grade band.
- Cells with more than 10 characters are left-aligned; shorter cells and numbers
  are centered.

Default run:

```powershell
python .\codex_conversation_reviewer.py
```

Windows with explicit location:

```powershell
python .\codex_conversation_reviewer.py --codex-home "$env:USERPROFILE\.codex"
python .\codex_conversation_reviewer.py --scan-root C:\Users\ASUS --scan-depth 4
python .\codex_conversation_reviewer.py --output .\outputs\my_review.xlsx
```

macOS / Linux:

```bash
python3 ./codex_conversation_reviewer.py
python3 ./codex_conversation_reviewer.py --codex-home "$HOME/.codex"
python3 ./codex_conversation_reviewer.py --scan-root "$HOME" --scan-depth 4
python3 ./codex_conversation_reviewer.py --output ./outputs/my_review.xlsx
```

By default, the tool redacts obvious API keys/tokens/password-like strings before
writing the workbook. Use `--no-redact` only when you really want raw prompt text.

## Session Validator

## What it checks

`codex_conversation_validator.py` is a smaller health checker for local session
files.

- Finds the local Codex data directory, such as `~/.codex`.
- Reads `sessions` and `archived_sessions` JSONL files.
- Reads `session_index.jsonl` when present.
- Verifies session files are readable, non-empty, valid JSONL, and contain
  session metadata.
- Checks whether a requested thread id has a matching local session file.
- Detects the active Codex thread through `CODEX_THREAD_ID` when available.

The tools do not print `auth.json` or other secret-bearing files.

## Usage

Windows PowerShell:

```powershell
python .\codex_conversation_validator.py
python .\codex_conversation_validator.py --current
python .\codex_conversation_validator.py --thread-id 019e6e8e-05ab-78f1-b42e-57b75cc0fadc
python .\codex_conversation_validator.py --codex-home "$env:USERPROFILE\.codex"
```

macOS / Linux:

```bash
python3 ./codex_conversation_validator.py
python3 ./codex_conversation_validator.py --current
python3 ./codex_conversation_validator.py --thread-id 019e6e8e-05ab-78f1-b42e-57b75cc0fadc
python3 ./codex_conversation_validator.py --codex-home "$HOME/.codex"
```

For unusual local layouts:

```bash
python3 ./codex_conversation_validator.py --extra-root /path/to/check
python3 ./codex_conversation_validator.py --session-dir /path/to/sessions
python3 ./codex_conversation_validator.py --scan-root /path/to/search --scan-depth 4
python3 ./codex_conversation_validator.py --json
```

## Exit Codes

- `0`: no errors or warnings found.
- `1`: warnings found, but no hard failure.
- `2`: errors found.
