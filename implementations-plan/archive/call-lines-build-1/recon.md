# call-lines-build-1: recon

No Explore agents: the change map is the prototype's two files, read in full at `eb42af540`.

- **The prototype applies clean.** `git diff 3723daa3c~1 eb42af540` over `SendTxSummary.vue` and `pages/tx/[id].vue` is empty, so `3723daa3c` is c2 over dev's own two files.
- **The window already says "on"** (`SendTxSummary.vue:183`): the title in `meta`, " on " in the head's `body`, then `.chip_tail` (nowrap) holding the chip and the chevron. `.chip_tail` has a second caller, the transfer line's "to" box (`:197`), which holds no "on".
- **The detail page stacks the title over the contract** (`pages/tx/[id].vue:324-330`), with chips for protocol contracts only (`:150-156`).
- **The chip's width cap meets "on"** (D2): `ContractChip.vue`'s `.chip` is `inline-flex; max-width: 100%`, inside Popover's `inline` span (`packages/design/src/ui/Popover.vue`, `.inline { min-width: 0; max-width: 100% }`, which applies only as a flex item). `network/type-roles-windows.test.ts` `expectCallCaptionsWhole` writes a 48-letter label at 360 px and requires the chip inside its step's row.
- **Tests that pin the window's sentence** pass unchanged under c2 (the render lane's run): `SendTxSummary.test.ts`, `OperationCard.summary.test.ts` (at-rest sentences, the chevron box: `ON_CHIP`'s "holds" reads the node before the chevron's no-break space, a chip or an element holding one), `OperationCard.rail.test.ts`, `pages/tx/[id].test.ts` (its `rows` helper reads the title's parent, now `.call_line`).
- **E2E that reach the change**: smoke `execute-steps.test.ts` (`chevronsAlone`), smoke `type-roles.test.ts` (tx detail), network `type-roles-windows.test.ts` (head, `execute-op-call-to`, chip; the capped case), network `tx-sendTx-default.test.ts:285-297` (the head's chip).
- **Closed known limits** searched ("chip wrap"): none in this area.
