# Phase 0: the probe and the consults

## Probe (2026-10-19, throwaway, never committed)

Scratch under `~/.cache/nulo-backlog/egress-flake-1/`. A minimal MV3 extension whose worker polls `https://node.probe.example/aztec-testnet/key?n=<i>` every 400 ms (an `AbortController` per fetch, `abortAll()` on the global). A local stub answers or holds requests.

**Chrome** (`chrome-probe.mjs`, Node 24, Puppeteer 25.8.0, Chrome 152.0.7977.42 headless, a fresh profile per variant). The attach mirrors `cdpInterceptRpc`: a browser-target session, `Target.setAutoAttach { autoAttach, waitForDebuggerOnStart, flatten, filter: NOT_PAGES }`, `Fetch.enable` on the worker's session for the origin at `Request` stage, then `Runtime.runIfWaitingForDebugger`. The first paused request is held; later ones are continued to the stub. The stop is `stopBackground`'s: a new browser session, `Target.getTargets`, `Target.closeTarget`, detach.

| Variant | Order | Reply result |
|---|---|---|
| control | pause, reply on the live worker | ok |
| stop, wait, continue | pause, `closeTarget`, wait (no `targetdestroyed`, no `detachedFromTarget` in 5 s), +0.5 s, `Fetch.continueRequest` | `ProtocolError: Protocol error (Fetch.continueRequest): Invalid InterceptionId.` (`originalMessage: "Invalid InterceptionId."`) |
| stop, continue at once | pause, `closeTarget` sent, reply in the next tick | ok |
| stop, wait, fail | as row 2, `Fetch.failRequest` | `ProtocolError: Protocol error (Fetch.failRequest): Invalid InterceptionId.` |
| caller abort | pause, `abortAll()` in the live worker (1 aborted), +0.5 s, continue | `… (Fetch.continueRequest): Invalid InterceptionId.` |
| unknown id | continue `interception-job-999999.0` on the live session | `… (Fetch.continueRequest): Invalid InterceptionId.` |
| same id twice | continue the held id (ok), then again | `… (Fetch.continueRequest): Invalid state for continueInterceptedRequest` |

A wake variant (open an extension page after the stop) timed out on the page's navigation at 30 s: the parked host that `standing-interception.ts` documents. Outside this question; not pursued.

**Firefox** (`firefox-probe.ts`, Bun, the real `firefoxDriver.launch`, `interceptRpc` and `stopBackground`, Firefox 153.0.4 headless; the same poller as an MV3 event page). The stub holds every request open.

| Mode | Hits before the stop | Open at the stub | Closed by the kill | `failures()` |
|---|---|---|---|---|
| redirect | 3 | 3 | 3 | `[]` |
| refuse | 3 | 0 | 0 | `[]` |

The observer redirects or cancels inside `http-on-modify-request`, so no decision is pending when the page dies.

## CI cross-check

`gh api repos/nulo-sh/nulo/actions/jobs/118121924844/logs`: `egress guard: rows.test.ts: the stand-in node's interception reported: a spec's interception: service_worker:<id>/service-worker-loader.js: reply to /aztec-testnet/<key> failed: ProtocolError: Protocol error (Fetch.continueRequest): Invalid InterceptionId.`, three times.

## Consults

- 2026-10-19, Codex r1 (gpt-6.1-sol, high, read-only, session 01a15512-6281-7562-8cd1-b712d11e28e6): conditional approve, 4 findings, all accepted (plan § Audit verdicts). It checked Chromium's `FindJob` for the message's meaning.
- 2026-10-19, Opus Plan leg: conditional approve, 7 findings, all accepted. It confirmed Puppeteer builds `Protocol error (<method>): <msg>` (`CallbackRegistry.js:76`) and names the error by its class, so `String(e)` matches CI's text.
- 2026-10-19, Codex final pass (resume of 01a15512): approve, no findings, high confidence.
