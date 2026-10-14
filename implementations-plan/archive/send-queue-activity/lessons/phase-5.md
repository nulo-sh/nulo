# Arc 5 — lessons

## What the signed items touch (2026-10-13)

- **Item 1's two fee links never render.** `FeeSettingsCard` shows them only for a v-model of `{ paymentMethod: { kind: "embedded" } }`; `OperationCard.vue` mounts the card only for an operation `isEmbeddedFeePayment` rejects, and Send and the authwit popups start from no settings. Check where a control renders before planning e2e for it: the plan's `git grep -l send-fee-override` finds no e2e file because no flow reaches it.
- **TypeScript does not add an extension to a wildcard `exports` subpath.** `@nulo/design/composables/keys` resolves for Vite but not for `vue-tsc`; import `@nulo/design/composables/keys.ts`, as the `.vue` subpaths carry theirs.
- **A re-export lands in the auto-import list.** Exporting `isComposing` from `composables/usePopupEntity.ts` adds it to `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` on the next build; commit both with the change.

- **A list that scrolls is a Tab stop.** Chrome (130+) and Firefox make a scrolling element with no focusable children keyboard-focusable, so an overflowing suggestion list took the Tab after its field; `tabindex="-1"` opts it out. A one-row e2e cannot see it: seed enough rows to overflow.

## Gates

- **Before/after timing in one run.** A copy of the HEAD test file under another name (`zz-*.test.ts`, never committed) runs beside the edited one against one build, so both timings share the host's load.
- **A shot of a list that fades in.** `shotSend` waits out a popup's entering classes only; a suggestion list shot right after it appears is drawn mid-fade, with the card beneath showing through. Wait for `getAnimations().length === 0` on the list first.
- **Pixel-identical at rest, read by row.** Before/after shots from separate network runs differ in every per-run address; a row-band diff of the decoded PNGs (a short stdlib-only Python decoder) shows which rows moved, and the fee card's were none.
