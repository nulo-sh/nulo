---
plan: fee-juice-link-1
tier: light
status: delivered (one PR against dev, merge pending)
issues: "#77 (closes), #1806 (part of: its Privacy half)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon inline (a handful of greps, no Explore agent); no plan audit round; one Codex gpt-6.1-sol high read-only pass over plan and net diff after the build (lane brief, Proportion)
base: origin/dev at b8ec26b1f
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-19.
- **Status:** delivered. One PR against `dev` carries the change and this close-out; it merges on the orchestrator's word, after the owner answers OA-1.
- **Owner sign-off:** the two quotes of 2026-11-18 (Fact 1), for where Mainnet's links lead. Nothing a person sees changes otherwise.
- **Shipped:** `feeJuiceBridgeUrl(chainId)` in `fee-helpers.ts` (Mainnet → `https://shield.human.tech/fee-juice`, every other chain → `https://testnet.app.unleashed.systems`, a build override wins everywhere), read by the fee card's two links, Send's publish line and footer, and Home's Get started row; per-site tests on Mainnet and Testnet, red on the base for Mainnet; privacy 1.4 (§ 5.10 names Shield on Alpha and the links' real words), its archive, manifest entry and `BEFORE-LAUNCH.md` § 4 block; `CLAUDE.md` § The wallet repo. Closes #77; part of #1806 (its Privacy half).
- **Dispositions:** D1 keys on the wallet chain id; Shield's own bundle names the same chain and PrivateFPC (lessons/phase-1.md). D2 keeps the override global. #1806's Terms half (§ 8's lower-case "fee juice") stays open, outside this lane.
- **Known limits:** none.
- **Open items:** #1871 (Mainnet's links move to Unleashed once it is deployed on Alpha); the privacy 1.4 dates, `BEFORE-LAUNCH.md` § 4 ("Due at the release that publishes privacy 1.4").
- **Lessons:** none promoted; the one slip is already in `lessons.md` (Agent tooling).
- **Seeds retired:** the `/goal` and `/loop` seeds below; never run them.

# fee-juice-link-1: Mainnet's fee juice links open Shield

On Mainnet (the seeded network named Alpha), every "Get Fee Juice" and "Get private Fee Juice" link opens `https://shield.human.tech/fee-juice`. On every other network it opens Unleashed's testnet app, as today. One pure selector picks the destination; five sites use it; § 5.10 of the Privacy Policy and two live docs state the new rule. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless they name another root.

## The issue, checked (#77)

**Demonstrated.** Initial conditions: Mainnet is the active network, or an execute window's operation is on Mainnet, and the account holds no Fee Juice (or no private Fee Juice). Event: the person follows a fee juice link. The code: every site opens the one constant `FEE_JUICE_BRIDGE_URL` (`popup/components/modules/send/fee-helpers.ts:342-343`), so the link ignores the network. Invariant broken: the link opens an application that funds the network the person is on. Consequence: a Mainnet person lands on a testnet app that cannot fund their account.

Claims that did not hold: #77's `Where` names `fee-helpers.ts:318-319` and `FeeSettingsCard.vue:940`; at the base they are `fee-helpers.ts:338-343` and `FeeSettingsCard.vue:514, 604`. Of the lane brief's tests "naming it", `windows/network-unavailable/index.test.ts` and `wallet/services/fpc/protocol-fpcs.test.ts` name Unleashed only in passing, not the URL. The brief's site list misses nothing, but its `send.vue:120` site is the Send footer's CTA button (testid `send-get-fee-juice`).

## Outcome & Quality Bar

- **For whom:** a person on Mainnet whose account cannot pay a fee, on Send, in a dApp's transaction window or on Home.
- **Excellent:** every fee juice link on a Mainnet screen opens Shield, and every link on any other screen opens what it opens today. A screen whose network changes while open follows the new network. The URL carries no wallet data, and the link opens with `noopener` and `noreferrer`.
- **Good enough:** no new link, word, place or style. The selector keys on chain identity only.

## Assumptions

**Facts** (verified at `b8ec26b1f`; detail in recon)
1. The owner, 2026-11-18, verbatim: "one quick thing: on Nulo on Mainnet, if the user needs fee juice we should direct him at: https://shield.human.tech/fee-juice and to Unleashed on testnet, until Unleashed is deployed on Alpha." And: "Actually, Shield uses the same private fee juice we use. So we should direct them to shield too /fee-juice too."
2. Five sites open the constant: `FeeSettingsCard.vue:514` (`send-fee-sheet-warning-bridge`) and `:604` (`send-fee-get-juice`), `components/composite/send/PublishLine.vue:35` (`send-fee-warning-bridge`, through `popup/pages/send.vue:1142`'s `:bridgeUrl`), `send.vue:120` (`send-get-fee-juice`, `window.open`), `popup/pages/general.vue:121` (`get-started-feeJuice`, `window.open`). `git grep` finds no other reader.
3. Each site holds the network its screen is on: `FeeSettingsCard` its `network` prop (`appStore.network` on Send and the two authwit popups; `op.network`, the operation's network, in `windows/execute/OperationCard.vue:460`); `send.vue` and `general.vue` `appStore.network`.
4. The popup keys every per-chain fact on the wallet chain id: the explorer base URLs (`wallet/constants/explorers.ts:41-46`), the chain name "Alpha" (`components/ui/utils.ts:30-41`) and the sponsored FPC allow-list (`wallet/services/fpc/sponsored-fpc-chains.ts`). `CHAIN_IDS.MAINNET` is `walletChainId(1, MAINNET_ROLLUP_VERSION)` (`utils/chain-ids.ts:34-38`); the Local Network is 0.
5. `VITE_FEE_JUICE_BRIDGE_URL` is one of the two `VITE_*` names `_build-extension.yml` lets into a build. No workflow or script sets it.
6. `https://shield.human.tech/fee-juice` answers 200; the page calls Shield "human.tech's programmable privacy bridge". Shield's FAQ (`support.shield.human.tech/faq`): "Shield is live on Ethereum and Aztec mainnet (Aztec v6.0.0)".
7. Privacy § 5.10 (1.3.1) says the links open Unleashed, "The link is the same on every network", and Cloudflare hosts it. Its heading names "Get private gas", which no screen shows (#1806). Privacy 1.1 (naming the site these links open) and 1.3 ("a new recipient", `BEFORE-LAUNCH.md` § 4) were material.

**Inferences:** I1. Shield funds the canonical Mainnet rollup, the one `CHAIN_IDS.MAINNET` names, so the exact wallet chain id is the right key (D1). I2. A privacy version marks no re-acceptance; Settings → About's notice shows for any newer version, patch or not (`utils/legal-about.ts:13-20`), so materiality here is a record, not a behaviour.

**Asks:** OA-1, the version's materiality: the plan ships 1.4, material, on Fact 7's precedent; the orchestrator takes it to the owner before landing (lane brief).

## Decisions

- **D1. The selector**, in `fee-helpers.ts`: `feeJuiceBridgeUrl(chainId: number | undefined): string`. It returns the build override when set; else Shield's URL when `chainId === CHAIN_IDS.MAINNET`; else Unleashed's testnet URL. Keyed on the wallet chain id as every per-chain popup fact is (Fact 4). Rejected: `l1ChainId === MAINNET_L1_CHAIN_ID`, the derivation and reset trust root, which also matches any rollup on Ethereum mainnet, not only the one Shield serves; the network's `kind`, name or RPC URL (the brief bans them). An unknown network (`undefined`) gets Unleashed, today's link.
- **D2. The override** keeps today's meaning: when set, it is the destination on every network, Mainnet included, as it is today. A build that sets it names the one bridge it wants; the shipped builds never set it (Fact 5), so they open Shield on Mainnet. The selector reads `import.meta.env` per call, so a test can stub it. Rejected: the override replaces only the Unleashed side (it would change what a build that sets it does on Mainnet).
- **D3. The sites.** `FeeSettingsCard` computes `feeJuiceUrl` from `props.network?.chainId` for both its links. `send.vue` computes it from `appStore.network?.chainId` for `PublishLine`'s `bridgeUrl` and the CTA. `general.vue` calls the selector at click time. Every site keeps its `target`, `rel` or `window.open` features. The constant `FEE_JUICE_BRIDGE_URL` goes; the two URLs stay module-private.
- **D4. Tests.** `fee-helpers.test.ts`: one table (Mainnet → Shield; Testnet, Local Network 0, a custom chain and `undefined` → Unleashed), plus the override row on Mainnet and Testnet (`vi.stubEnv`). Per site, a Mainnet screen opens Shield and a Testnet one Unleashed: `FeeSettingsCard.test.ts` (both links, and a `network` prop change on a mounted card), `send.test.ts` (the publish line's link and the CTA's `window.open`), `general.test.ts` (Get started's Fee Juice row). Tests assert literal URLs. No e2e is added: no spec reads an `href`, and jsdom proves an attribute.
- **D5. Privacy 1.4**, material (OA-1): archive 1.3.1 as `legal/archive/privacy-1.3.1.md`; § 5.10 retitled with the links' words and rewritten (recon § The text); version line, history row and `@nulo/legal` manifest entry (`effective: null`); a `BEFORE-LAUNCH.md` § 4 block like 1.3.1's.
- **D6. Docs.** `CLAUDE.md` § The wallet repo and the selector's TSDoc state the rule in one sentence each. A `blocked:external` issue names the selector as the one line to change once Unleashed is deployed on Alpha.

## Architecture & Implementation

| File | Change |
|---|---|
| `popup/components/modules/send/fee-helpers.ts` (+ test) | D1, D2; the constant goes |
| `popup/components/modules/send/FeeSettingsCard.vue` (+ test) | D3: one computed, two bindings |
| `popup/pages/send.vue` (+ `send.test.ts`) | D3: one computed for `bridgeUrl` and the CTA |
| `popup/pages/general.vue` (+ `general.test.ts`) | D3: the click reads the selector |
| `legal/privacy.md`, `legal/archive/privacy-1.3.1.md`, `packages/legal/src/manifest.ts`, `BEFORE-LAUNCH.md` | D5 |
| `CLAUDE.md` | D6 |

`PublishLine.vue` keeps its `bridgeUrl` prop. Simpler alternative considered: a per-network map in `explorers.ts`'s style (rejected: two destinations, one test, so a conditional reads clearer than a table).

## UI impact

None visible: every link keeps its words, place, style and testid. Only where Mainnet's links lead changes, as the owner signed (Fact 1, both quotes, which are this change's sign-off): "one quick thing: on Nulo on Mainnet, if the user needs fee juice we should direct him at: https://shield.human.tech/fee-juice and to Unleashed on testnet, until Unleashed is deployed on Alpha." and "Actually, Shield uses the same private fee juice we use. So we should direct them to shield too /fee-juice too." No captures: no screen changes.

## Security & Adversarial Considerations

- **Boundary:** a dApp picks the operation's network, and the execute window's card follows `op.network`, so a dApp can choose which of two fixed URLs the link opens, nothing more. No URL is built from input; the override is build-time only and the CI build refuses every other `VITE_*`.
- **Egress:** the link carries no address or state; `noopener` and `noreferrer` stay, so Shield sees an ordinary visit with no referrer. Shield is a third party: § 5.10 says so.
- **What we trust:** Shield's URL and its Mainnet scope (Fact 6), read from its own pages. Nothing changes a permission, a log line, storage, a message, a dependency or the CSP. Known limits: none.

## Phase 1: the selector, its sites, the text, the gates

Warning: change no link's words, testid, class or attributes other than its URL.
1. Make D1-D3 with D4's tests. Commit.
2. Make D5 and D6. Commit.
3. Run the gate. Record each command's outcome in `STATUS.md`.

**Gate**, at retry 0, in order, one at a time:
1. `bun run lint`; `bun run typecheck:all`.
2. From `apps/extension`: `bun --bun vitest run src/popup/components/modules/send/fee-helpers.test.ts src/popup/components/modules/send/FeeSettingsCard.test.ts src/popup/pages/send.test.ts src/popup/pages/general.test.ts src/components/composite/send/PublishLine.test.ts`.
3. `bun run --cwd packages/legal test`; `bun run --cwd apps/landing test` (it renders the archived versions).
4. `bun run check:plans` after staging.
5. Smoke, the specs that read the five testids (`git grep` under `tests/e2e`): `send-fee-privacy.test.ts` (`send-get-fee-juice`), `security-backup.test.ts` and `stale-network.test.ts` (`get-started-feeJuice`). The other readers (`network/fee-methods.test.ts`, `network/hero-prices-unavailable.test.ts`) are network specs, left to CI's required network lanes. From `apps/extension`: build armed, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_EXECUTE_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/send-fee-privacy.test.ts tests/e2e/security-backup.test.ts tests/e2e/stale-network.test.ts --retry=0`; then `build:firefox` the same way and the same run with `NULO_E2E_BROWSER=firefox`.

Pass: every command exits 0; each new site test is red on the base `.vue` (`git checkout b8ec26b1f -- <file>`, run, `git checkout HEAD -- <file>`); the counts per smoke run go in the PR body. Layers: lint, typecheck, unit, component, smoke e2e.

## Delivery

- Branch `fee-juice-link-1-a1` off this plan's commit (off `origin/dev`). One PR against `dev`, ready, no label at creation: `feat(fees): mainnet's fee juice links open shield until unleashed is on alpha` (79 characters). Body: both owner quotes as the sign-off; each site and how it picks its URL; "Nothing a person sees changes: the links keep their words, places and looks."; § 5.10 before and after; the version decision (OA-1, material, for the owner before landing); the follow-up issue; the gates with counts; the Codex verdict; `Closes #77`, `Part of #1806`; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. A comment on #1806 says its Terms half stays open.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `b8ec26b1f`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 is the bounded-work form: ONE pass, `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, over this plan and `git diff origin/dev...HEAD`, with the standard's inputs and both verbatim rules, and asked: can any site still open the wrong network's destination, a screen whose network changes while open included; does the URL leak anything; is § 5.10 true and is its version right. Then targeted verification of each material fix; a second round only on a finding. Prompts go under `~/.cache/nulo-backlog/fee-juice-link-1/`. No Opus pass (lane brief).
- Approval boundary (a plan change; stop): a change to a link's words, place, style or testid; a new link, notice or network; any stored shape, permission or dependency.
- Close-out, as the PR's final commits: merge `origin/dev` and read `index.md` and `lessons.md`; the Outcome; the follow-up issue on its `Open items:` line; `STATUS.md` deleted; `git mv` into `archive/`, the index line moved to `archive/index.md`; `bun run check:plans`. Merging and teardown (`agent-worktree done fee-juice-link-1 --merged`, trunk `dev`) are the orchestrator's.

## Seeds

- `/goal`: "Implement implementations-plan/fee-juice-link-1/plan.md Phase 1 to its gate, then its Post-implementation and Delivery."
- `/loop`: "Babysit fee-juice-link-1's PR: on a red required check, read it, rerun a known flake once, fix real breakage."

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan | none (lane brief: no plan audit round) | n/a | n/a | n/a |
| plan + diff | Codex, gpt-6.1-sol high read-only (session 01a1f440) | approve | the selector's TSDoc cut to the rule and the override's scope; `send.vue`'s narrating comment removed | none |
