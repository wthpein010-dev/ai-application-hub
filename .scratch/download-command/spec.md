# Download visibility command

Approved by the user on 2026-11-17: use a phrase to show existing download buttons, not access control.

- Default: hide existing public package links.
- Maintenance command `开启下载`: reveal existing Windows/Mac package links for this tab.
- `关闭下载`: hide them again. Keep command `1` intact.
- Use sessionStorage, not localStorage or server/global state. Refresh and same-tab download-page navigation retain the setting; a fresh independent tab starts closed.
- Do not invent packages, change URLs, alter user text, or modify authenticated download APIs.
- Existing public URLs remain public. This is presentation only.
- A storage failure retains the switch in memory for the current page and reports that refresh persistence is unavailable.
- Preserve ClickFlow local prohibition: explicit named tests only, no ClickFlow execution, build, display or download.

Approaches: selected tab-local presentation switch; rejected account authentication/private storage because the user explicitly selected visibility only. Preserve the separate existing admin login route.
