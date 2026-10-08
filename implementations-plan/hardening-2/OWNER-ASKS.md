# Owner asks: hardening-2

Five asks. Every arc is built now in the form named under "What ships now". **OA-3 needs your explicit sign-off before arc 1 merges**: its ship-now form changes behaviour a person can notice, though only when a dApp sends a malformed call. The other four change nothing a person sees in their ship-now form.

## OA-1 — Should the wallet check a dApp's permission request against the full schema?

**Surface.** The connect window that opens when a dApp asks for permissions (`requestCapabilities`), and its "unknown" row.

**Today.** A dApp may ask for a permission type the wallet does not know, for example one added by a newer SDK. The window opens, shows one "unknown" row with the reject-if-unsure text, and the person decides. A request with a malformed header (no `version`, no `metadata`) also opens the window.

**Options.**

- **A. Keep today's checks.** The window behaves as it does now. The wallet does not parse the request against the full schema.
- **B. Full schema check, as the reference wallet does.** A request with an unknown permission type, or a malformed header, is refused before any window opens. The dApp receives "The wallet could not process the request." The "unknown" row can then never appear, so its text and its code become dead.
- **C. Check the header and each known permission type; let unknown types through.** A malformed header is refused before the window, as in B. A known type with bad fields is refused, as it is today. An unknown type still reaches the window as the "unknown" row.

**What each looks like to a person.**

- A: no change.
- B: a dApp built on a newer SDK cannot connect at all. The person sees the dApp's own error, and no window opens.
- C: same as A for every conforming dApp. A dApp with a broken header fails to connect, and no window opens.

**Recommendation: C.** It keeps the forward-compatible "unknown" row, which exists so a person can decide about a permission the wallet cannot describe. It also closes the one part of the request the wallet does not validate today.

**What ships now: A.** `requestCapabilities` keeps its current guards and is the one method the new parse skips, also when it arrives as a leg of a batch. Tests pin that `requestCapabilities(null)` still resolves with no grants and that a batched `requestCapabilities` behaves as today.

## OA-2 — Should a malformed dApp call get its own error code?

**Surface.** The error a dApp developer receives when the wallet refuses a malformed call. A person sees this only through the dApp's own error display.

**Today and in what ships now.** Every malformed call is refused with the wallet's generic text, "The wallet could not process the request.", with no code. The new parse keeps that text.

**Options.**

- **A. Keep the generic text.** The dApp cannot tell its own bug from a wallet fault.
- **B. A classified refusal.** Code `-32602` (JSON-RPC "Invalid params"), `walletErrorCode: "INVALID_PARAMS"`, and one fixed message, for example "The request's arguments do not match the wallet API." The message never names an argument value. This mirrors how the wallet already classifies "Contract not registered".

**What each looks like.** A dApp that shows wallet errors to its users would show the generic text (A) or the fixed message (B).

**Recommendation: B.** The wallet's own error-mapping file says an error a dApp is meant to act on deserves a class, and a malformed call is the dApp's to fix.

**What ships now: A.**

## OA-3 — What should a person see when the wallet refuses a malformed call before any window opens?

**Surface.** The transaction approval window and the activity list. Only a dApp that sends a malformed call sees a change; a dApp on the stock SDK does not send one.

**Before (today).**

- A `sendTx` whose payload has the authorization fields the old guard checked, but malformed other fields (a non-hex value, a call missing its selector), opens the approval window. It fails later, inside the window or during simulation.
- A malformed `sendTx` that the old guard did catch is refused before any window, and its queued activity row reads "Popup closed early".
- A malformed `sendTx` that is also outside the dApp's granted scope is refused by the scope check, and its row reads "Not allowed".

**After (what ships now).**

- Every malformed call is refused before any window opens. The dApp receives the generic text.
- Its queued activity row reads "Popup closed early", the label today's pre-window refusals already show, although no window ever opened.
- A malformed call that is also out of scope now reads "Popup closed early" instead of "Not allowed", because the shape check now runs before the scope check.

**Options.**

- **A. Ship as above.** No new copy. The label is inaccurate for this case, as it already is for today's pre-window refusals.
- **B. A dedicated label**, for example "Refused: malformed request". New copy and a new journal outcome.
- **C. No activity row for a call refused before any window.** The refusal stays visible to the dApp only.

**Recommendation: B**, if the activity list is meant to explain what happened; A otherwise. A wrong label on a row a person may read during an incident is worse than no row.

**What is built now: A.** The lane brief requires the refusal; the label is existing copy. **Arc 1's PR does not merge until you sign off on the before/after above** (your words are quoted in the PR body, with a screenshot of the activity row). If you pick B or C, it lands in arc 1 before that merge.

## OA-4 — May an `http://[::1]` node URL stop working?

**Surface.** Settings → Networks, for anyone who saved a node URL on the IPv6 loopback address. A contributor running a local node is the realistic case.

**Today.** The CSP has no `connect-src` limit, so any node URL the network form accepts is reachable, `http://[::1]:<port>` included.

**The problem.** The new `connect-src` must keep every accepted URL reachable. The CSP grammar has no IPv6 literal, so a browser may ignore an `http://[::1]:*` source. Phase 7 tests it on both browsers.

**Options (only if a browser ignores the `[::1]` source).**

- **A. `connect-src … http:`.** Every plain-HTTP URL stays reachable, so no saved endpoint breaks. The policy also permits plain-HTTP connections to any host.
- **B. Loopback only (`http://localhost:* http://127.0.0.1:*`).** A saved `http://[::1]` URL stops working; the person must switch to `localhost`. The network form would then refuse `[::1]` too, which is new copy.

**Recommendation: B.** Plain HTTP to a remote node is already refused by the network form, so `http:` would only widen the policy for a case the wallet does not accept anyway, except `[::1]`.

**What ships now: A**, only if the probe shows the `[::1]` source is ignored. If both browsers honour it, the precise list ships and this ask is withdrawn.

## OA-5 — Should the published schema patch check the two addresses in `grantPublicAuthwit`'s content?

**Surface.** `@nulo-sh/wallet-sdk-schema-patch` on npm. No screen.

**Today.** `grantPublicAuthwit`'s content is `{ caller, contract, method, args }`. `caller` and `contract` are `z.string()`, so the new parse accepts any string there. `method` is a function name and `args` is `z.array(z.unknown())`: unencoded ABI arguments, which the wallet later encodes against the contract's ABI, so neither has a field schema to apply. The wallet's execution path still validates the addresses it builds from `caller` and `contract`.

**Options.**

- **A. Keep `z.string()` for the two addresses.** No API change.
- **B. Use the address schema for `caller` and `contract`.** `method` and `args` stay as they are. A dApp that sends a malformed address is refused at the parse instead of later. The published package's accepted inputs narrow, which is an npm API change.

**Recommendation: B**, in a release that notes it.

**What ships now: A.** This lane only tightens the patch's drift check, which is not part of the published schema's accepted inputs.
