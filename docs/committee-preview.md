# Local React committee preview

Run `npm run dev:committee-demo` and visit http://127.0.0.1:19622/committee-demo.html. This entry mounts the same HermesAnalysisPanel used by the investment module, with an explicit in-memory transport. All prices, balances and responses are synthetic; it does not execute the Python committee, Hermes, an LLM or the portal backend. No login or secrets are needed.

The default app panel keeps the live transport, authentication and server configuration unchanged. Preview queries have a separate namespace and a separate QueryClient. The standalone entry is not added to the app router. Its separate build output is dist/committee-demo; do not deploy this output as the customer portal.

`npm run test:committee-preview` runs isolated type checking, six wallet/fixture tests and two existing panel rendering tests. Tests cover price approval/staleness, insufficient balance, single reservation and settlement, confirmed failure refunds, and unknown usage blocking further work. UI verification also covers the modal and the four scenarios.

Synthetic progress advances when polled and is not actual agent execution. Unknown usage intentionally remains running/reserved until the demonstration is reset. Changing scenario resets all in-memory data; reload also resets the preview. There is no persistence, billing or financial recommendation.
