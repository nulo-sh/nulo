# toast-hide-1: phase 0 (planning)

- No plan consult: the lane brief's proportion skips the plan audit round; the one Codex pass runs over the plan and the net diff after the build.

# phase 1 (the arc)

- Codex round 1 (gpt-6.1-sol, high, read-only) over the plan and the net diff: changes needed. Material as a claim: a directive inside `Popup`'s `<Transition>` runs `unmounted` as the leave starts, not after it; the plan said the toast returns once the sheet has gone. Comment and plan corrected, behaviour kept (a 150 ms cross-fade). Two nits fixed. Round 2 (resumed): approve, one wording nit fixed.
- The render lane's fixture recipient (`0x0e90…c1fd` built from a repeated pattern) is not a valid Aztec address, so the real Sending label is null for it; the capture's journal record uses a valid address with the same short form.
