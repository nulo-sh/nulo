# Hygiene: the technical follow-ups that change no screen

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A once-per-file token fixture in `apps/extension/tests/e2e/fixtures/extra-tokens.ts`, a priced-hero wait in `apps/extension/tests/e2e/network/incoming-arrival.test.ts`, a hook-based import in `apps/extension/src/presto/client.test.ts`, the root `typecheck` delegating to the extension's own in `package.json`, and a comment sweep across the extension and its packages that touched no behaviour.
- **Open items**: the rest of the workflow-reference class in code (names of review tools and `Phase N` tags that remain in comments), `apps/extension/src/e2e/config.test.ts` still importing in its timed body, and the e2e tree having no type gate; all tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

One light-tier PR for the technical follow-ups of the earlier feedback programme, with no product behaviour change: only comments are touched in production files. Nothing a person sees changes, so no UI sign-off applied. Every change was proven red-first where it altered a test, and no retry, timeout or advisory flag was raised anywhere.

## Why

- Three network specs cannot pass a retry once an attempt has deployed and imported their tokens: the retry deploys a second set under the same symbols and the exact row assertions fail. A pinning spec also inherits a pin a failed attempt left behind.
- A cold dynamic import inside a test body and a hook whose budget had been raised are the same timing smell; the right fix is a default-budget hook.
- About seventy comment and test-title lines cited workflow history, and several docs and skills said things the tree contradicted.
- A calm-arrival check read Home's hero before its quotes landed, so it compared against a dollar zero.

## What shipped

- Four specs (`holdings`, `home-cap`, `pin-to-home`, `send-picker`) set up their tokens once per file through a file-scoped fixture, so a retry reuses the first attempt's tokens, and a failed setup is rethrown to every retry instead of rerun. `pin-to-home` clears its stored pins first, so a retry starts from its first attempt's state.
- The relay and presto client unit tests import in a default-budget `beforeEach`; the raised hook budget is gone.
- A one-time derivation-parity script that clicked a removed option and ran nowhere was deleted, as was the pointer park in `legal-acceptance` that outlived its snack.
- Sixty-nine replacements across forty-one files drop two workflow tags from comments and test titles. A review loop then corrected four comments: a false module header, the lifetime of terminal journal records, a queued-transfer example that would not parse, and stale line citations.
- Docs and skills were corrected to what the tree does, including the harness and Firefox findings that lived only in plan logs.
- The calm check waits for a priced hero on both of its calls, proven with the price replies held across the read: red before, green after on both browsers, then a three-run flake bar on each.
- Left out: the em-dash strings and anything a person sees, the vitest recheck waiting on upstream, a dead fallback in the playground fixture, and a second scratch script that still runs against a live fixture.

## Lessons

### Price settle

The e2e price seed covers one stablecoin only, while the wallet also asks for the chain's native asset. Wherever the price host answers, a real quote replaces the seeded dollar mid-test and every fiat figure moves. A test must wait for a priced figure and never read Home's hero straight after a remount. A price landing is not an arrival, so the wait costs a balance-arrival check nothing. A host that blocks the price request hides the effect locally; CI shows it as whole-dollar steps on a six-token transfer.
