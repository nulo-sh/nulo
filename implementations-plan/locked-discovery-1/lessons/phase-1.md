# Phase 1: the worker

- Base moved: `origin/dev` advanced to `6aaebe886` (a nightly test and the passkey-rp live probe) before the arc branched; the plan commit was cherry-picked onto it. No file the plan touches changed.
- Deviation, interface: `UnlockWindows` splits the plan's `show` into `retime(origin, deadline): boolean` and `open(origin, deadline)`. With one `show`, the flow could not tell "retimed the open window" from "opened one", and a tab teardown (`mayOpen` false) must never open. `DappInteractionService` exposes the registry as `unlockWindows` instead of three delegating methods; it is still not an RPC method (the RPC surface is the explicit `rpcMethods` set).
- `offerUnlockWindow` reads `getProfiles()` with a catch: a list that cannot be read opens nothing and leaves the request queued. Without it a throw would reach `handleSecureDiscovery`'s catch, which rejects the request the queue still holds.
- Five existing harness stubs lacked the new field (`unlockWindows`, `getProfiles`); `fakeSdkServices` defaults to no profiles, so every existing locked test keeps today's badge-only path.
- Mutation check of `background.unlock-window.test.ts`: dropping `holds`, counting the site's own window in the connect cap, dropping the drain's close, and dropping the teardown refit each fail exactly one test.
- Gate (2026-11-18): lint 0; typecheck:all 0; wallet-bridge 826 passed; wallet-core 346 passed; extension (window-manager, dapp-interaction, wallet-sdk, core/adapters) 54 files, 817 passed.
