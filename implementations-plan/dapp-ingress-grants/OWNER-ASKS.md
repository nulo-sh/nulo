# Owner asks: dapp-ingress-grants

Questions the plan cannot decide, because a person or an app would notice the answer. Each one has the form that ships now if nobody answers: the arc builds that form and does not wait. None of them blocks arc 1, which changes no screen, string or app-facing error.

Two of them qualify a signed proposal rather than add to it: item 3 (P2-06) and item 4 (P3-03). The orchestrator attaches each to its record, so the page's signature covers it. A dependent phase does not merge on a deviation nobody signed: if the page is signed without the qualification, that phase is held out of its arc's PR until the answer is recorded.

## 1. #83: the pre-send refusals page 2 does not name (arc 2)

**Surface.** History card and journal detail of an app send refused before any window.

**Context.** Page 2 classifies three refusals (Terms, missing permission, session ended). These still file as `popup_bound` and read "Popup closed early" / "The popup closed before this transaction could finish.":
- the wallet locked at the moment the call arrived (`Error("Wallet locked")`, `profile/service.ts:513`);
- the channel belongs to a profile that is no longer active ("Session no longer valid — reconnect", `background.ts:1265`);
- the app's network is not served by the wallet (`ChainNotSupportedError`);
- the app named no account it may use (`dispatcher.ts:1161`, `:1165`);
- too many sends already waiting (`TooManyPendingError`).

**Options.**
- **A.** Keep them as they are.
- **B.** File the lock under the existing `session_ended` ("Stopped when the wallet locked"), the same cause as P2-03; keep the others as they are.
- **C.** B, and give the other four one shared label, for example "Refused before sending" / "The wallet refused this request before anything was signed. Nothing was sent."

**Recommendation.** B now; C on a later page with exact copy.

**What ships now.** A. Arc 2 then says `Refs #83` and the close-out moves these five to a new `owner-decision` issue.

## 2. #86: refused calls the wallet does not resolve read "Transaction" (arc 2)

**Surface.** History card title, journal title and Method row of a refused app call.

**Context.** P2-04 titles a refused call by the function its selector resolves to, or "Transaction" when it cannot be resolved. The wallet resolves a selector only once it builds the call. A call refused at arrival is never resolved, so its row reads "Transaction", even when the app's claimed name was honest. "At arrival" covers every refusal before the person sees anything: the Terms, a missing permission, a scope refused by name, a locked wallet, a network the wallet does not serve, too many sends already waiting, and no account the app may use. A call whose selector names no function in the contract ("Method not found") also reads "Transaction", as P2-04's fallback says.

**Options.**
- **A.** "Transaction" for every refusal at arrival; the resolved name for a refusal after the wallet resolved the call.
- **B.** Resolve every refused call through the wallet's node connection before titling it. Precise, but every refused send then costs a node read, which an app can trigger at will (bounded by the queued-row caps, 8 per session and 32 overall).

**Recommendation.** A.

**What ships now.** A.

## 3. #124: what sits under the "Connection request expired" overlay (arc 2)

**Surface.** The connect window after Allow, when its wait expires.

**Context.** P2-06 says the window "shows the existing cancelled overlay". The plan keeps the connect page mounted and lays the overlay over it, by changing only the window's hash. If a browser reloads the page instead, the page starts again on a request that is already over, so the overlay most likely sits over the page's "Something went wrong" state rather than an empty window.

**Options.**
- **A.** Overlay over the connect page as it was.
- **B.** Overlay over whatever the reloaded page shows (most likely its "Something went wrong" state).

**Recommendation.** A. Before #124 merges, a manual check on Chrome and on Firefox (the app page paused in DevTools right after Allow, so its key exchange never starts and the request expires) records whether the page stays loaded, what sits under the overlay, and that OK closes the window. The automated tests prove the wallet's expiry logic, not what the browser does with the navigation.

**What ships now.** A where it holds. B, on a browser that reloads, is beyond the signed proposal: #124's phase merges with it only if this answer says B is acceptable; otherwise that phase is held until a fix that keeps A.

## 4. #199: a non-canonical chainInfo at discovery gets no answer, not INVALID_PARAMS (arc 3)

**Surface.** What an app receives when it connects with a malformed `chainInfo`.

