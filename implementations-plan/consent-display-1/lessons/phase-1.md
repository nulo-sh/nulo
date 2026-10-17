# Phase 1: discovery admits secure origins only

- 2026-10-17: the refusal written as the first statement of `handleDiscovery` scored cognitive complexity 16 (budget 15). Fixed by making `handleDiscovery` the gate and moving the unchanged body to `handleSecureDiscovery` (D10); both callers still enter through the gate.
- 2026-10-17: mutation check: with the refusal disabled, the three refusal cases in `background.origin-admission.test.ts` fail and both `https:` controls pass.
- 2026-10-17: the network e2e playground is served on `http://localhost:<port>` (`scripts/e2e/resolve-ports.ts`), inside the admitted set.
- 2026-10-17: `test:all` red, once: `background.transport.test.ts` built a pending discovery credited to `"unknown"`, approved it, then expected the content wrapper to drop the key exchange. The gate now deletes that pending entry synchronously, so the state cannot exist. The case now runs on the real SDK handler for a tab with no url and a plain-http tab: no pending entry, no session, nothing sent to the tab; both fail with the gate disabled. The wrapper's `credit.origin !== "unknown"` clause stays as a local invariant, now unreachable through discovery (D10).
