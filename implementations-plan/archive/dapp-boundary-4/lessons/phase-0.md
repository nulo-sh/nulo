# dapp-boundary-4 phase 0: consults

- 2026-10-20 recon: two Explore agents (sonnet), one on the metadata op path, one on the registration path and the class gate; findings in [recon.md](../recon.md).
- 2026-10-20 probe (planner, real modules, run from a scratch copy, deleted): `ContractArtifactSchema.parseAsync` refuses an artifact that is already parsed (and the compiled-in module object): `storageLayout.*.slot` must be a string. So `assertWireArtifactClassId` takes wire forms only; an artifact the executor looked up (parsed, through `PxeServiceClient.getContractArtifact`) would always fail it. Recorded as D6.
- 2026-10-20 plan audit round 1, Codex (gpt-6.1-sol high, session 01a15b23): `conditional approve`, nine findings; dispositions in plan.md § Review verdicts.
- 2026-10-20 plan audit round 1, Opus Plan leg: `conditional approve`, eight findings; dispositions in plan.md § Review verdicts. Both legs prefer Outline A.
- 2026-10-20 final fresh Codex pass (gpt-6.1-sol high, session 01a15b32): `conditional approve` (endpoint pinning, baseline descriptions in Facts and recon, the barrel re-export); resumed round 2 `conditional approve` (one D2 wording); round 3 `approve`.