**Context.** P3-03 says such a `chainInfo` "is refused with INVALID_PARAMS". The first place the wallet reads it is discovery, and the discovery protocol has no way to answer with an error: a refused discovery simply gets no reply (`@aztec-labs/wallet-sdk` 6.0.0-rc.1, `rejectDiscovery`). INVALID_PARAMS can reach the app only on a session that already exists, which a refused discovery never creates.

Separately, P3-03 bounds `version` only at `2^53`, but the wallet's chain id folds it through a 32-bit XOR, so a `version` above `2^32 - 1` still lands on the same id as a smaller one. Bounding `version` to `2^32 - 1` as well closes that alias; the implementer first confirms that the version of every network the wallet serves is below `2^32`.

**Options.**
- **A.** Refuse at discovery (no reply), terminate at establishment, answer `-32602` at a call (defence in depth).
- **B.** Approve such a discovery so the first call can be refused with `-32602`. This creates a session row for an app the person never saw, so it is not offered as a real option.

**Recommendation.** A, plus the `version` bound.

**What ships now.** A with P3-03's bounds as signed (no `version` bound), with this ask attached to P3-03 so its signature covers the discovery case. Without it, #199 is held out of arc 3's PR.

## 5. #125: the typed Terms refusal cannot reach a new connection (arc 3)

**Surface.** What an app receives when a new connection is refused because the Terms are not accepted.

**Context.** P2-07 proposes the same typed refusal (4100) an existing session gets, "If the discovery reply cannot carry a typed refusal, it stays as today." It cannot (same protocol limit as ask 4), so nothing changes for the app; arc 3 adds a test that pins today's behaviour.

**Options.**
- **A.** Close #125 on the proposal's own fallback.
- **B.** A, and open a `blocked:external` issue asking aztec-packages for a typed discovery rejection (the #127 pattern).

**Recommendation.** B.

**What ships now.** A; B needs only a yes.

## 6. #89: the 0.2.0 publish (after arc 3)

**Surface.** `@nulo-sh/wallet-sdk-schema-patch` on npm.

**Context.** `publish-packages.yml` publishes all three packages at one version. A 0.2.0 for the schema patch also publishes `@nulo-sh/wallet-crypto` and `@nulo-sh/resolve-asset` as 0.2.0, with no change in them. No package changelog exists; the README npm shows is `scripts/publish/readme/wallet-sdk-schema-patch.md`.

**Options.**
- **A.** Lockstep 0.2.0 for all three; the changelog line goes in a `## Changes` section of that README.
- **B.** Teach the workflow per-package versions first (a CI change and its own plan).

**Recommendation.** A.

**What ships now.** A's README line in arc 3. The publish itself is yours to dispatch; no agent runs it.

## 7. #124: the expired connect window keeps the app's connect slot until it is closed (arc 2)

**Surface.** The expired overlay from P2-06, and the app's next connection.

**Context.** While a connect window is open it holds one of the app's two connect slots. P2-06 keeps the expired window open until OK. Until then that slot stays taken, with no timer: an app with two expired overlays open cannot start a third connection (it queues, then times out) until one is closed. Every held slot cost the person an Allow click, so an app cannot hold slots alone.

**Options.**
- **A.** As P2-06 says: the overlay stays until OK or the window is closed.
- **B.** A, and the overlay also closes by itself after a fixed time (for example 30 seconds).
- **C.** Free the slot at expiry while the overlay stays. Not recommended: a window would then outlive its slot, and the connect-window limit would no longer count every open window.

**Recommendation.** A.

**What ships now.** A.

## 8. P2-03: the journal detail of a refusal filed as `session_ended` (arc 2)

**Surface.** Journal detail of an app send refused because its session had ended.

**Context.** P2-03 files it as `session_ended` and quotes the card's line, "Stopped when the wallet locked". The detail page has no entry for that kind, so it reads the generic "Error" / "Something went wrong with this transaction." That is what every `session_ended` record already shows on its detail page today.

**Options.**
- **A.** Keep the generic detail.
- **B.** Give the detail the card's words, for example "Stopped when the wallet locked" / "The wallet locked while this was in progress." (copy to approve). It may not say "Nothing was sent": the same kind also files a lock that lands during execution, which can follow a sent request (H7).

**Recommendation.** B.

**What ships now.** A.
