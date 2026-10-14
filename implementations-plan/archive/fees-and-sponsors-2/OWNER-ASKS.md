# Owner asks: fees-and-sponsors-2

Two open questions (OA-1, OA-4) and two defaults that follow your signed words (OA-2, OA-3): answer those two only to change them. Each touches what a person sees or how a screen behaves, so the planner and the panel may not decide it. The arc ships each ask's "What ships now" form and everything that does not depend on it. An answer that arrives before the PR opens is built in the same PR (plan Phase 6).

Figures are the decision page's test values: "up to" 0.016 FJ, of which 0.004 FJ is the app's priority fee.

**How the figure is computed (built from your answers, not an ask).** The figure is gas limits × the cap that goes on chain. When the app gives its own cap, that cap goes on chain as given, on every payer (P6-19 B). When it gives only a priority fee, the wallet's usual cap is raised by that fee, so the fee is really paid (#411: "include the app's priority fee in the committed cap"). The priority fee part shown is gas limits × the app's priority fee, never more than the figure.

**Built from your words, so not asked.** Confirm stays off while an operation whose app set its own cap or priority fee has no figure yet (P6-07: "if an app asks for more, the approval window shows the higher figure before Confirm"; P6-19 B: "which the person sees before Confirm"). This reopens known limit #396 for that case only. OA-3 asks about one corner of it.

## OA-1: the definition behind the dotted "priority fee" (#411, P6-13b)

**Surface.** The approval window's app-paid fee row, and Settings → Glossary.

**The conflict.** You chose B's sentence with C's tooltip. C's definition is two sentences: "An extra the app pays the network for faster inclusion. You pay it, up to the cap shown." The rule in CLAUDE.md (§ Tooltips and the glossary) allows one sentence of at most 100 characters, and the test `DottedTerm.scan.test.ts` fails on two. The planner may not reword your text.

**Options.**
- **A. One sentence (recommended):** "An extra the app asks you to pay the network for faster inclusion, up to the cap shown." (87 characters.) It keeps C's facts, and "asks" matches the row's "the app asked for".
- **B. Your own wording**, one sentence, at most 100 characters.
- **C. No dotted term.** The row keeps B's sentence as plain text and the glossary gets no entry.

**What ships now.** C. An answer adds the glossary entry (term "Priority fee", section Fees, where "Approval window") and the dotted term in the same PR.

## OA-2 (a default; answer only to change it): B's sentence when the wallet's own method pays (#411, P6-13 B and P6-13b)

**Surface.** The approval window's fee readout when the person's method pays: public Fee Juice, private fee juice or a sponsor. Today: "You pay ~0.012 FJ ($0.001)"; a sponsor row: "You pay Nothing" over the struck figure.

**Why it is open.** P6-13 B sends the app's priority fee on every payer "with no separate priority figure on the screen". P6-13b then drew B's sentence on the app-paid row, which has no "You pay" label, no USD figure and no sponsor case. The readout has all three, and no design was drawn for it.

**Options.**
- **A. B's sentence on rows the person pays (recommended).** Public or private Fee Juice reads "Fee up to 0.016 FJ, includes a 0.004 FJ priority fee the app asked for" in place of "You pay ~X FJ (USD)". A sponsor row keeps "You pay Nothing" over the struck figure, which includes the priority fee the sponsor pays.
- **B. The readout keeps its words** and gains a second line: "includes a 0.004 FJ priority fee the app asked for".
- **C. As P6-13 B says.** The readout keeps its words; its figure includes the priority fee, with no separate figure.

**What ships now.** C, P6-13 B as signed. A or B would add words P6-13b drew only on the app-paid row.

## OA-3 (a default; answer only to change it): Confirm when the figure fails to load (#400, #411)

**Surface.** The approval window's Confirm button, for an operation whose app set its own cap or priority fee.

**Why it is open.** Confirm now waits for that operation's figure. If the estimate fails, there is no figure to show. On an app-paid row the window offers no way to estimate again; on other rows, changing the fee method estimates again.

**Options.**
- **A. Confirm stays off (recommended)**, as on Send after a failed first estimate (your OA-9 A). The person can reject, or change the fee method where the row offers one.
- **B. Confirm turns on after a failure**, and the send goes out on a figure the person has not seen; that departs from P6-07.

**What ships now.** A, which P6-07 requires.

## OA-4: the app-paid row before its figure lands (#400)

**Surface.** The approval window's app-paid row ("✓ Fee payment method set by nulo-playground").

**Why it is open.** You signed the row with its figure ("Fee up to 0.012 FJ"). The figure needs the app-paid estimate, which lands a few seconds after the window opens, may fail, and never runs for a default-entrypoint operation (known limit #395). The signed shots show only the landed row, and they drop the app's name.

**Options.**
- **A. Today's sentence until the figure lands (recommended).** "Fee payment method set by nulo-playground", replaced by "Fee up to 0.012 FJ" when the estimate lands; it stays after a failure, and always on a default-entrypoint operation.
- **B. A loading bar in place of the figure**, as the fee readout draws while it estimates. A failure or a default-entrypoint operation shows today's sentence.

**What ships now.** A.
