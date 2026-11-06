# discovery-allow-1: phase 1 (arc 1)

- 2026-11-06. The planner's draft applied cleanly at the plan commit. Two test gaps against the plan's step 3, fixed: the wire-shaped case re-implemented the chain-id formula (now the real decoder, `chainInfoToChainId`, over `0x` + 64-hex fields, with the app name as a raw `appId`), and the remember line had no `Aztec:<id>` case (added).
