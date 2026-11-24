# Owner asks: harden-security-fixes-5

No arc changes what a person sees. The owner answered the three questions below on decision page 202 (2026-11-24); none of them builds anything in this plan (plan.md, D11-D13).

## OA-1: the approval window while an authorization's arguments are read

- **Surface:** the approval window for an app's request to authorize one call (the "Authorization" card), between the window opening and the wallet finishing its reading of the call's arguments, and when that reading fails; also the authorizations a send lists under its steps.
- **Today:** while the wallet reads, the card shows the delegate, the function's name and "Reading arguments…"; when the reading fails, the card shows the raw fields with the advice the window has for them. A public grant, by contrast, holds Confirm while it is read and refuses the request when it cannot be read.
- **What ships now, with no visible change:** nothing.
- **Option A, keep today's behaviour.**
- **Option B, Confirm waits for the reading:** the card is unchanged; Confirm is disabled while the line reads "Reading arguments…", the disabled look it has while a fee estimate is pending. Every outcome of the reading turns it on: a decoded call shows its rows, and a call the wallet cannot read (no interface for the contract or the function, arguments that do not fit, or a read that failed) shows its raw fields as today. An operation with no call to read is not held. No new words.
- **Option C, Confirm waits, and only a failed read refuses:** as B while waiting, and for a call with no interface or with arguments that do not fit. A read that failed (the worker did not answer) shows the error row a public grant shows when it cannot be read ("Can't read the arguments") and Confirm stays off; the person rejects and the app can ask again.
- **Recommendation:** B. It applies the public grant's waiting rule, adds no copy, and keeps the raw fields as the way through for a call the wallet cannot name. C adds a dead end that a retry fixes.
- **Frames:** light and dark, at the approval window's size: today, B waiting, B failed, C failed (C waiting is B waiting); listed in the orchestrator's report.
- **The owner's answer:** none of the three. "The problem is that the user needs to read "Reading arguments..." there is no "easy visual way" of just understanding "something is loading" unless he reads. Like the skeleton loaders we use on other places." The question continues outside this plan.

## OA-2: a network's incoming history when the person replaces its endpoint

- **Surface:** Activity's incoming public transfers and the arrival alerts, after Settings → Networks → an endpoint is replaced.
- **Today:** the incoming history, the scan positions and the arrival floors the wallet stored stay as they were read from the earlier endpoint. Removing a token clears that token's receipts and scan position; removing the network or resetting the profile clears everything.
- **What ships now, with no visible change:** nothing.
- **Option A, rebuild on replacement:** when the person replaces a network's primary endpoint, the wallet keeps each token's Allow or Hide decision and clears that network's public receipts, scan positions and arrival floors, then reads them again from the new endpoint. Activity's public receipts for that network disappear and come back newest first over the next ticks; with a long history the oldest take minutes, at the node calls of a first scan. Arrival floors restart at the new tip, so nothing that arrived before the replacement alerts again. Private receipts are not touched. No stored shape changes.
- **Option B, reset a scan position above the tip:** when a token's stored scan position is above the tip a fresh read reports, the wallet resets only that position and scans the token again; receipts already stored stay (each has a fixed id, so none doubles), and arrival floors are not touched. Height alone cannot tell a wrong position from a node that is behind, so a lagging node also triggers it, each time costing a rescan of that token.
- **Option C, keep today's behaviour,** recorded as a known limit beside #440, to reopen on a report of missing incoming transfers or silent arrivals after an endpoint change, or once the wallet reads chain tips from a second source.
- **Recommendation:** A. It gives "replace the endpoint" one meaning, stop relying on what the earlier endpoint said, and its cost falls only on that deliberate act. B fires on ordinary lag and covers only scan positions. C is the choice if a rescan on every endpoint change is not worth it.
- **Frames:** none. No option changes a layout or a word; A changes which rows show for a while, as a first scan does.
- **The owner's pick:** C, "Keep today's behaviour, recorded as a known limit beside #440, to reopen on a report of missing incoming transfers or silent arrivals after an endpoint change, or once the wallet reads chain tips from a second source." Recorded as #1974.

## OA-3: a log buffer that keeps no 32-byte values

- **Surface:** Settings → Developer → Logs, and its CSV export.
- **Today:** worker log lines keep contract addresses, class ids and hashes when a line names them, for diagnosis (`wallet/logger/utils.ts`, the note above `projectError`); the PXE frame's lines already replace every 32-byte value with `[32 bytes]` (`offscreen/frame-logger.ts`).
- **What ships now:** nothing beyond the plan's P2, which changes three log calls to categories.
- **Option A, keep today's behaviour.**
- **Option B, scrub the whole buffer as the PXE frame does:** every 32-byte value in every line reads `[32 bytes]`. A bug report could no longer say which contract or class failed.
- **Option C, scrub only lines at `info` and above:** debug lines, captured only with debug logging on, keep their values.
- **Recommendation:** A. Account addresses stay out of reach-wide lines by the rule the guard and the review already apply; a blanket scrub costs the diagnosis that makes a report useful.
- **The owner's pick:** A, "Keep today's behaviour."
