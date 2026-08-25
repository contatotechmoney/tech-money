---
name: Clerk production hosting
description: Production hosting requirement for the Replit-managed Clerk proxy.
---

Use a server-backed autoscale deployment when this project uses Clerk authentication. The Express proxy mounted at `/api/__clerk` is part of the production authentication path; keep the Clerk provider's proxy configuration canonical so Replit can populate it during publishing.

**Why:** Static hosting cannot run the proxy middleware that makes Clerk work reliably on Replit/custom domains in production.

**How to apply:** When changing authentication or publishing configuration, do not convert the app back to a static deployment while Clerk is enabled. Keep the proxy middleware mounted before Express body parsers.