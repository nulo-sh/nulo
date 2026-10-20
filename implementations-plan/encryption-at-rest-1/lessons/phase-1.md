# Arc A1 (P1–P3): contacts and dApp sessions

## Where the code differs from the plan, and why

- **#865 merged as #890, unfrozen.** `PINNED_STAMPS` is empty on dev, so `bun run baseline:storage` rewrites stamp 0 and A1 re-stamps with no `--additive` mark. Once #865's A4 freezes the stamps, a rebase of this arc needs the `--additive` stamp the plan names.
- **The `sealed` flag lives in `STORES`** (`sealedCodec`) and the registry copies it, so a sealed root has one declaration. The snapshot keeps the inner codec as the stored schema rather than an `Envelope | LegacyRow` union: the envelope is the store's wire form, not a shape a writer produces, and the union would have made every inner field optional in the snapshot.
- **No e2e read seam.** The readers of the two sealed roots call the services' own RPCs through `callService` (`tests/e2e/fixtures/session.ts`): the active profile's rows, decoded and MAC-checked as the wallet reads them. That needs no build flag, no production marker, and also runs against the release and nightly artifacts, which a build-stamped seam would not. `stale-network-chaos`'s `sessionRows` stays raw: it compares bytes before and after a reset, which envelopes satisfy. A2 decides for the journal readers (26 network specs).
- **`purgeForChain` ignores unopened rows** where the plan says the chain purge reports `unavailable`. Its only caller is the network reset, under a live run fence of the profile (`network-reset/service.ts`, `afterPurge`), so the keys are held and an unopened row is a tampered one: never served, so never an auto-approval.
- **`ownerless` (legacy txs) is deferred to A2**, its only consumer. The keyed-id mode is built and unit-tested.
- **The reference generator** lives at the repo-root `reference/row-seal-v1/`, the repo's convention, not under `packages/wallet-crypto/reference/`. V13 numbers the two existing boxes' fixed-IV vectors; V12 is the row seal.
- **`DappSessionMacStorage.drop`** deletes at the storage id the row was read from, never at its self-reported id.
- **The keyless sweep is a backstop for these two roots.** The typed purges already remove every envelope naming the profile: contacts' raw pass matches the envelope's `profileId`, and the session purge deletes unopened rows. A composition run with the sweep removed stayed green; `sealed-roots.test.ts` proves the sweep itself.

## Attempts

- **Unit suite after wiring: 118 failures.** Fakes lacked `rowKeys`/`onRowKeysReady`, tests read raw rows, the coordinator stub lacked `dropRowKeys`, and the baseline tests used contacts as their migratable example. All fixed in the fakes and tests; no gate touched.
- **`useContactImportExport.composition.test.ts` read the import popup before its rows existed.** Sealed reads go through real WebCrypto, which settles past `flushPromises`; `pick` now waits for the rows its doc already promised.
- **Firefox list-load gate, three attempts.**
  1. Rows opened one `await` at a time: 211 → 404 ms (+193). `readAll` now opens all rows with one `Promise.all`.
  2. Sampled right after unlock, then after rendering 2 001 rows: Firefox +53, +105, +111 ms; Chrome +57, +65 ms. The two samples came from pages in different states (one with one row, one with 2 001).
  3. Both samples from a freshly opened popup, after one unmeasured read: Chrome +42, +28 ms; Firefox −6, −26, −36 ms (load 100–145). The gate holds on both. The remaining spread is page and host noise, larger than the sealing cost at 2 000 rows.
  4. Low-load samples (load 35–65) put Firefox over the gate: +132 and +225 ms. Two causes. The sealed sample ran with a second popup open with 2 001 rows rendered (Firefox runs it in the event page's process), while the plaintext sample's popup held one row. Both samples now close it first. And the reads spike to 300–640 ms around the fifth to seventh read in every series, plaintext and sealed alike, on both browsers (GC), so a median of 5 lands on the spike some runs and not others. With the popup closed, Firefox's median of 5 measured +12, +250, +54 and +25 ms; the reads before the spike +40 to +70 ms; a median of 9 +5 and +29 ms. Chrome: +23 and +78 ms at a median of 5, −25 and −7 ms at a median of 9. Profiling found nothing per row beyond the WebCrypto call: Firefox pays about 20–35 µs a decrypt. The gate does not hold consistently on Firefox, so it stops for the owner (OA-5); the metric stays the plan's median of 5.
- **Chrome smoke red once** in `navigateToSettings`'s 5 s post-click hash wait, right after unlock with a 2 001-row page to mount. The spec now navigates by hash there.

## Measured

- `sealed-storage.test.ts`: Chrome 25–33 s, Firefox 41–60 s (estimates 60 s and 90 s).
- Sealing 2 000 plaintext rows after unlock: Chrome 2.3–6.6 s, Firefox 7.0–16 s, under load 35–145.
- Full smoke at retry 0, local: Chrome 59 files passed, 7 skipped, 1 747 s; Firefox 62 passed, 4 skipped, 2 498 s.

## Review

- **Codex round 1** (`run-codex.sh … high read-only gpt-6.1-sol`, the `alejo-icloud` home, session `01a156f7`): APPROVE WITH FIXES, three medium findings, each reproduced by Codex and adopted:
  1. a deletion completing while an open derived the row keys let the open capture the newer epoch and open the deleted profile; the fill now throws as the open does;
  2. a prepared write stalled past the key drop could commit behind the keyless sweep; every commit now re-checks the keys synchronously;
  3. the refusal read key presence after its deletes, so an unlock in between turned an unread grant into `revoked`; the scan now reports `keyless` rows itself.
- **Opus review** (beside round 1): APPROVE WITH FIXES, three low findings, adopted: the refusal race (same as Codex 3); a stored non-string value served on read but invisible to every delete path, now refused; the delete-racing-open test never reached the guard, now replaced by one that holds the derivation (and was mutation-checked: it fails with the throw removed).
- **Codex round 2** (resumed): APPROVE, no material finding; the four fixes held under its in-memory reproductions. The loop stopped at two rounds.
