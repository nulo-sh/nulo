# execute-window-2: phase 0 (planning)

## Inputs

- P42-15's record: option C, "Build the better form now as this lane's next arc (the mockup's words are a draft for your sign-off)". The mockup (`p42-15-c`, from the shots-p42-reask lead at dev `18d29f23`) puts the notice in the fee card's place and one full-width Reject; its History mockup reads TRANSACTION / Not allowed.
- #758 carries no Decision section (the lane brief said it does); the pick is quoted from the decision record instead.
- #104 and #106 carry the owner's C = "Defer" (page 19). The lane brief read them as work; the plan builds nothing for them.

## Consults

- **Plan round 1, Codex** (gpt-6.1-sol, high, session `01a15056`): conditional approve, six findings. Taken: the terminal record (D7), the title resolved in `failQueuedForError` (D6), the e2e raw reads (D6), the Reject/close race (D1), the retry and smoke gates. Not taken: the worker closing the window (D1 substitutes in `interaction()` instead, one place for both orders); holding the words (D10, the orchestrator's instruction).
- **Plan round 1, Opus 5.5** (Plan): conditional approve, eleven findings; traced D1's instance end to end and confirmed the `v-if` slot switch. Taken: as the table in `plan.md`. Not taken: a raw error in queued records (it changes every refusal before a claim, outside the pick; OA-1 states the developer view), merging only after OA-1, awaiting the RPC before closing.
- **Decision on the race**: both legs found that Reject's local close can reach the worker before Reject's RPC. Substituting the refusal for `UserRejectedError` and `WINDOW_CLOSED_BY_USER` in `interaction()` makes both orders end the same; the timeout is left out so the dApp learns nothing without the person's press.
- **Plan round 2, Codex** (resumed): conditional approve. One finding: an unattended lock makes the window's `reject()` run, so the dApp reads 4100 with no press. Argued in round 3: every way the person can leave the window discloses the same fact, so a live-session gate only spares an untouched window; OA-1 C (4001) is the owner's control.
- **Plan round 3, Codex** (resumed): approve, with the lock-time end stated as accepted policy (D1, Security).
