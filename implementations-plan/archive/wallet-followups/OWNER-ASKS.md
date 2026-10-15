# Owner asks: wallet-followups

The lane brief's five no-ask records are the visible budget. The three asks below sit at their edges. OA-2 and OA-3 are for the orchestrator: each needs a line in the plan's approval, or its fallback ships. OA-1 is for the owner; what ships now is the record as worded.

## OA-1. Edit account: a name another account already has, as the form opens

**Surface:** Edit account, opened on an account whose stored name another account in the same profile already has. Account import can create such a pair today: it refuses only a blank name.

| Option | What the person sees |
|---|---|
| **A. No warning for the account's own name** | The form opens as today. "Already exist" shows only once the typed name, without outer spaces, differs from the account's own name and matches another account's. |
| **B. The #256 record as worded (the plan)** | "Already exist" shows as the form opens, and "Update account" stays disabled until the person picks another name. |

**Recommendation: B.** Edit account edits only the name, so a person opens it to rename, and the warning says why the button is off. A is a reasonable alternative if the owner would rather not show a warning the person did not cause.

**What ships now:** B, which is what the #256 record says.

## OA-2. Logs window: the oldest entries leave past the cap (orchestrator)

**Surface:** the logs window, after more than 1,100 log entries (10,100 with Debug mode) arrive while it is open.

No no-ask record names #258's visible effect. The lane brief scopes #258 as a fix ("a component test with the CodeMirror stub", "keep the edit to the trim branch"), and this plan reads that as the record.

| Option | What the person sees |
|---|---|
| **A. Trim (the plan)** | The window holds the entries its list holds: once the list drops its oldest 100, the window drops them too. The CSV export already holds only the list. |
| **B. As is** | The window keeps every entry it ever received until a filter change, "Clear logs" or a Debug mode toggle rebuilds it. |

**Recommendation: A.** It is the behaviour the trim branch was written for, and the window then agrees with its export.

**What ships now:** A only if the orchestrator's approval records it. Otherwise B: phase 3 is dropped, the PR does not say `Closes #258`, and #258 stays open with a comment.

## OA-3. Edit account: a name of only spaces (orchestrator)

**Surface:** Edit account, with the name field holding only spaces.

The #256 record gives Edit "New account's validator" and a trimmed save; the #257 record says a name that trims to empty counts as empty. Read together they cover this case: a trimmed save of a blank name would store the empty name #257 removes. Neither record names Edit's blank case in words.

| Option | What the person sees |
|---|---|
| **A. Blank counts as empty (the plan)** | "Update account" stays disabled, as it is today for an empty field. No new words. |
| **B. As today** | "Update account" is enabled and saves the spaces unchanged. |

**Recommendation: A.**

**What ships now:** A only if the orchestrator's approval records it. Otherwise B for this case; the rest of #256 ships.
