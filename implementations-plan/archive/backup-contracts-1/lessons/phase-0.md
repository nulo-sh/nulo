# Phase 0: planning consults

- 2026-11-23 recon: two Sonnet explorers (reuse sweep over ten capabilities; Aztec 6.0.0 internals). Findings in recon.md.
- 2026-11-23 measurement: the first run used the raw aztec-standards Token (4.09M per artifact) and did not match the earlier lane's 1.8M. The build strips debug info from the shipped token (`apps/extension/scripts/strip-artifact-debug-info.ts`); with the strip, 1,835,882, matching. Lesson: measure the artifact as the build ships it.
- 2026-11-23 Aztecscan docs: `docs.aztecscan.xyz` is a Swagger shell with no content for a non-browser fetch; facts come from the earlier research lane (2026-11-11) and the public chicmoz source (head `2707070a5`, 2026-11-20), with no key used.
- 2026-11-23 probe: `ContractArtifactSchema.parseAsync` drops an `artifactHash` key.
- 2026-11-23 Codex r1 (`gpt-6.1-sol`, high, read-only): conditional approve. Ten findings; one high (Retry re-inflates shared artifacts, reproduced in memory: 1,837,878 compact vs 58,750,884 on retry). Disposition in plan.md § Plan review.
- 2026-11-23 Opus r1 (Plan agent, Opus 5.5): conditional approve; independently found the same Retry re-inflation, plus the e2e helper, OA-3's recovery claim, the `debug` field and per-call class sends.
- 2026-11-23 final fresh Codex pass (session 01a20953): conditional approve (format-1 checks through re-encoding; per-network class sends), resumed: conditional approve (the fallback must look across the whole encoder input, Retry included), resumed: approve.
- Lesson: an encoder that dedupes by class id must check object identity across its whole input, or it drops a second copy before the check that copy needs.
