# Phase 0: planning consults

Every consult of the planning run, with its verdict. Transcripts stay local (`audit-*.md`, gitignored); this file and `plan.md` § Audit verdicts are the record.

## Recon (2026-10-10)

Three Sonnet Explore agents: outbound hosts; the smoke harness and CI; arc-2 surfaces and issue claims. Findings in `recon.md`.

## Chrome proxy probe (2026-10-10)

A throwaway script (outside the repo) launched the worktree's Puppeteer Chrome headless with `--proxy-server=http://127.0.0.1:<guard>` and `--proxy-bypass-list=localhost;127.0.0.1;[::1]`, a guard that answers `CONNECT` and absolute-form requests with 403, and a loopback target server. The host has internet (`curl https://example.com` → 200).

- Remote HTTPS and remote plain HTTP from a page: refused; the guard recorded `CONNECT host:443` and the absolute URL (path and query included, so the guard must store the host only).
- `http://127.0.0.1:<port>` and `http://localhost:<port>`: direct, body received (plan F16).
- Guard stopped, then a `no-cors` fetch of `https://example.com/`: rejected, so Chrome did not fall back to a direct connection (plan F16).
- Chrome's own traffic reached the guard within 15 s of an idle page, with Puppeteer's default flags and again with `--disable-component-update --no-pings --disable-domain-reliability` and several `--disable-features`: `clients2.google.com`, `update.googleapis.com`, `accounts.google.com`, `www.google.com`, `android.clients.google.com`. Today's smoke runs reach these Google hosts for real. The draft's assumption of "few or no background requests" does not hold on Chrome; the plan's enforcement must not depend on a per-host list of browser traffic.

## Chrome CSP probe (2026-10-10)

Same Chrome, a loopback page served with `style-src 'self' 'sha256-<hash of one rule>'`. A sheet built with `new CSSStyleSheet()` + `replaceSync` and adopted into a shadow root applied with no violation (plan F17). A shadow-root `<style>` whose text matched the hash applied (plan F17). A shadow-root `<style>` with other text and a `<style>` appended to `document.head` were both blocked (`style-src-elem`), which is what CodeMirror's document-level `<style>` would meet without `'unsafe-inline'`. Firefox is untested; phase 2b's first step probes it (plan I6).

## Round 1, Codex (gpt-6.1-sol, high, read-only), 2026-10-10

Session `01a123a9-07df-7aa1-be57-23cf41e2129d`. Verdict: **reject** (vacuous fail-closed proof, teardown gaps, artifact-control incompatibility, saved-endpoint bootstrap failure). Fourteen findings; the planner checked findings 1, 2, 6 and 10 against the tree and each holds. Dispositions in `plan.md` § Audit verdicts.

## Round 1, Opus Plan agent (same family, read-only), 2026-10-10

Verdict: **conditional approve** (close Firefox's direct fail-over and replace the `.invalid` proof; keep the egress check out of the CSP latch; skip the control spec where no guard is armed; keep `bun run dev` working; re-cut arc 2 around R3 and R5; move the hero's edge states to OWNER-ASKS.md). The two audits converged on the same blocking set from different angles; Opus added the Firefox `network.proxy.failover_direct` pref, the RST-triggers-fail-over point, the `DataViewerPopup` consumer and the dev-mode CSP risk. One disagreement: Opus expected Chrome to stay quiet and Firefox to be noisy; the Chrome probe shows Chrome is noisy, so the vendor-domain rule (D18) covers both browsers. Dispositions in `plan.md` § Audit verdicts.

## Plan v2 (2026-10-10)

Folded both round-1 audits: node:net guard with a per-launch loopback canary, `closeAfterEgressCheck` independent of the CSP latch, the `guardArmed` skip rule, vendor-domain rule for browser traffic, three retry-0 runs per browser, artifact-mode validation, `--retry=0` on every network gate, arc 2 split into 2a/2b/2c (D10), D11 widened to the service's node-factory refusal. OWNER-ASKS: OA-5 rewritten (backups carry no network rows), OA-7 added. Recon citations corrected.

## Banner-in-jsdom probe (2026-10-10)

A throwaway Node script (outside the repo) set jsdom's globals, imported `@alejoamiras/presto-banners/register`, and appended a `<presto-banner variant="tile" fonts="none">`. With no `variant` or a non-tile variant and no handled `state`, the element paints nothing (empty shadow root). With `variant="tile"` it paints one `<style>` of 15,120 characters, hashable with `node:crypto`. The stylesheet is a module constant (`dist/styles.js:22`, not in the package's `exports`), so every variant and theme paints the same text and one hash covers the onboarding card (`variant="card" state="offline"`). Arc 2b's banner-hash test is feasible as written.

## Canary routing probes, Chrome and Firefox (2026-10-10)

Throwaway scripts (outside the repo): a `node:net` guard answering 403 then `end()`, a counting loopback canary, and the repo's Puppeteer browsers; each case fetched `http://` and `https://egress-canary.test:<canaryPort>/`.

