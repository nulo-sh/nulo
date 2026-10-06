# Adversarial review of the key model

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Nothing in the tree. The review was report-only and its throwaway harnesses were not kept; the code it examined lives in `packages/wallet-crypto/`, whose threat model is `packages/wallet-crypto/ATTACK-SURFACE.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Attack the second-generation key model as a black-hat exercise after its stack landed, before anyone relied on it. The review was read-only and produced a report, not code, and no outside reviewer was consulted. Each of twelve hypotheses had to end exploited with a working demonstration, refuted with executable evidence, or accepted with an argument that survived a second attack.

## Why

A key-derivation change moves every account address and every sealed secret, so a mistake cannot be patched quietly later. The stack had been reviewed piece by piece while it was built, but never against one adversary working across all of it. Eight attacker personas framed the work: malware with storage access, a holder of a sibling profile's credential, a backup thief, a hostile dApp, an injector in an extension context, a race driver, a holder of most of a recovery phrase, and a lying RPC. The review's own checks needed care: a statistical duplicate test over a 2048-word list fails by design, so the word-list check is structural, and a fuzz run should compare parsed content, not accepted strings.

## What shipped

Only conclusions. The stack under review is recorded in [key-model-v2](../key-model-v2/plan.md) and [key-model-v2-hardening](../key-model-v2-hardening/plan.md).

- Generated recovery phrases come from one call site on the platform's secure random source, through a canonical, unique, sorted word list pinned by the official test vectors, and import validates on the same canonical form the derivation uses.
- Every derivation step, from seed to address, matched an independently produced reference vector.
- The parsers failed closed under a large hostile-input run, and the messaging seam rejected content-script and web-origin senders.
- Chain identity failed closed at every layer that handles it.
- The new model was not found weaker than the old one anywhere that could be measured.
- The accepted risks were attacked again and their arguments held.
