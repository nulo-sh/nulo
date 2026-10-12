# Recon: followups-6

Base: `origin/dev` at 58d6cbc. Two sonnet Explore agents (a smoke-spec sweep for #317, a reuse sweep for both issues), plus the planner's own reads. Paths are repo-relative; `E2E` is `apps/extension/tests/e2e`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Refuse and record every outside host for a smoke browser | `E2E/fixtures/egress-guard.ts` (`startEgressGuard`, `ownGuardedLaunch`, `closeAfterEgressCheck`, `egressFailure`), armed from `E2E/global-setup-smoke.ts:72` through `inject("egressGuard")` at `E2E/fixtures/extension.ts:101` | reuse as is |
| Route a browser to the guard | Chrome `egressGuardArgs` (`E2E/fixtures/browser/chrome.ts:36-40`); Firefox `egressGuardPrefs` (`E2E/fixtures/browser/firefox.ts:269-280`); option `LaunchOptions["egress"] = { guardPort }` (`E2E/fixtures/browser/index.ts:17-18`) | adapt: carry the hosts that go direct |
| One outside host sent direct (live) while the rest go to the guard | none. Only loopback goes direct today. Searched `DIRECT`, `direct`, `bypass`, `ownHosts`, `OWN_HOSTS` in both drivers, read `index.ts` and `egress-guard.ts` in full | build new, inside the two routing functions above |
| A host list with a reason per host | `DECLARED_REFUSALS` (`egress-guard.ts:57-66`), `CHROME_OWN_HOSTS` (`chrome.ts:228`), `FIREFOX_OWN_HOSTS` (`firefox.ts:754`) | reuse the pattern (`ReadonlyMap<host, why>`, exact names) |
| Answer the Testnet node with a terminal error | `startNodeStub` / `holdNodeStub` (`E2E/fixtures/node-stub.ts`), armed by `ownGuardedLaunch` after the canary (`egress-guard.ts:358-377`) | reuse as is |
| A spec holds the node itself from before the profile exists | the fee-picker test (`E2E/send-keyboard.test.ts:169-211`): `freshExtensionPerTest`, `startNodeStub()` + `interceptRpc(..., { kind: "redirect", to: stub.url })`, then `registerProfile` | reuse the shape |
| A spec's interception on an origin the launch holds | `E2E/fixtures/browser/standing-interception.ts:113-115`: it suspends the launch's hold and re-arms it on `stop()`; on an unheld origin it arms directly | reuse as is |
| Interception that works whether the node's host is direct or proxied | Chrome: CDP `Fetch.enable` at request stage (`chrome-rpc-intercept.ts:60-103`); Firefox: `http-on-modify-request` observer with `redirectTo`/`cancel` (`firefox-rpc-intercept.ts:44-51`). Both act before the connection is chosen (read off the mechanism, not observed) | reuse as is |
| Unit tests of the routing | `apps/extension/scripts/e2e/chrome-driver.test.ts:4-21`, `firefox-driver.test.ts:26-54` (both pin "cannot be both behind the egress guard and an artifact run"), `scripts/e2e/egress-guard.test.ts` (`undeclared`, `proxyTarget`, `ownGuardedLaunch`); they run in `apps/extension`'s `vitest.config.ts` (`scripts/**/*.test.ts`) | adapt |
| Local release-shaped artifact smoke | `.claude/skills/e2e-testing/SKILL.md:698-702` (no `VITE_*`, copy `dist/<browser>` to a non-prefixing path, `NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=<copy>`, no migration or CSP flags) | reuse as is |
| Pin a logged payload | `#301` pins the raw argument after `message` on a spy (`packages/aztec-runtime/src/pxe/service.test.ts` around `:345-360`); `#300` pins `LoggerStore`'s buffered `data[1]` after `trim` (`apps/extension/tests/helpers/logged.ts`, `loggedAfter`) | adapt: a spy `Logger` in `opfs-store.test.ts` (see § #315 below for why not `loggedAfter`) |
| Error projection | `trim` → `projectError` (`apps/extension/src/wallet/logger/utils.ts:112`, `{ name, message }`, message URL-scrubbed and capped at 200, no stack) | reachable on this path, but the projected message would still quote the stored stamp (§ #315) |

## #317: what the sweep found

**Modes today.** Guarded (source build): every outside host goes to the guard; the launch holds the Testnet node with the 400 stand-in from settle. Artifact (`NULO_E2E_ARTIFACT_RUN=1`): no guard, no stand-in; Chrome maps `api.coingecko.com` to `127.0.0.1:1` (`chrome.ts:51`), Firefox sends it to a dead PAC proxy (`firefox.ts:247-248`). The production bundle seeds the shipped Testnet tokens on every profile through the live node. Both drivers throw when asked for both (`chrome.ts:49`, `firefox.ts:293`).

**Callers.** Only `nightly.yml:341,429` and `release.yml:395,406` reach artifact mode, all through `artifact_name` in `_extension-smoke-e2e.yml:62`. No workflow passes `extension_path`. `test:e2e:all` uses the network `global-setup.ts`, which provides no `egressGuard`; nothing else sets `NULO_E2E_ARTIFACT_RUN`.

**Specs whose premise is "no node answers":**

| Spec | Arms | Holds before the profile? | Note |
|---|---|---|---|
| `send-keyboard.test.ts` fee picker | stub redirect `:175-177`, then `registerProfile` `:179` | yes (#318) | the model |
| `send-fee-privacy.test.ts` | `interceptRpc(refuse)` at `:36`, inside the test, after `registeredExtensionPerTest` registered | **no** | the issue's claim holds. In an artifact run, registration, the seed pass and Home's first reads reach the live node before the refusal |
| `contacts-import.test.ts` | `refuseTestnet` (`helpers/contacts.ts:37`) inside `onContacts` (`:70`), after registration; the last test also after `registerProfile(fresh)` (`:352-354`) | **no** | header `:5-6` says "The Testnet RPC is refused throughout", true only in guarded runs. The sweep did not name it a node-absence dependency by its assertions; see plan Inference I3 |
| `egress-guard.test.ts` | reads `ctx.egress.node` at `:191` and expects the stand-in's `status 400` at `:197` | n/a | skips in artifact runs today (`:137`); would throw at `:192` if the guard were armed with no stand-in |

**Node-tolerant or node-indifferent (no change):** `rows.test.ts` and `home-links.test.ts` wait for the seeds to settle (a failed seed settles, `rows.test.ts:44-48`); `fiat-display.test.ts` needs only the price host unreachable; `endpoints`, `sw-restart-network`, `settings-crud` and the rest classified (c). Watched, not changed: the four `priced` tests in `send-keyboard.test.ts` (seed token row id 1 beside live seeds) and `tooltips-glossary.test.ts:142-143` (a Tab walk on Home); both ran green in every artifact run of the archived e2e-followups-4 plan (`lessons/phase-1.md:31`, `lessons/phase-3.md:19`).

**The "documented live leg" is not a spec.** No smoke spec asserts that the shipped list resolves: the README's leg (`E2E/README.md:59`, `global-setup-smoke.ts:71`) is every artifact profile's seed pass, and a seed that ends failed still settles. Search trail: `token-seed-row|tokens-card|tokens-list|data-settled|TESTNET_TOKENS|default-tokens|waitForSettledTokens|tokens-empty` and `USDC|USDT|EURC|GBPC|seedsForChain|DEFAULT_TOKEN_SEEDS|expectedSymbol` over `E2E` outside `network/`; hits are settle waits, comments and the sandbox seed only.

**Price host, 403 versus refused.** `src/wallet/services/price/service.ts` takes one catch for both (`:330-372`: one fetch, 10 s abort, backoff, `readUsable()`); a refused CONNECT is a tunnel failure, so `fetch` rejects on both. No spec reads the difference.

**Docs that state the current rule:** `E2E/README.md:59,71`, `E2E/FIREFOX.md:69`, `.claude/skills/e2e-testing/SKILL.md:155-167,190`.

## #315: what the reads found

- The claim holds: `packages/aztec-runtime/src/pxe/opfs-store.ts:201-225` builds `mismatch`, assigns `` `stamp failed to parse (${errorMessageFromUnknown(err)})` `` on the parse branch, logs `{ detail: mismatch }` and throws `PxeStoreVersionMismatch` with the same text.
- **The parser's message quotes the stored stamp.** `DatabaseVersion.fromBuffer` (`@aztec-labs/stdlib` 6.0.0-rc.1, `dest/database-version/database_version.js`) runs `jsonParseWithSchema` and rethrows `Failed to deserialize version information: ${err}`. Measured on Bun: `... SyntaxError: JSON Parse error: Unexpected identifier "not"`; V8 quotes up to ten characters of the input.
- **How the log line reaches the redactor.** `log` is Aztec's `Logger` (`chain-runtime.ts:194`, `createLogger("pxe:data", { actor })`). Its `warn(msg, data)` calls `pino.warn(processLogData(data), msg)` (`@aztec-labs/foundation/dest/log/pino-logger.js:52`). Pino's browser build reads `browser.formatters` (`pino@9.14.0/browser.js:113`), which Aztec leaves unset (it sets top-level `formatters` and `browser: { asObject: false }`, `pino-logger.js:140-143,263-268`), so the console gets `[bindings, data, msg]` with `data` intact. The offscreen console sniffer (loaded first in `src/offscreen/index.html:7`) forwards that to `LoggerStore`, whose `trim` would project an `Error` under `error` to `{ name, message }`. Corrected in audit round 1: the planner's first reading (the formatter path merging everything through `convertBigintsToStrings`, which does turn an `Error` into `{}` when called directly) measured a path the browser build never takes (Codex, reproduced).
- **Where the thrown message surfaces.** No product code matches `PxeStoreVersionMismatch` (its flag has no readers). It propagates from `openChainStore` through `createChainRuntime` (`chain-runtime.ts:170-200`) into the op that needed the runtime: `PxeService.logOpFailure` logs it at `error` as `{ error: err }` through Nulo's logger (`service.ts:1000-1008`), where `trim` projects it (message capped at 200); a dApp gets the constant `UNCLASSIFIED_ERROR_MESSAGE` (`src/wallet/services/wallet-sdk/error-envelope.ts:194-210`); a popup can show it: traced in audit round 1 as `token/service.ts:587,636-638` → `extension-messaging/src/core/error-response.ts:29-34` (the transport keeps `getErrorMessage(error)`) → `NewTokenPopup.vue:256,332-336`.
- `log-payload-ban.test.ts:19-31` names this false negative: a flattener's result bound to a local first.

## Open work and collisions

- `gh pr list --state open`: #271 (`worktree-tokens-and-balances`, draft, token store and balances). No file overlap with this lane.
- `implementations-plan/chain-endpoints/` is still active (arc 2 waits on page 12: node-URL characters, the extension CSP, the price hero). Its CSP narrowing would bear on the canary, which arc 2a already accounts for; this lane changes no CSP. Its D4 / Ask A1 kept artifact runs unguarded; #317 is the follow-up it named.
- Out of this lane: #316 and #310 (`owner-decision`), #294, #290, #262, #277.
