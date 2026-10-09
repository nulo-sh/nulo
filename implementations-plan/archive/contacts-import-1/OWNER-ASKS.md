# Owner asks: contacts-import-1

Two calls about one toast. The arc ships the "ship now" form of each without waiting; a different answer is a small change to the label or the stop rule, with its tests.

No other change in this lane alters a screen: the file-chooser fix (#45) leaves the contacts import, the account import and the full-backup import exactly as they are today, and #44 needs no change (already fixed by #41).

## 1. #43: what the toast says when an import stops early

**Surface:** the toast after a contacts import (Settings → Contacts → Import contacts → Import selected).

**Today, in that moment:** the import either writes the remaining rows to the newly active profile and reports success (the bug), or, after a plain lock, reports "Error occurred during import": the next row's read of the book fails and aborts the import. ("Import ended with errors" appears only when the lock lands during the last row's write.) Checked on Chrome: a 500-contact import locked from a second window after 11 rows.

**Pictures:** the PR shows A, B and today's toast after that same lock, in both themes, on the lock screen where it appears.

#43 asks that "the result toast reports the import as incomplete". The lane brief adds the count of contacts written. The count is the number of writes the wallet confirmed; when the stop interrupts a write, that one contact may be saved without being counted.

| Option | Text | Kind |
|---|---|---|
| **A. Ship now** (the issue's "incomplete" plus the brief's count) | `Import incomplete · 2 contacts written` (`1 contact written`, `0 contacts written`) | error (red), like "Import ended with errors" |
| **B. Count against the selection** | `Import incomplete · 2 of 5 contacts written` | error |
| **C. Count and cause** | `Import stopped: the wallet locked or the profile changed · 2 of 5 contacts written` | error |
| **D. No count** | `Import incomplete` | error |

**Where it shows (all options):** in the window that ran the import, on whatever screen that window shows when the import stops. After a lock that is the lock screen. The wallet closes an open toast when it locks, so if the lock reaches that window after the toast opened, the toast closes with it. This is how every import result toast behaves today; the lane does not change it.

**Planner's recommendation: B.** It tells the person how much is missing, so they know to import the file again, and it names no cause the wallet cannot be sure of. C is the most explicit but long for a toast. A ships until you answer.

## 2. #43: what stops an import

**Ship now (A):** the import stops when the wallet session its rows were shown in ends before the last row is written. That is: the active profile is switched (in any window), the wallet locks (by hand or by auto-lock), the same profile is unlocked again, the wallet's background restarts, or the profile is being deleted. It also stops when a write fails and the wallet then cannot confirm that the session is still live: the import never continues on a session it cannot prove. This reuses the session check the full-backup export already uses. After a stop, nothing more is written and no sender is registered.

**B. Profile change only:** the import stops only when a different profile becomes active. After a plain lock the import fails as it does today, and the toast reads "Error occurred during import".

**Planner's recommendation: A.** After a lock nothing more can be written anyway, and "incomplete, N written" tells the person more than "ended with errors". B needs a second, weaker check beside the existing one.
