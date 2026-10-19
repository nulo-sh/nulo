# Phase 5: refused requests get their own cap (OA-2)

| When (2026-10-19) | Step | Outcome |
|---|---|---|
| 19:4x | `gc.ts`: two evictable classes, each under the per-scope cap | the refused class first keyed on "no tx hash"; moved to `wasNeverSent` so the sweep and Activity's "Nothing was sent" share one predicate, kept narrower than it by the refusal kinds (HS3-D12) |
| 19:5x | `gc.test.ts`, real journal over `FakeBrowserApi` | first run red: a `queued` dApp record needs a `sessionId`; with it, 19 pass |