- **Chrome, the draft's rules** `MAP egress-canary.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost`: the guard recorded nothing at all, because `MAP *` also captures the proxy's own `127.0.0.1` (an IP literal), so every proxied request failed before reaching it. The per-launch canary check would have caught this (the guard must record the canary), but direct loopback (`127.0.0.1` services) would have broken too.
- **Chrome, fixed rules** `MAP egress-canary.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1` (unbracketed; `EXCLUDE [::1]` does not match): routed → the guard records `GET http://egress-canary.test:<p>/` and `CONNECT egress-canary.test:<p>`, canary 0; guard stopped → canary 0; proxy flags removed → canary counts 3. `127.0.0.1`, `localhost` and `[::1]` reach a loopback server directly. A `wss://` WebSocket reaches the guard as `CONNECT`.
- **Firefox** (Puppeteer BiDi, prefs `network.proxy.type: 2`, `network.proxy.autoconfig_url` = `data:` PAC with `DIRECT` only for loopback, `network.dns.localDomains: "egress-canary.test"`, `network.proxy.failover_direct: false`): routed → the guard records the canary, canary 0; guard stopped → canary 0, also with `failover_direct` left at its default; prefs removed → canary counts 2. Loopback goes direct. Firefox's own traffic reached the guard about 45 times in a few seconds, all under `mozilla.com` / `mozilla.net` (remote settings, content signatures), retried after each 403.
- **Consequence:** an append-only record capped at 1,000 entries would overflow on a long Firefox launch. The guard keeps a count per `host:port` instead, capped on distinct pairs.
- **Firefox, the repo's PAC form:** a `data:text/javascript,<encoded PAC>` URL (the form `PRICE_HOST_BLACKHOLE` uses) routes the same way when set through `network.proxy.autoconfig_url`. Geckodriver's W3C `proxy` capability sets these same prefs, but this probe did not drive geckodriver; the per-launch canary is what proves the driver's path on every run.

## Link-local probe (2026-10-10, after Codex round 2 raised it)

Chrome bypasses a configured proxy for link-local addresses whatever the bypass list says. With only the proxy flags, `fetch("https://169.254.77.77/")` and `http://169.254.77.78/` sent SYNs directly (`ss -tn state syn-sent`), and the guard saw nothing. With the plan's resolver rules (`MAP * ~NOTFOUND` plus the loopback excludes) no SYN left and the guard still saw nothing: denied, not recorded. Firefox's PAC sends `169.254.77.77`, `169.254.77.78` and `[fe80::1]` to the guard, which records them.

## Round 2, Codex (resumed session), 2026-10-10

Verdict: **reject** (Chrome direct bypasses, incomplete fail-closed proof, launch cleanup gaps). Nine findings; round-1 findings 1, 2, 5, 7, 9, 10 and 13 marked closed. The planner verified findings 3 (`launchBrowser` outside the `try`), 4 (other `createNode` paths; the custom-network account probe) and 5 (primary and last endpoint cannot be deleted; smoke has no node) against the tree, and probed finding 1:

- `--proxy-bypass-list=<-loopback>;localhost;127.0.0.1;[::1]` with the plan's resolver rules: `127.0.0.1`, `localhost` and `[::1]` reach a loopback server directly; the canary still goes to the guard; `https://169.254.77.77/` and `http://169.254.77.78/` reach the guard as `CONNECT` and absolute-form `GET`; no direct SYN. Without `<-loopback>` the resolver rules deny link-local before routing, so nothing left the machine, but nothing was recorded either.

One correction to Codex: "DNS denial cannot block IP literals" does not hold for Chrome's `MAP *`, which matches literals. Dispositions in `plan.md` § Audit verdicts. Plan v3 folds all nine (two in part: finding 4's account-probe dead end is pre-existing and goes to an issue at close-out; finding 1's leak was already closed, the recording is the gain).

## Final fresh pass, Codex (new session), 2026-10-10

Session `01a123ca-b35c-7322-9bb7-61a28fe612ea`. Verdict: **reject** (arc 2a's narrowed `connect-src` blocks the plan's own `http://` canary and background probes). Seven findings, all verified against the tree and accepted: HTTPS canary and an ordinary loopback-served page for the plain-HTTP, WebSocket, IPv6 and link-local cases; stop before snapshot with partial heads as `<malformed>`; D11 checks the shared verdict before `createNode` and keeps the emission; OA-5 states the custom-network exception; CodeMirror's `getSelection` fallback; the CSP gate bounded to exercised contexts. The blocking finding is a cross-arc seam no earlier round caught: arc 1's harness had to survive arc 2a's policy. A confirmation resume of the same session follows.

## WebSocket probe (2026-10-10)

From an ordinary page served on `127.0.0.1`, with the plan's routing: Chrome and Firefox both send `ws://` and `wss://` to the guard as `CONNECT`, and plain `http://` as absolute-form `GET`; the canary counts zero. A `no-cors` `http://` fetch resolves (opaque) on the guard's 403, because a plain-HTTP proxy answers in the origin's place, so a control must assert the guard's record, not a rejected fetch.

## Confirmation round, Codex (final session resumed), 2026-10-10

Verdict: **approve**. The seven final-pass findings are closed; one Low (export `isAllowedRpcUrl` from the aztec-runtime adapters barrel) accepted into arc 2a's change map. The panel has converged.
