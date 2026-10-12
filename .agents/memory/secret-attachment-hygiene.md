---
name: Secret attachment hygiene
description: How to protect credentials from project history and Replit's append-only backup.
---

Never import, commit, or preserve `.env` attachments that include credentials. Store secrets through the workspace Secrets flow instead.

**Why:** The internal backup remote keeps an append-only history, so a credential committed there cannot be removed by force-pushing a rewritten branch.

**How to apply:** Extract only non-sensitive configuration into normal environment variables, keep keys in Secrets, and advise rotating any credential that was accidentally committed.

The official setter for non-secret production variables can persist their values
in the tracked workspace configuration. It is not a private credential store.

**Why:** A production-only setter added a production environment section to the
project configuration. A broad Git push would include that configuration.

**How to apply:** Use Secrets for credentials, inspect configuration changes with
values redacted, and do not include private server-only references in GitHub
updates. Do not silently undo authorized production settings to make Git clean.