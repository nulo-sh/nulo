# lock-window-1: owner asks

No ask blocks arc 1. Arc 1 changes the lock screen's password field and the two export pages. One ask touches the lock screen only in passing: OA-1's option B would change the error toast a network add shows after a lock, and the popup shows that toast over whatever page is open, the lock screen included. Arc 1 neither renders nor changes that toast, and OA-1's answer changes nothing arc 1 builds. Each arc ships what is written under "What ships now", and the asked part waits.

## OA-1. A change the person (or a dApp) asked for, when the wallet locks while it is still saving

**Surface.** Every list a person adds to or edits: fee payers, tokens, networks and their endpoints, accounts (create and import), contacts, and a dApp's connection. It extends the question #1217 left open for adding a fee payer.

**What happens today.** The add or edit takes from a few milliseconds to several seconds (a node or PXE check). If the wallet locks inside that time, the change is still saved. After the next unlock the person finds it in the list.

**Options.**
- **A. Keep it (today).** The change lands. The lock screen shows what it shows today.
- **B. Refuse it.** The change is dropped if the wallet locked before it was saved. After the next unlock it is not in the list. In addition:
  - adding a network shows a different error toast, over whatever page is open after the lock ("Something went wrong" instead of "Network added, but the switch didn't confirm. Reopen the popup to verify");
  - a token add leaves a failed import row on Home for 30 seconds, and a dApp's "add this token" request is refused;
  - a dApp's connect, approved just before the lock, fails.

**Recommendation: A.** The person asked for the change and saw it start; a lock is not a "cancel". The saved row is encrypted under the profile's own keys, which the wallet keeps until it closes (the design kept in #1055). Refusing it makes a change silently disappear, with a generic error at best.

**What ships now.** A: no site changes. With A, #1218 closes with these sites recorded as deliberate exceptions. With B, a later arc adds the session check at each site.

## OA-2. An import that a background restart overtook after its restore (#1138)

**Surface.** Import, after the restore has opened the profile, when the background restarts (strict mode on).

**What the owner said (2026-10-26).** "The lock landing should treat the import route as auth-required, with an e2e proof."

**How arc 2 reads it.** Only an import that already opened its session is sent to the lock screen. Read literally, the rule would also send an import still in progress to the lock screen whenever a profile is selected (the usual case when Import is opened from the lock screen), and that import's "rolled back" screen would never show.

**What the person sees after arc 2.** The lock screen right after the restart, not Home. Two things they no longer see:
- the import's own summary of what it skipped, with its Retry button: Home's restore banner names a skipped account state after the unlock;
- a "Profile imported" toast after the unlock.

One rarer case changes too: an import still in progress, in a popup that another window's unlock marked open, is sent to the lock screen by a restart, and its "rolled back" screen does not show.

**Also asked: New profile and the first-profile create.** A restart in their last second, after the profile opened, can show Home with no session, as #1138 does, over a much shorter window.
- **A. The same rule as Import** (the lock screen).
- **B. Leave them.**

**Recommendation.** Confirm the reading. For New profile, A: it is the same cause.

**What ships now.** The reading above, for Import only.

## OA-3. Editing a fee payer's address while it is being removed

**Surface.** Settings › Fee payers › Edit, when the same fee payer is renamed in another window, or removed by a network reset, during the address check (a few seconds).

**What happens today.** The address edit writes back the row it read before its check: a rename made meanwhile is lost, and a removed fee payer comes back.

**The fix.** The edit re-reads the row right before it saves: the rename survives. An edit of a removed fee payer fails with the popup's existing error line, which reads "Invalid id".

**Recommendation: fix.** It is a bug; the error text is the one an edit of a deleted fee payer shows today.

**What ships now.** Nothing; the arc that follows OA-1's answer carries it, with the fee-payer discovery's log level (#1218's "Also") in the same file.
