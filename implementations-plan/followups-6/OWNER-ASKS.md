# followups-6 — owner asks

The lane ships without an answer to either ask: each says what ships now.

## OA-1. The PXE store error a popup can show quotes the stored stamp

- **Surface.** Any popup that shows a caught error's message, when the wallet's encrypted PXE store holds a version stamp it cannot parse (a corrupt or hostile stored value). Traced: adding a token → `token/service.ts` → the message transport keeps the text → `NewTokenPopup.vue`'s error row. The same text is also written, capped at 200 characters, to the `error` log line every user's log viewer keeps and exports.
- **Today, and what ships now.** The row reads `PXE store version mismatch. Refusing to open (preserving data): stamp failed to parse (Failed to deserialize version information: SyntaxError: …)`, where the end quotes up to about ten characters of the stored value. This lane leaves it unchanged; it only removes the same text from a `warn` log line (#315).
- **Option B.** End the message at `… stamp failed to parse`, keeping the parser's error as the thrown error's `cause` (not shown, not logged). The row then reads `PXE store version mismatch. Refusing to open (preserving data): stamp failed to parse`.
- **Recommendation.** B: the quoted bytes help no one reading the row, and B also takes them out of the exported `error` log line.

## OA-2. A live Testnet outage and the nightly and release gate

- **Surface.** The nightly prerelease and a release's assets, which the artifact smoke gates.
- **Today.** Every artifact spec reaches the live Testnet node, so an outage or a slow node can red the artifact smoke through any spec.
- **What ships now.** Only the new `shipped-token-list.test.ts` reaches the live node; its failure names the node ("the live Testnet node did not answer") or the seed. It gates the nightly and the release like every smoke spec, so a dRPC outage can still withhold them, now through one named spec.
- **Option B.** Keep the live spec but out of the gate (reported, not blocking), which would let a release ship when the shipped token list was never checked against the live chain.
- **Recommendation.** Keep it gating (what ships now): a release whose shipped list does not resolve should not ship, and a named outage is a rerun.
