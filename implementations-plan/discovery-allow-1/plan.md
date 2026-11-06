---
plan: discovery-allow-1
tier: mid
status: approved by the panel (final Codex pass approve); arc 1 waits on OA-3, arc 2's merge on OA-1 and OA-2
issues: none (decision pages 116, 117, 118)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high + Opus Plan leg in parallel; final fresh Codex pass
base: origin/dev at 4d6bce025
trunk: dev
post_implementation_hardening: not scheduled
---

# discovery-allow-1: the connect window says what Allow reveals; an opt-in "every site may see Nulo" switch

Two arcs, stacked, then a docs-only close-out. Arc 1 rewrites the connect window's explanation (P117-06 D). Arc 2 adds a per-profile switch that answers a new site's discovery with no connect window, its Settings row on Connected Apps and the window's "Allow every site" button (P117-07 A4, P116-07 B, P118-02 C). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Paths are under `apps/extension/` unless they start with a package, `legal/`, `implementations-plan/` or a repo-root file.

## Sign-offs (quoted; the lane builds exactly these)

- **P117-06 D** (page 117, signed 2026-11-06 18:18 UTC; the owner picked D over the page's E): the sentence "Allowing lets this site [discover] Nulo. It sees no account or balance until you pass the [connection check] and approve a request." over A's list: "If you allow", then "This site learns Nulo is installed." / "It also sees Nulo's version, as do the scripts on the page." · "It can then ask to connect." / "You compare emojis first. Sharing an account needs your OK." · "It sees nothing else." / "No account, address, balance or history.", then "Nulo remembers this site on {chain} for 7 days. Revoke it in Settings → Connected Apps." Today's trust line goes. Glossary, Apps group: **discover** "A site learning that Nulo is installed, and its version, so it can ask to connect."; **connection check** "Emojis you compare with the site's, so no one can sit between Nulo and the site."
- **P117-07 A4** (re-picked in chat 2026-11-06 about 18:40 UTC: "on p117-07 instead of the thing I selected: A2, can we do A4?"): a quiet underlined "Allow every site" text button centred under Deny and Allow; it opens the Settings confirm before anything is written; Turn on grants every site and closes the window as an Allow would.
- **P116-07 B** (page 116, signed 17:04 UTC), the off-switch: "Let every site see that Nulo is installed", a Toggle, off at start; on asks "Let every site see Nulo?" / "Any site you open, and the scripts it runs, will learn that Nulo is installed and its version, without asking. Connecting and sharing an account still ask you." / "Turn on" (the strict-mode precedent: accent button); off is immediate; sites already allowed keep their 7 days; stored per profile in a sealed row. Its sub-line "Skips the connect window. Connecting and sharing an account still ask you." is in every frame of page 118.
- **P116-07's guard** (page 116's own text, signed with its picks): "Under every option the secure-origin and subframe refusals, the Terms gate, the rate caps and the emoji check stay; an auto-allowed site that fails the emoji check goes back to the connect window."
- **P118-02 C** (page 118, signed 2026-11-06, relayed 19:37 UTC): the row sits first on Settings → Connected Apps, above Sessions, the 12 px spacing opened to 32 px under it; testids `privacy-row-every-site` and `every-site-toggle`; search synonyms connect, discover, allow, sites, dapps, prompt point at Connected Apps.

## Outcome & Quality Bar

