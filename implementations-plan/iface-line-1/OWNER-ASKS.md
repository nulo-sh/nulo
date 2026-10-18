# iface-line-1: owner asks

## OA-1. The lines the mockups did not draw (execute window)

**Surface**: the execute window's unreadable-call rows and its footer. The P44 mockups drew two of the four reasons, and no closing advice and no footer.

**What ships now** (the arc builds this and does not wait):
- An argument mismatch reads `The arguments don't fit the interface.`, with `interface` dotted. These are P41-03 option A's own words, which the owner picked on page 41. The same reason also covers two other cases: a value that the window cannot show whole (a hidden control or direction character, a cut text), and a function with more fields than the wallet reads. Today's sentence has the same gap.
- A read that failed reads `Nulo couldn't read the arguments right now.`, with no dotted term. Today's sentence is the same.
- The closing advice `Check what the app says this does before approving.` is one line in the grey of the reason line. It sits directly under the reason line of the last unreadable call, once per window.
- The footer's refusal tooltip, on a request with a grant Nulo cannot read, keeps today's sentence and loses the advice. Example: `Nulo doesn't have this contract's interface, so it can't read the arguments.` Nulo refuses that request, so "before approving" does not apply there. The advice stays once, in the body.

**Options**:
- A (ships now): the four items above.
- B: broader words for the mismatch reason, to cover its other two cases: `Nulo can't show these arguments with the interface.`, with `interface` dotted.
- C: the advice after the whole list of calls, not under the last unreadable call.
- D: the footer tooltip as today, with the advice (the advice then reads twice on that request).
- E: no advice on a request with a grant Nulo cannot read. Nulo refuses such a request, so "before approving" does not apply in its body either. Ships now as the lane brief places it: under the last unreadable grant, as the advice reads there today.

**Recommendation**: A. It uses the words the owner already picked, keeps the advice next to the call it is about, and says it once.

**Pictures**: the PR carries before and after shots of a window with three calls Nulo has no interface for. They do not show the missing-function line, the mismatch line, the failed-read line or the footer; the PR body quotes each. The fee-raised window shows the same rows.
