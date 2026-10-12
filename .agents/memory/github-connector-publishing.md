---
name: GitHub connector publishing
description: Notes for publishing this project to GitHub through the Replit-managed connector.
---

O usuário orientou: “Penso que Replit deve sempre usar o GitHub para atualizar.”

**Why:** O usuário pediu que as atualizações usem o GitHub.

**How to apply:** Neste projeto, registrar e encaminhar alterações de código pelo GitHub, em vez de editar a publicação diretamente no provedor. Isso não substitui a confirmação necessária para publicar em produção.

Use the authenticated GitHub connector proxy for repository creation and API writes. A GitHub connection does not automatically give shell `git push` an HTTPS credential, so an interactive shell push can fail despite a healthy connector.

**Why:** Connector tokens are intentionally kept outside the shell environment; using the API proxy preserves that boundary.

**How to apply:** When creating a new empty repository, seed it with an initial content commit before using Git data endpoints for blobs and trees. Keep `origin` pointed at the repository URL, and use the connector API for future publishing unless shell Git authentication has been explicitly configured.

Compare the workspace with the latest remote tree through their common ancestor
before proposing synchronization. Preserve remote-only modules and unrelated work;
never treat the workspace as permission to replace the remote tree wholesale.

**Why:** Local and GitHub histories diverged, including overlapping authentication
changes and remote-only committee/billing modules. A plain file overwrite would
discard existing work or restore paid inference unintentionally.

**How to apply:** Reconcile deliberately on a new review branch based on current
remote main. Validate that exact candidate separately, keep real inference blocked,
use fast-forward-only updates and leave main and existing pending proposals intact.

Prefer a Git tree with inline file contents to a burst of parallel per-file blob
requests when saving a multi-file revision through the connector.

**Why:** Parallel blob creation returned HTTP 429 during a project update,
despite valid connector authentication.

**How to apply:** Keep the existing tree as `base_tree`, include only reviewed
changes, create a child commit and fast-forward without force. A throttling
response is not evidence that the connector needs reauthorization.