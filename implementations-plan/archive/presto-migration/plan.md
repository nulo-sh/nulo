# Presto replaces the Aztec Accelerator

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The wallet proves through Presto (`packages/aztec-runtime/src/pxe/chain-runtime.ts`), the network e2e runners install a headless Presto server (`.github/actions/setup-presto-server`), the activity card names where each proof ran (`apps/extension/src/utils/card-subtitle.ts`), and onboarding and Settings show Presto's states (`apps/extension/src/onboarding/pages/presto.vue`, `apps/extension/src/popup/pages/settings/proving.vue`).
- **Open items**: the missing "Grant access" onboarding step for Presto on Firefox, tracked in #156. The playground's nested stale `@aztec/protocol-contracts` has since resolved: the playground is on the workspace's Aztec line and no package is held.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Replace the native-prover SDK with its successor, Presto, which speaks the same wire protocol, and make the wallet tell the truth about where a proof ran. Three parts: swap the SDK and the CI prover; carry a correlated prove-phase event from the offscreen document to the service worker and persist it on the operation journal; rebuild the onboarding speed step and add a Settings proving page on Presto's states. Production forces an encrypted connection to the local app and keeps the silent in-browser fallback for end users. No banner sits anywhere in the popup, and the activity subtitle is plain secondary text.

## Why

The old SDK was being superseded, and it could not express the failure states that now matter: a browser permission block on local-network access, and an encrypted connection that is unavailable with a diagnosis. Before this, a person whose native prover refused the wallet silently got slow in-browser proofs and could not tell. In CI, "proved natively" had to be enforced, not assumed, so a silent fallback could not turn the canary green.

## What shipped

- **Runtime.** The PXE factory builds a `PrestoProver`. Production passes `httpsOnly: true` explicitly, so neither SDK detection nor an environment variable can widen it to plaintext; plaintext is derived only from the required proving mode used in CI. The manifest gained the HTTPS loopback host permission beside the HTTP one. Required mode throws on any fallback-class phase with the reason spelled out.
- **CI.** The headless server is downloaded with the tarball and the extracted binary both digest-pinned and a single-member archive rule, started with allow-all on the server process only, and its log is asserted for real proofs. A build stamp marks the required arm, and the production build refuses a bundle carrying it. The tests themselves assert the native backend when the build is stamped, so a soak run is a real gate too.
- **Prove-phase truth.** A `proveId` rides the prove call. The runtime derives the backend at the source, where every phase is seen in order, and a sequence number lets the receiver drop stale events, so a lost event can never fake "native". The service worker gates the sender, maps the id to its journal row and updates the proving stage's backend under the transition lock, a no-op once the stage has moved on. A remembered last-prove outcome and denial make a Presto refusal visible instead of silent.
- **Surfaces.** `usePrestoStatus` and `presto-ui-state.ts` map the client's status to the card banner (onboarding only; the popup has none) or a status card with per-state recovery steps and a Retry that forces a refresh. Onboarding and Settings share them. The card banner is Presto's custom element, re-tokened to Nulo's colors.
- **Dependencies.** The three Presto packages were exact-pinned and checked for registry signatures and build provenance before the first-party age-gate exceptions were granted, then removed. A test pins that the Presto core package declares no `@aztec` dependency, and `scripts/aztec-hold-residue-check.ts` covers the new root.
- **Not done.** Presto-side changes and a persisted prefer-native toggle were out of scope, and the wallet offers no plaintext proving to end users.
