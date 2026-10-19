# Phase 4 (arc A4) and the close-out: lessons

## A4 (2026-10-19)

- Never built here. hygiene-3's arc 2 (#833, dev `4ae32919`) rendered `SecretCountdownClose` on the design `Button` `cta_outline` with the dotted ring, filled press and eased fade kept as one doubled-class override, pixel-identical 14/14 per browser in both themes, and closed #517. The overrides' fate is #831 (D402).

## OA-3's pictures (2026-10-19)

- Row 5 pictured; rows 1, 3 and 4 need a schedule the e2e harness cannot drive without staging it, and row 2 shows nothing (D802). A7's picture spec wrapped `chrome.runtime.connect` to hold, refuse or drop a balance read; holding a request only adds latency, a drop is a real reconnect, but a refusal is a made-up answer and holding an answer while an event passes reorders the port.
- Row 1, traced: Holdings and Select token read and listen on one `token-balance` port. `getTokenBalances` is one `chrome.storage.local.get()` (`EntityStorage.getAll`), and the base service posts its answer in that read's microtasks (`core/base-service.ts`); an add or a change emits after its `repo.set` resolves (`token-balance/service.ts`). Storage answers in order, so an event reaches the popup either after an answer that missed its row, then applies, or before an answer that has it. A drop needs the worker to reorder; by this reading the row may never show.
- Row 2, traced: Send shows `tokenBalances.find((b) => b.token.id === activeTokenIdx)` only (`send.vue`). Since #781 it applies deletes and reads again after a counted reconnect, and a token id belongs to one chain, so the extra rows `append` keeps never change the amount shown in any order found.
- Rows 3 and 4 need the profile facade lock queued as Codex's A6 schedule has it (a locked operation across the record's write, the read passing, a second one delaying the event).
- Row 5 (Codex close-out rounds 1 and 2): a real refusal exists without a drop, the client's own 60 s timeout (`DEFAULT_RPC_TIMEOUT_MS`) on a request that reaches the worker late; the late answer is ignored. A scratch smoke spec (kept outside the repo) pictured it on Home's import rows, Chrome, deterministic in two runs: CDP `Fetch` holds every node request; `callService` starts `addToken` with a hand-built `TokenInterface` (the popup's `parseTokenInterface` needs a node, the RPC does not), so Home lists the import in progress; a `chrome.runtime.connect` wrapper closes Home's `operation-journal` ports and delays their reopening while the held node requests are refused and the add fails; the first `getOperations` on each reopened port is sent 62 s late. Home then shows "Adding token…" for good, and a page opened then lists nothing. History's corresponding capture was not taken (round 3: an `executeTransfer` RPC journals a transfer before building it, so a node-free failed send may serve).

## OA-2 (2026-10-19)

- No issue, page or answer carried it; filed as #840 (`owner-decision`), A ships (D803).

## Close-out review (2026-10-19)

- Codex (gpt-6.1-sol, high, read-only, session `01a151c7-0607-7442-8628-13a22831f747`), over this diff and both issue drafts. Round 1: `findings` 3 (row 5 has a real timeout path; A7 converged six of the seven rows; rows 1 and 2 were stated as observed). Round 2: `findings` 3 (the RPC starts an import without a node; one lessons sentence and option B's "did" kept the old claims). Round 3: `findings` 1 (History's capture needs no live node either, by an `executeTransfer` RPC). Every finding accepted; the third round's fix is its own wording. Hard stop at three rounds.
