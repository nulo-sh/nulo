# tx-logs-1: owner asks

Three asks. None blocks the build: each ships its "what ships now" form, and the PR stays a draft until all three are answered.

## OA-1: the look of the two "Download logs" buttons

- **Surfaces.** The History detail of a failed send (inside "Error (developer mode)", under the error text) and the execute window while it shows a failure before approval (a refusal, a failed fee estimate or a processing error), in a row above Reject and Confirm. Developer mode only; the button shows only when the wallet kept that request's logs.
- **Label.** "Download logs" on both.
- **Options** (pictures in light and dark under `screenshots/`: `look-<a|b|c>-<window|history>-<light|dark>.png`, taken from the scope-refusal e2e on the local sandbox):
  - **A, a secondary chip** (recommended): the small grey `secondary` button with the download glyph before the label, left-aligned. Reads as a tool, not an action on the request.
  - **B, an outline bar:** a full-width `primary_outline` button. Easiest to find, but in the execute window it competes with Confirm.
  - **C, a text link:** the link-styled `text` button with the glyph. Quietest; the least obvious that it downloads a file.
- **What ships now:** A, labelled "Download logs", on both surfaces.

## OA-2: the words of the downloaded file

P117-03 A fixed the file's structure. The label words are the lane's; a Note changes any of them.

```
Wallet version: 1.2.8
Browser: Chrome 131
Network: Local network
Trace id: 1a2b3c4d
dApp origin host: localhost:5174

Timeline
<start, ISO UTC>  <duration> ms  <stage>  <outcome>

Log lines (<n>)
<ISO UTC> <context>:<source> <LEVEL> <data>

Error envelope
{ the JSON the dApp received }
```

- When the request has no answer yet (downloaded from the execute window before Reject), the last block reads `(no answer yet)`.
- **What the file can still hold.** Every address, hash and class id is blanked, shortened ones included. Every `http`, `https`, `ws` and `wss` URL keeps only its scheme and host; a protocol-relative `//host/path` is not recognised. An error text the wallet does not write (an app contract's failing assertion, a simulator message) is kept, scrubbed, because it is usually the cause: up to 300 characters in a timeline outcome, 1,000 for the send's recorded error, 4,000 in a log line. A plain decimal number or a word inside such a text is not recognised and passes.
- **Lines follow the log level.** An expected refusal logs at the debug level, so without Debug Mode a refused request's file has its timeline and envelope but few or no lines. Turning on Debug Mode before the request fills them.
- **What ships now:** the words above. The golden file is `apps/extension/src/wallet/logger/request-report.golden.txt`; `screenshots/file-history.png` is a real file from the e2e run (a refused send, downloaded from History with Debug Mode on).

## OA-3: the log viewer's CSV export writes the filtered lines

- **Surface.** Settings → Developer → Logs → Export logs to CSV.
- **Today** it writes every loaded line whatever the Source and Level filters show; **after**, it writes the lines the filters show. Nothing on screen changes.
- The lane brief allows this as a one-line change. **What ships now:** the filtered export. Say "keep it all" to revert.
