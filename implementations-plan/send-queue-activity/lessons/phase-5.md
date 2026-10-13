# Arc 5 — lessons

## What the signed items touch (2026-10-13)

- **Item 1's two fee links never render.** `FeeSettingsCard` shows them only for a v-model of `{ paymentMethod: { kind: "embedded" } }`; `OperationCard.vue` mounts the card only for an operation `isEmbeddedFeePayment` rejects, and Send and the authwit popups start from no settings. Check where a control renders before planning e2e for it: the plan's `git grep -l send-fee-override` finds no e2e file because no flow reaches it.
- **TypeScript does not add an extension to a wildcard `exports` subpath.** `@nulo/design/composables/keys` resolves for Vite but not for `vue-tsc`; import `@nulo/design/composables/keys.ts`, as the `.vue` subpaths carry theirs.
- **A re-export lands in the auto-import list.** Exporting `isComposing` from `composables/usePopupEntity.ts` adds it to `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` on the next build; commit both with the change.

## Gates

- **Before/after timing in one run.** A copy of the HEAD test file under another name (`zz-*.test.ts`, never committed) runs beside the edited one against one build, so both timings share the host's load.
