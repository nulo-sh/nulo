---
name: logging-policy
description: What may reach a log line in the Nulo extension, and how. Use when adding or changing a `console.*` or `this.log*` call, passing a value or a caught error to a log, touching the redactor `trim()`, `REDACTED_KEYS` or `URL_KEYS`, `scrubUrls`, `log-payload-ban.test.ts`, the `debugMode` or `developerMode` flags, or the log viewer and its CSV export.
---

# Logging policy (what may reach a log line)

`console.*` is **not** the browser console. It is globally hijacked (`utils/console-sniffer.ts`) in
all four contexts and funnels into `LoggerStore`, which buffers, persists to
`chrome.storage.session`, feeds the log viewer, and is CSV-exportable. So an ordinary
`console.warn` has the same reach as `this.logWarn`, and "it's just a debug line" is never a reason
to log something sensitive.

- **Pass the value as an object property NAMED for what it is.** The only redaction is `trim()`
  (`wallet/logger/utils.ts`), an object walker: it blanks secret-named keys, collapses known
  shapes (`Note`, `ActiveSession`, `Profile`, contract artifacts), summarises typed
  arrays/`Map`/`Set`, and projects errors. It redacts **by key name**, so `{ password }` is safe
  and `{ value: password }` is not — the walker reads a benign key and passes the string through.
  **A finished string is opaque to it** — `` `k=${x}` ``
  can never be redacted — and neither can `"k=" + x` or a bare `x` string argument. A caught
  error is passed the same way, under a named key (`{ error }`; `trim` projects an `Error` to a
  capped `{ name, message }` with no stack), never flattened first by a helper or a `.message` /
  `.stack` read. This is
  enforced by `apps/extension/src/utils/log-payload-ban.test.ts`, which scans the extension app
  plus every `packages/*/src` (enumerated at runtime, so a new package is covered the day it
  exists — the transport layer logs the most dangerous payloads there is), and fails CI listing
  every offending `file:line`. Its known false-negative is textual
  (aliasing and indirection defeat it), stated in its own header. Its denied names are imported
  FROM `REDACTED_KEYS`/`URL_KEYS`, so the two lists cannot drift; an arity read
  (`authWitnesses.length`) is deliberately allowed, being the idiom this policy asks for.
- **An error's message is a finished string.** `trim` keeps up to 200 characters of it
  (`MAX_ERROR_MESSAGE_CHARS`), and a message can quote its input (`JSON.parse`'s does): where that
  input can hold anything this policy never logs, log a fixed category, never the error
  (`implementations-plan/archive/backup-log-hygiene/plan.md#error-text`).
- **Log the identifier, not the payload — chosen per site.** There is no single right identifier:
  a `txHash` links private activity, an unsalted origin hash is dictionary-reversible, a bare row
  id is useless without the database. Prefer note type + content arity, function name + return
  arity, operation + count + outcome, a row id for entity failures.
- **Never log**: decrypted note contents, simulation/utility return values, contact name or
  address, page or navigation URLs, balances, whole RPC envelopes (`params`/`result` carry
  passwords and export returns), or whole backup rows.
- **A sealed row that does not open logs a category, never the row.** `SealedEntityStorage` warns
  `sealed-authentication` (the AEAD refused it: moved, swapped or edited), `sealed-format` (it
  opened to something that is not a row) or `sealed-identity` (it opened to another profile's
  row), with the root and the key's shape from `describeKey` (`<root>@<id:N chars>`): never the
  id, the ciphertext, the WebCrypto message or the row. A row whose profile has no keys in this
  worker is the normal locked case and logs at `debug`. A new refusal adds a category; it never
  passes the row or the caught error.
- **Endpoint URLs** are reduced to their origin (`scrubUrls`, `@/utils/scrub-urls`) — providers
  embed API keys in the path — on both the log path and the dApp-facing error envelope.
- **Aztec dependency loggers emit `warn` and above.** The build defines `process.env.LOG_LEVEL` as
  `DEPENDENCY_LOG_LEVEL` (`apps/extension/vite.shared.ts`), which every upstream `createLogger` reads.
- **The PXE host frame drops 32-byte values.** `offscreen/frame-logger.ts` runs `trim`, then
  `scrubHex32`, over the lines of the frame's console hooks, its rejection handler and the logger
  `createPxeOffscreen` receives, so none carries a `0x` + 64-hex run or a field-sized bigint,
  full class ids and hashes included.
- **Pick the level by REACH, not by tone.** Services call `this.log{Debug,Info,Warn,Error}`; UI
  calls `console.{debug,warn,error}`. `LoggerStore.log` drops only `level < logLevel`, and
  `logLevel` is `Info` unless `debugMode` is on — so **`warn` and `error` are captured for every
  user with every toggle off**, and land in the buffer the log viewer renders and exports. `debug`
  is the only level that costs nothing when nobody asked for it. A line you would not want in a
  stranger's bug report belongs at `debug` or nowhere.
- **An expected refusal logs at `debug`; a real failure on the same path stays at `error`.** Key
  the demotion on a type or constant the wallet owns (a typed `WalletError`, `StoreErasedError`,
  `isClientDisconnectRejection`), or on an upstream text pinned whole on the one op whose callers
  recover, never on text a dApp or a node can shape, and pair each with an `error` control in its
  test. The shared rules: a client disconnect (`logCallFailure`, and `forwardVueError` as both
  apps' Vue `errorHandler`); a wrong credential the page words (`logCredentialFailure`); a run a
  lock superseded resolves at debug (`createNetworkSwitchHandler`). An unhandled rejection is a
  missing handler, not a level: hold the promise at the call that makes it.
- **Two flags, not one — don't conflate them.** `debugMode` gates the LEVEL (and grows the ring
  buffer 1,000 → 10,000); `developerMode` gates PERSISTENCE to `chrome.storage.session`. Debug
  lines are dropped without `debugMode` even when `developerMode` is on.
- **`console.log`/`console.info` are banned** in `apps/extension/src/**` (biome `noConsole`,
  `allow: debug|warn|error`). Exempt by path: the sniffer, the logger internals, e2e, tests. The
  anti-scam DevTools banner in `popup/app.vue` carries four line-local `biome-ignore`s instead —
  it must reach the real console, and a whole-file exemption would license every future
  `console.log` in the app shell.
- **Retention is opt-in.** Persistence to `chrome.storage.session` only happens with Developer
  Mode on; turning it off purges the stored copy, and so does "Clear logs". `chrome.storage.session`
  is memory-backed — a browser restart, extension update or reload clears it, so a log is a
  short-lived in-session artifact, not a disk record.
- **Reading them**: with Developer Mode on, Settings → Developer shows a Logs row that opens the
  viewer window (`popup/windows/logger/`), which renders the buffer and exports it as CSV. That
  export is the reason this policy exists — it is the path by which a user's logs become a public
  bug report.

When adding a sensitive field to a type, add its name to `REDACTED_KEYS` in
`wallet/logger/utils.ts` — in camelCase *and* the kebab-case spelling used by exported backup JSON
(the scanner reads `${row["master-key"]}` too). The static guard imports that set, so it extends in
the same commit. Names ending in `secretKey` are covered by suffix in both.
