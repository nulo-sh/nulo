# iface-line-1 recon

At `9470d4e9` (`origin/dev`). One Sonnet Explore sweep for test pins, plus a direct read of the window.

## Where the notice renders

- `apps/extension/src/popup/windows/execute/UnreadableArgsNotice.vue:14-18`: the orange `Can't read the arguments` row, then `rawNotice(reason)` as one `body` / `tertiary` line. Its only hosts:
  - `SendTxSummary.vue:81-83`, the "What this does" row of an `aztec_sendTx` call (the window at rest);
  - `CallArguments.vue:133`, which `OperationCard.vue` mounts four times: the `send_transaction` grant rows (`:280`, at rest), the Payload rows under Show all details (`:315`), the discovered authorizations under Show all details (`:355`), and the `aztec_createAuthWit` card (`:607`, at rest).
- `call-surface.ts:217-225`: `RAW_NOTICE` (four sentences, one per `UndecodedReason`) and `rawNotice(reason)`, which appends `Check what the app says this does before approving.` `UndecodedReason` is `packages/wallet-bridge/src/decoded-call.ts:23`.
- A surface reads `raw` exactly when its decode is `undecoded` (`callSurface`, `call-surface.ts:126-131`); `readableGrants` (`:238-244`) turns a grant it cannot print whole into `arguments`.
- The footer: `grantRefusalRow` (`call-surface.ts:247-252`) titles `Can't read the arguments` with `rawNotice(reason)` as its tooltip; `index.vue:130, 610`; `DappApprovalFooter.vue:36-45` renders it.
- Every interaction the bridge builds carries one operation (`packages/wallet-bridge/src/dispatcher.ts:516, 584, 629, 676`), so a window holds one `OperationCard`.

## Reuse

- `DottedTerm.vue` (`components/composite/`): a key-checked term, `tabindex="0"` span (`:44`), the definition on `aria-describedby` and in the bubble. A sentence holding one: the `{ text } | { term }` segment list in `capabilities/permission-rows.ts:48-66`, rendered by `PermissionGroup.vue:45-48`, which dots `authorization` in more than one row of the connect window.
- `glossary.ts`: `GLOSSARY` and `GLOSSARY_SECTIONS` (Apps = `authorization`, `name-for-this-app`).
- `DetailsToggle.vue` is already the one disclosure for the execute window, with `aria-controls` and the reduced-motion rule: #594 (`63498074`) and #721 (`ec40515c`); `a11y-css.test.ts:69` pins the rule.
- `shownText` (text a sighted person reads, hidden nodes dropped): a local helper at `OperationCard.fee.test.ts:145`.

## Tests that pin today's text (break or must follow)

- `OperationCard.summary.test.ts:92` (full sentence), `OperationCard.fallback.test.ts:249`, `execute.fixture.ts:171` (`FACTS`, read by `OperationCard.facts.test.ts`), `OperationCard.authwit.test.ts:99-116` (`RAW_NOTICE[reason]` per reason, grant block).
- `index.test.ts:1072, 1082`: the footer tooltip equals `rawNotice(reason)`.
- `glossary.test.ts` (`SPEC`, exact `toEqual`), `settings/glossary.test.ts` (entry ids per section, per-key `test.each`).
- `OperationCard.fee.test.ts:363-376`: its comment says nothing else on the window is dotted; it counts only the fee scenario's terms.
- Not asserted anywhere: "Check what the app says", the other three sentences, a count of the advice, Tab order in the execute window.

## Gates the change reaches

- `DottedTerm.scan.test.ts`: a literal `term=` key that exists; a used definition of one sentence and at most 100 characters (`interface`'s is 86).
- `copy-dash-ban.test.ts` scans the new strings (no em dash between clauses). `type-role-ban.test.ts`, the complexity manifest and the type-roles digests key on nothing in the touched files; a NEW `.vue` under `popup/windows/execute/` would need a `surfaces.expected.json` row.
- E2E: `tests/e2e/tooltips-glossary.test.ts` (smoke) lists entries from `GLOSSARY_SECTIONS` and shoots the glossary; `tests/e2e/network/type-roles-windows.test.ts:554-581` opens a call the wallet cannot decode (the delegated `donate`, consumer unregistered) and sweeps the window's type roles with the raw fields open. The sweep agent missed this second file; it was found by a direct read.
- Screenshots: `shotSend` (`tests/e2e/fixtures/send-page.ts:224`) writes both themes under `NULO_E2E_SHOT_DIR`. The playground's `pg-btn-sendTx-multicall` builds three `transfer_public_to_public` calls on the `tokenAddress` input (`apps/playground/src/sections/transactions.ts:93-118, 211-218`).

## Closed known limits searched

`gh issue list --state closed --label known-limit --search "unreadable arguments interface"`: none.