For a person on a dApp's connect window deciding whether to press Allow, and for a person who wants dApps to stop asking.
- The window states, before Allow, exactly what the site learns (presence and version, also to the page's scripts), what it does not, what happens next and how long Nulo remembers it; every string is the signed one.
- No single tap on a stranger's window grants every site: the button opens the confirm, and only Turn on writes.
- With the switch on, a new site gets no connect window and every other guard holds: the secure-origin, subframe and Terms refusals, the caps, the locked queue, the freshness and profile checks, the emoji check, the reconnect budget; a site refused at the emoji check gets the connect window again.
- A storage writer cannot turn the switch on: only a row sealed under the profile's keys counts.
Good enough: no "Until I revoke", no remembered Deny, no change to the emoji check window.

## Assumptions

**Facts** (recon.md, Facts 1-9): the plaintext dual read of a new sealed root; `handleSecureDiscovery` at 79/80 lines; the no-yield window from the lookup to the registration; only `approved` crosses from the window; the Terms read pinned in `discovery-flow.ts`; keyless reads absent and keyless writes throw; new sealed roots join the deletion sweep and the census by themselves; backups carry no unmapped root; the docs that state today's behaviour.

**Inferences** (attack these):
- I1. `useConfirm` works inside a `windows-*` route, since windows are routes of the popup app that mounts `ConfirmPopup`; shots-p117a rendered it (frame a4-02). The arc 2 e2e proves it.
- I2. An auto-allowed site's Connected Apps row reads "Allowed. Not connected yet." until its key exchange writes the hash (before the person answers the check), as after a manual Allow. With the switch on, every site that discovers gets such a 7-day row with no tap, so the list grows with the sites a person visits (Opus r1): no new UI, but a behaviour a person notices, so OA-2 states it. Lookups decrypt every row of the profile: more rows cost more per discovery (plausible, unmeasured; expired rows go on the next add or lookup).
- I3. The A4 button sits inside the footer strip in the signed frame, so the footer needs a slot; the discover window is its only filler.

**Asks**: in [OWNER-ASKS.md](OWNER-ASKS.md). OA-3 (the glossary `where` lines) blocks arc 1. OA-1 (the Privacy Policy sentence and its version kind) and OA-2 (the Connected Apps list grows with every site the switch lets through) concern arc 2: it may be built before they are answered, its PR stays draft, and it merges only after both are.

## Decision ledger

- **D1. Arcs follow the brief's two groups.** Arc 1 = P117-06 D (copy, glossary); arc 2 = the switch (P117-07 A4 + P116-07 B + P118-02 C). Arc 1 is small and independent; arc 2 depends on nothing in it but the window file. Rejected: one arc (a storage stamp, a flow change and a new Settings row beside a copy change is past one sitting); three arcs (the A4 button and the switch ship together or the button grants nothing).
- **D2. The switch lives in `DappSessionService`, as a sibling of the registration counts.** A class `DiscoveryPolicy` (`src/wallet/services/dapp-session/discovery-policy.ts`) over a sealed root `nulo:core:discoveryPolicy`, one row per profile (`PROFILE_ROW_LAYOUT`). The flow already holds the service, purge and refusal live there, and the Connected Apps page already has its client. Rejected: `nulo:config` (device-wide, plaintext, writable on Firefox by any context that can write `storage.local`: P116-07 B signed "sealed per profile"); a new service (a spec, a client, a coordinator purge and a `DiscoveryDeps` field for one flag); `UiPreferenceService` (a popup-preference service the worker does not hold).
- **D3. Only a sealed row counts.** The policy reads its row with `readStorageId` and treats it as on only when `located.sealed` holds and the row parses; a plaintext row, a row that does not open or parse, and a keyless read are off. The class never calls `sealLegacy`: the root had no plaintext era. Rejected: a `legacy: "none"` option on `SealedEntityStorage` (a shared-layer change for one root).
- **D4. A site refused at the emoji check is remembered in the same row.** Row: `{ everySite: true, checkRefused: string[] }` (at most 32 origins, newest last). `refuseVerification` keeps its documented order (the app's channels end first): it emits, then starts `recordCheckRefusal` with no await between, and awaits it after the purge. The policy's lock queues its waiter synchronously and `allows` reads under the same lock, so a discovery set off by the ended channel reads the record (Opus r1); only while the switch is on (no row for people who never turn it on); best-effort (a keyless write is logged at `warn`, the refusal's outcome is unchanged). Turning the switch off deletes the row, refusals included. The guarantee is bounded, and the plan says so (Codex r1): a refused origin is auto-allowed again after 32 later refusals evict it, or when its record could not be written (no row keys: a worker restart with the check open); either way its next connection still opens the emoji check. Filed as one closed `known-limit` at close-out (reopens on a report of a refused site allowed with no window). Rejected: a worker-memory map (an MV3 worker restart forgets it, and the refused page can wait it out: the signed rule would hold only by luck); clearing an entry on a later manual Allow (one more write path for no signed behaviour; eviction at 32 and turning off clear it).
- **D5. The flow chooses after the registration.** In `runDiscoveryPopup`, after `pendingDiscoveryPromises.set`, `unpaced = await dappSessionService.allowsNewSite(profileId, origin)`; when true, no window, `admitVerifyWindow(..., consumesToken: true)` (no person paced it), then today's `persistAndApprove`. `handleSecureDiscovery` and `persistAndApprove` are untouched. The connect variant's `settled` resolves with `unpaced`, so a twin waiting on an unpaced connection spends a token too (`approveAfterPopup`). A failed read is off (asks the person). After admission, an unpaced connection reads the switch again and is refused (its slot given back) if it is off now, so a request queued behind the token budget cannot reveal Nulo after the person turned the switch off ("off is immediate"; final Codex pass). Rejected: reading before the session lookup (breaks the no-yield window and the 80-line budget).
- **D6. The window grants through a separate RPC, then resolves as Allow.** `setEverySite(profileId, true)` on `DappSessionService` (refused unless `profileId` is the active profile; the write runs under the profile-deletion fence), then `resolveInteraction(requestId, { approved: true })`. The interaction result keeps its one field. A write that fails resolves nothing. Turn on always writes, even when the app cancelled its request while the confirm was open: the confirm asks about every site, the window cannot know of a cancellation the worker has not yet sent (Codex r1), and one rule beats two that depend on timing; the cancelled overlay then shows as for any refused Allow. Rejected (Opus r1's option B): carrying `everySite` in the interaction result, which reopens the one-field rule pinned by `dapp-interaction/service.test.ts` and turns a Settings write into a dApp-window protocol field.
- **D7. One confirm object for both callers**, `EVERY_SITE_CONFIRM` in `src/utils/every-site.ts`, passed to `askConfirm` by the page and the window, so the two cannot drift.
- **D8. The Settings row stays in sync through an event.** `onEverySiteChanged` (`{ profileId, on }`) on the service; the page re-reads on it. A popup kept open (Firefox's sidebar, an expanded tab) would otherwise show off while the window turned it on.
- **D9. The glossary `where` lines are an owner ask (OA-3).** Every Glossary row shows a `where` line; the signed pick gives the two terms and definitions only. The lane first settled them on precedent (iface-line-1, copy-polish); Codex r1, Opus r1 and the final Codex pass held that a precedent is not a sign-off, and CLAUDE.md § UI changes agrees. Recommended: both "Connect window", the only screen that dots them, last under Apps as `interface` went. Arc 1 waits for the answer.
- **D10. The tooltip on "discover" keeps opening below**, covering the sentence's second line (the brief's first option). Opening above would need `DottedTerm` to pass `Tooltip`'s `side="top"` for one caller, and would cover the dApp's origin and name, which the person must be able to read.
- **D11. Privacy § 5.7: an owner ask (OA-1).** The brief allows one sentence; Codex r1 read `legal/README.md`'s rule (what leaves the device is material) as a minor bump, against the patch precedent of 1.2.8 and 1.2.9. Both the words and the kind are read by people, so they are the owner's: arc 2 may be built before the answer, its PR stays draft, and it merges only with the answer applied.
- **D12. The footer gains one optional slot under its buttons** (`#below`); the capabilities and execute windows pass nothing and render as today.

## Architecture & Implementation

**Arc 1.** `src/popup/windows/discover/index.vue`: the body becomes the sentence (`discover-scope`, two `DottedTerm`s: `discover` with `position="start"` and testid `discover-term-discover`, `connection-check` with testid `discover-term-check`), `SectionLabel` "If you allow", an `ItemsContainer role="list"` of three `PermissionRow`s with no switch (`extension`, `app`, `eye-off`; testids `discover-fact-presence|next|hidden`), and `discover-remember` (tertiary) naming `chainName` and `DAPP_SESSION_DAYS`, a constant `dapp-session/spec.ts` now exports and `addDappSession` uses for the expiry, so the line cannot state a lifetime the code does not keep. The trust line is removed. Two `GLOSSARY` entries join Apps after `interface` (D9).

**Arc 2.** Interfaces:

```ts
// dapp-session/spec.ts
export const DISCOVERY_POLICY_STORAGE_ROOT = "nulo:core:discoveryPolicy"
export const DiscoveryPolicyRowSchema = z.unknown()      // the class's decoder is the read, as for the counts
getEverySite(): boolean                                    // Methods: the active profile's switch
setEverySite(profileId: string, on: boolean): void         // refused unless profileId is active
onEverySiteChanged: { profileId: string; on: boolean }     // Events
// dapp-session/discovery-policy.ts
export const CHECK_REFUSALS_KEPT = 32
export const DiscoveryPolicySchema = z.object({ everySite: z.literal(true), checkRefused: z.array(z.string()).max(CHECK_REFUSALS_KEPT) }).strict()
class DiscoveryPolicy { allows(profileId, origin); isOn(profileId); set(profileId, on, assertLive); recordCheckRefusal(profileId, origin, assertLive); purgeProfile(profileId) }  // one lock for all
// DappSessionService, not RPC
allowsNewSite(profileId: string, origin: string): Promise<boolean>   // never throws: a failed read is false
```

Control flow with the switch on: `handleDiscovery` (secure origin) → `handleSecureDiscovery` (reset wait, profile or locked queue, Terms, served, session lookup, epoch, remembered session, Terms refusal, dedupe, caps) → `runDiscoveryPopup`: register → `allowsNewSite` → (no window) → freshness → admission spending a token → `persistAndApprove` → key exchange → the emoji check. The window's A4: `askConfirm(EVERY_SITE_CONFIRM)` → `setEverySite(profile.id, true)` → `resolveInteraction({ approved: true })` → close.

**File-level change map.**

| Arc | File | Change |
|---|---|---|
| 1 | `src/popup/windows/discover/index.vue`, `index.test.ts` | the body; tests rewritten for it |
| 1 | `src/utils/glossary.ts`, `glossary.test.ts`; `src/popup/pages/settings/glossary.test.ts` | two entries; the signed table and the page order |
| 1 | `src/wallet/services/dapp-session/{spec,service}.ts` | `DAPP_SESSION_DAYS` (7), used by the expiry and the remember line |
| 2 | `src/wallet/services/dapp-session/{spec,service,client}.ts`, new `discovery-policy.ts` + test, `service.test.ts` | the root, the class, two RPC methods, the event, `allowsNewSite`, the refusal record, the purge |
| 2 | `src/wallet/storage/{stores,stored-shapes}.ts`, `stored-shapes/{goldens.json,snapshot.json,pins.ts}`, `stored-shapes.writers.test.ts` | the store, its shape, generator output, the pin, the writer checks |
| 2 | `tests/e2e/helpers/profile-chaos/checkers.ts` | the family's `FAMILY_GROUPS` entry |
| 2 | `src/wallet/services/wallet-sdk/discovery-flow.ts`; `test-services.ts`; new `background.every-site.test.ts` and `every-site.composition.test.ts`; the hand-rolled `dapp-session` stubs in `background.discovery-race.pins.test.ts`, `background.init-order.pins.test.ts`, `background.verify-reservation.pins.test.ts` | D5; the harness option `everySite`; the flow tests |
| 2 | `src/utils/every-site.ts`, `src/utils/settings-search.ts` (+ test) | the confirm; row `connected-apps-every-site` (section "Connected Apps", testid `privacy-row-every-site`) |
| 2 | `src/popup/pages/settings/connected-apps/index.vue`, `index.test.ts` | the row first, `margin-bottom: 20px`; read, event, confirm, writes |
| 2 | `src/components/composite/DappApprovalFooter.vue` (+ test); `src/popup/windows/discover/index.vue`, `index.test.ts`, `index.lifecycle.test.ts`; `tests/helpers/approval-window-harness.ts` | the slot; the button, its handler, the third client (its connect and disconnect join the pinned order deliberately); the harness's client mock |
| 2 | `tests/e2e/network/connect-every-site.test.ts` | one scenario, with its own connect steps (`connectPlayground` and `approveConnect` wait for a connect window) |
| 2 | `SECURITY.md`, `ARCHITECTURE.md`, `CLAUDE.md` (Never migratable list); `legal/privacy.md` + archive copy + `packages/legal/src/manifest.ts` on OA-1's answer | the docs that state today's behaviour |

**Non-obvious mechanics.** `set(on)` keeps `checkRefused` when already on, else writes `[]`; `set(off)` deletes. `recordCheckRefusal` drops the origin if present, appends it, keeps the last 32, under the class's lock. Lock order: the service's lock, then the policy's; nothing takes them the other way.

## UI impact

- **Connect window body** (arc 1). Before: the scope sentence and the trust line. After: the D sentence with two dotted terms, "If you allow" and the three rows, the remember line naming the app's chain (frame p117-06-d-01). Dotted terms: two, the screen maximum.
- **Settings → Glossary** (arc 1): two rows in Apps; their "where" line as OA-3 answers.
- **Connect window footer** (arc 2): "Allow every site" centred under Deny and Allow (frame p117-07-a4-01); its confirm over the window (a4-02).
- **Settings → Connected Apps** (arc 2): the row first, off at start (frames p118-02-c-01/-02).
- **Behaviour** (arc 2): with the switch on, a new site goes straight to the connection check; its row in Connected Apps reads as after any Allow. No other screen changes.
- **Privacy Policy § 5.7** (arc 2): only on OA-1's answer.
- **Accessibility calls** (the owner's 2026-10-19 delegation): the two dotted terms are Tab stops before Deny and Allow, as `DottedTerm` is everywhere; "Allow every site" is a native button after Allow in the Tab order, with the 2 px accent ring on `:focus-visible`, disabled until Allow is; the confirm traps focus and Escape cancels it, never grants.

## Security & Adversarial Considerations

- **A page and its scripts.** With the switch on, any secure top-level page learns presence and version with no prompt: the signed cost. It still gets nothing else without the emoji check and a grant. It can raise check windows at the reconnect budget's rate (3 tokens per origin, 20 s refill, 2 windows per origin, 8 in all), twins included (D5); after "They don't match" it gets the connect window, where Deny stays silent.
- **No grant from the page.** The interaction result carries only `approved`; the grant is a separate RPC that only extension pages reach, after the person's Turn on. A dApp cannot press the button: the window is an extension page.
- **A storage writer** (a compromised content process on Firefox, local malware). Cannot forge the switch: plaintext rows are off (D3). Can delete the row (off: the safe side) or put back an earlier sealed row of the same profile (back on, or a refusal list without the latest origin): the rollback class of #967, which needs earlier read access to the sealed bytes; the same reopening condition applies, no new limit filed.
- **Locked, switched or restarted worker.** Locked is not keyless: `rowKeys` survive a lock and a switch (`profile/service.ts:331`), so the guard is `setEverySite`'s active-profile check (no active profile while locked) and the deletion fence it writes under (a deletion that overtakes it leaves no row), and `recordCheckRefusal` takes the same fence. A restarted worker has no keys until unlock: reads are off, so the person is asked; the locked queue holds discoveries as before.
- **Logs.** New lines are Info, name the request id only, never an origin or the policy row.
- **Crypto, supply chain.** No new dependency; rows use the existing row seal (`@nulo/wallet-crypto`).

## Phase 1: the connect window explains Allow (arc 1)

1. Rewrite the body of `discover/index.vue` as Architecture says. Keep every existing testid.
2. Add the two glossary entries; update `glossary.test.ts`'s table and sections and the Glossary page test's order.
3. Rewrite `index.test.ts`'s copy test. Feed a wire-shaped payload: `chainId` is `String(chainInfoToChainId(...))` of `0x` + 64-hex `chainInfo` fields, the name a raw `appId`. Assert the whole `textContent` of the sentence, each row and the remember line; assert "Make sure you trust" and "General → Sessions" are absent (a control asserts the remember line present); assert each `DottedTerm` names its key. Cover the chain by the wallet's name, `Aztec:<id>` and "this network".
4. Capture light and dark: the window at rest, the tooltip open on "discover", the Glossary page's Apps group.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-check-window.test.ts` from the repo root (the real window opens, renders and connects; no e2e sweeps its type roles, `type-role-ban.test.ts` checks the source) and `cd apps/extension && bun run test:e2e -- tooltips-glossary --retry=0` (smoke: the Glossary page's order), both green at retry 0, Chrome; `bun run check:plans` after staging. Pass: every command exits 0. Layers: lint, typecheck, unit, component, network e2e (Chrome).

## Phase 2: the switch's storage and service (arc 2)

1. Add the root, `DiscoveryPolicy` and its test. Cases: absent is off (control: a sealed on-row allows); a plaintext on-row is off; a row that does not parse is off; keyless reads off and `set` throws `WalletLockedError`; a refusal while on refuses that origin only, while off writes nothing; the 33rd refusal evicts the oldest, a repeat moves to newest; off then on starts with no refusals; a refusal and an off started together end off (one lock); a write whose fence fails writes nothing; `purgeProfile` deletes. The schema uses `.strict()`, as `src` does.
2. Wire it into `DappSessionService`: the RPC pair, the event, `allowsNewSite`, the refusal record (D4), the purge; both writes pass `deletion.assertCurrent` for the profile, as `admitDappRegistration` does. `service.test.ts`: `setEverySite` refuses a non-active profile id and writes nothing; it emits once on success; a discovery read started from an `onVerificationRefused` listener sees the refused origin (the ordering D4 relies on); a failing record leaves the outcome `revoked`; `purgeForProfile` removes the row; a plaintext on-row stays off after the profile's unlock runs `sealOnRowKeysReady` (control: a sealed on-row allows).
3. Register the store and the shape; run `bun run baseline:storage -- --additive "a new sealed key family: no stored row changes, and an absent row reads as off"`; add the pin it prints; update the writers test; add the `FAMILY_GROUPS` entry.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all` (the snapshot, goldens, census, scan and writers tests, and `apps/extension/scripts/e2e/profile-chaos-model.test.ts`, included). Pass: all exit 0. Layers: lint, typecheck, unit, storage.

## Phase 3: the flow (arc 2)

1. Apply D5 in `discovery-flow.ts`. Add the `everySite` option to `fakeSdkServices`; add `allowsNewSite` to the three hand-rolled stubs.
2. `background.every-site.test.ts`: on, a new site gets no window, a row, an approval, one token spent, and its check at establishment (control: off asks the window); on with stale Terms is refused with no row; a read that throws asks the window; a profile switch during the read refuses with no row; the switch turned off while the connection waits for admission refuses it with no row; a twin of an unpaced connection spends a token, shown by behaviour: with the origin's tokens spent it queues (control: a twin of an Allow is admitted at once); on with an unserved chain shows the notice.
3. `every-site.composition.test.ts` (the real `DappSessionService` with `fakeSdkServices`, as `connect-profile-binding.composition.test.ts`): on, connect, refuse at the check, discover again: the connect window is asked. It proves D4's order across the service and the flow, which the fakes cannot.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`. Pass: all exit 0, the existing `background.*` tests unchanged. Layers: lint, typecheck, unit.

## Phase 4: the Settings row (arc 2)

1. Add `EVERY_SITE_CONFIRM` and the `SETTINGS_ROWS` entry. Build the row on Connected Apps: read on mount (Toggle disabled until read), re-read on `onEverySiteChanged`, on asks `askConfirm` and writes only on Turn on, off writes at once, a failed write opens the shared failure toast and leaves the Toggle as it was.
2. `connected-apps/index.test.ts`: `expectOwnedRows`; each path of step 1 once; the confirm object is `EVERY_SITE_CONFIRM`. `settings-search.test.ts`: "discover" finds the row on Connected Apps.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0. Layers: lint, typecheck, component.

## Phase 5: the window's button, e2e, docs (arc 2)

1. Add the footer slot (+ one test). Add the button and `allowEverySite` to the window; connect the session client in `connectServices` and update the lifecycle test's order. `index.test.ts`: disabled until ready; cancel writes and resolves nothing; Turn on writes, then resolves `{ approved: true }`, in that order, then closes; a failed write resolves nothing; Turn on writes even when `resolveInteraction` then throws `JobCancelledError`, and the cancelled overlay shows.
2. `connect-every-site.test.ts` (Chrome and Firefox): connect, press "Allow every site", the confirm shows in the window, Escape closes it with nothing written, press again, Turn on; the check opens, They match; Settings → Connected Apps shows the Toggle on; disconnect the session; connect again: no connect window, the check opens. It proves what no cheaper layer can: a confirm inside a window, and a row the window's RPC sealed read by the worker on the real page path, on both browsers. Estimate 60-90 s per browser; the PR states it measured.
3. Docs: `SECURITY.md:249` and its sealed-root list, `ARCHITECTURE.md:129,183`, `CLAUDE.md`'s Never-migratable list; the privacy sentence only as OA-1's answer says.
4. Capture light and dark: the window with the button, its confirm, the Connected Apps row off and on, the confirm over it.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `cd packages/legal && bun run test`; from the repo root `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-every-site.test.ts tests/e2e/network/connect-check-window.test.ts tests/e2e/network/connect-deny.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`, green at retry 0; `bun run check:plans` after staging. Layers: all.

## Delivery

- **Arc 1:** after OA-3's answer, branch `discovery-allow-1-a1` off this plan's commit; Phase 1; PR `feat(connect): the connect window says what allow reveals, with two glossary terms`.
- **Arc 2:** `discovery-allow-1-a2` stacked on arc 1; Phases 2-5; its PR stays draft until OA-1 and OA-2 are answered; PR `feat(connect): an opt-in switch lets every site see nulo, off in connected apps`.
- **Close-out:** `discovery-allow-1-close-out` on arc 2, docs only.
- `gh stack submit --auto`, then each body with `gh pr edit`; no label at creation. Neither arc closes an issue (no issue tracks this work). Each body states the per-browser network e2e wall-clock before and after, the captures and the sign-off quotes.
- Parallelism: none; arc 2 edits the window file arc 1 rewrites.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 4d6bce025, with these values:
- **Review loop, per arc at its boundary:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, over the arc's diff; one Opus `general-purpose` review beside the first round; hard stop at three rounds, then report. Then a fresh Codex session over the net diff from 4d6bce025 for cross-arc issues.
- **Delivery:** as above; `gh pr checks <n> --watch` to the end.
- **Close-out:** the stack's top layer; merge `origin/dev` first and read `index.md` and `lessons.md`.
- **Teardown:** after the merge, `agent-worktree done discovery-allow-1 --merged`.
- **Approval boundaries:** any string beyond the `UI impact` lines is a new owner ask; a finding that adds state, a lifecycle, a protocol, a recovery policy or a public contract stops for approval.

## Audit verdicts

**Round 1** (2026-11-06; both legs saw outlines A and B, the recon and the four asks; consult log in [lessons/phase-0.md](lessons/phase-0.md)).
- **Codex (gpt-6.1-sol, high): conditional approve** (surface unsigned copy; settle the refusal and cancellation guarantees; retry-0 gates). Findings: D4's guarantee is bounded (eviction, a failed write); D6 cannot see a worker-side cancellation before its write; locked is not keyless; D9 and D11 unsigned (D11 material by `legal/README.md`); network gates default to two retries; I2's timing and D10's capability claim misstated. A beats B on every point.
- **Opus 5.5 (Plan): conditional approve.** Beyond Codex's: D4 reversed the documented "channels end first" order; the discover window has no e2e type-role sweep and `type-roles.test.ts` never visits Connected Apps; every discovering site gets a stored row with no tap (the list grows); the D4 rule was not quoted; Fact 3's line; the harness and lifecycle pins; a plaintext row after unlock; the twin's token proved by behaviour; `.strict()` over `z.strictObject`.
- **Accepted:** D4's limits stated (one closed `known-limit` at close-out); D6 = Turn on always writes; the deletion fence and the active-profile check as the guards; `NULO_E2E_RETRY=0` on every network run; I2, D10, Fact 3 corrected; D4 emits first and starts the record before any await; the sweep claims dropped; the change map, the tests and the schema style; the guard quoted from page 116; OA-1 (privacy) and OA-2 (row growth) to the owner, arc 2 only.
- **Rejected:** D9 as an owner ask (reason in D9); Opus's option B for D6 (reason in D6).

**Final fresh Codex pass** (new session, the consolidated plan and ledger): **conditional approve.** (1) D9's precedent is not a sign-off: accepted, now OA-3, and arc 1's auto-continue precondition is not met. (2) Two test lines contradicted D4 and D6: rewritten. (3) A connection queued behind admission could complete after the switch is turned off: accepted as a local fix (D5's re-check; no new state). (4) OA-1 and OA-2 were defaults posing as asks: they now gate arc 2's merge, not its build. It confirmed D4's ordering against `Lock`'s FIFO, the rejection of D6 option B, the sealed-only reads and the runner wiring.
- **Resumed twice (verify only):** one stale D11 sentence ("ships without the edit") contradicted the merge gate; rewritten. **Verdict: approve** (high confidence). Arc 1's auto-continue precondition is not met while OA-3 is open.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-5 of implementations-plan/discovery-allow-1/plan.md ✓, each gate passing in the transcript; each arc's Codex loop and the cross-arc pass converged (a resumed pass with no new material finding quoted); the stack's PRs open against `dev`; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/discovery-allow-1 forward per its plan: reality check, next phase, its gate, the arc's review loop, the PR, the close-out; never idle.
