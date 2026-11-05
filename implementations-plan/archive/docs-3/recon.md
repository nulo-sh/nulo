# docs-3 recon

Base `210d02f1f` (`origin/dev`). Two Sonnet explorers (read-only) plus the planner's own checks. Paths are
repo-relative; `SM` is `apps/extension/src/wallet/services/profile/session-manager.ts`, `SM.test` its test file,
`svc` the profile `service.ts` beside it.

## Reuse map

| Capability needed | Existing code or doc | Verdict |
|---|---|---|
| Where dependency handling is documented | `SECURITY.md` § Dependency policy (CLAUDE.md calls it "the full version") | reuse-as-is: the moved paragraphs join it |
| Pointers into SECURITY.md | 3 × `#binary-dependencies` (`.github/WORKFLOWS.md:53,55`, `CI.md:79`), 1 × `#how-findings-are-tracked` (`BEFORE-LAUNCH.md:221`); prose pointers below | reuse-as-is: no heading changes, so no link edit |
| A check that a move is word for word | the expected file rebuilt from the base's line ranges, compared with `cmp` | build nothing: a one-line shell check in the gate |
| A test that reads SECURITY.md | none (`git grep -E 'readFile.*SECURITY\|SECURITY\.md' -- '*.ts' '*.sh' '*.json'` hits comments only; `apps/landing/scripts/legal-pages.test.ts:64` renders a link string, never reads the file) | none to update |
| Bun-bump and Aztec-bump procedures | CLAUDE.md § Dependency policy (the full Bun pin list, line 111); `.claude/skills/aztec-update/` (the Aztec procedure) | reuse: the moved paragraphs already point there; nothing is copied |

## Claim A — #1186 (strict mode and passkey sessions)

**Did not hold at the base.** #1142 (`518170a18`, merged 2026-10-26 23:00 UTC, five hours after #1186 was filed)
rewrote both sentences the issue quotes. Neither quoted string remains (`git grep -i 'always requires fresh auth\|password-profile session opened'` prints nothing).
SECURITY.md:118-121 now says a session opened "under either unlock" persists the bearer; :182-188 says lenient mode
keeps a passkey session's bearer.

The code agrees: `SM:299` writes the bearer when `!this.strictSecurityMode && dek`, with no branch on the unlock.
`restore()` (`SM:578-686`) has no branch on the profile type. Pinned by `unlock-method.composition.test.ts:176`
("with strict mode off a passkey profile's session survives a restart … with it on, none does"),
`service.passkey-unlock.test.ts:744` and `SM.test:729`.

Sentence-by-sentence check of SECURITY.md:99-188: every sentence holds, with these exceptions:

| Line | Sentence | Verdict | Evidence |
|---|---|---|---|
| 162-164 | "a bearer can be left behind by a failed storage write (logged, not retried) **or by a toggle that lands while a restarting worker is restoring the session**" | the bold clause does not hold | trace below; `SM.test:1092` |
| 170-171 | the bearer-writing events: "an unlock, a profile creation or import, or a change of … password or unlock method" | holds; restore from a backup (`svc:2640`) is a backup import in the repo's vocabulary (CLAUDE.md § Persisted-storage: "importing a full backup") | `svc:869,977,796,924,2392,1276,1517` |
| 155 | threat row 3: "must brute-force password (600k PBKDF2)" | holds under its heading (password profiles); a passkey row's slots open under the passkey's key (`svc:465-487`) | not changed |
| 114-115 | "~1s PBKDF2" | no timing test; 600k iterations pinned (`packages/wallet-crypto/src/encryption-key.ts:7`) | not changed |

**Trace for line 162-164 (demonstrated by code trace, one ordering pinned by a test).** `restore()` is not under
`runExclusive`; `clearBearer()` is (`SM:527-565`), and `onConfigUpdated` dispatches it when strict turns on
(`SM:769-778`). Three orderings of a strict-ON toggle against a restarting worker's `restore()`:

1. Toggle before `restore()` reads the record: `clearBearer` finds no active session and rewrites the record
   without the bearer (`SM:554-558`); `restore()` then reads no bearer and closes (`SM:611`).
2. Toggle between the read and the envelope check: `restore()` re-checks `strictSecurityMode` after the envelope
   check, with no await before `activeSession` is set (`SM:651-658`), and calls `silentClose()`, which deletes the
   record (`SM:734-743`). `SM.test:1092` ("strict turned on during the envelope check: a passkey bearer restores no session
   and none stays stored") asserts the record is gone.
3. Toggle once `activeSession` is set, the alarm await at `SM:682` included: `clearBearer` finds the active session
   and removes the bearer from memory and storage (`SM:537-551`), as for any live session (`SM.test:1130,1205`).

Outside those orderings a bearer stays when a storage call fails, each caught and logged, never retried:
`clearBearer`'s read on a locked worker (`SM:555`) or its write, or `silentClose`'s delete. A record `restore()` cannot
decode (`SM:581-589`) is kept for repair, and `clearBearer`'s read of it fails the same way (Codex audit, round 1).
It also stays when the worker stops after `ConfigStore.set` saved strict ON (`apps/extension/src/wallet/config/store.ts:44-66`)
and before `clearBearer` ran; the next start's `restore()` deletes it (`SM:611`; Opus audit). The sentence's first
clause names only the failed write.

## Claim B — #1274 (paragraphs under § Binary dependencies)

**Holds, and understates.** After the "**License posture.**" paragraph (SECURITY.md:830), § Binary dependencies holds
five paragraphs about npm and Bun dependency handling, not three:

| Line | Paragraph | In the issue |
|---|---|---|
| 839-869 | **CVE-on-Friday runbook.** | yes |
| 871-879 | **Bun bug oven-sh/bun#25305 — closed on Bun 1.4.** (the age gate on `bun update --latest`) | no |
| 881-883 | **`bun pm scan`** (third-party dependency scanners) | no |
| 885-887 | **`@aztec-labs/*` and `@aztec-foundation/*` outside this policy.** | yes |
| 889-896 | **Bun-version sync trap.** | yes |

§ Dependency policy runs 517-632; § GitHub Actions starts at 633. The paragraphs are bold-led, not headings, so a move
changes no anchor.

**Pointers** (`git grep -n -i 'security\.md'`, plus `runbook|binary dependencies|sync trap|CVE-on-Friday|25305|bun pm scan`,
excluding `implementations-plan/archive`): `bunfig.toml:37` (`See SECURITY.md "Dependency policy"` after the CVE-bypass
text) is loose today and true after the move; `CLAUDE.md:105` ("SECURITY.md, runbook step 4") stays true if the steps
keep their numbers; `CLAUDE.md:103,106-108`, `UPDATE.md:3`, `scripts/ci-cd/dependabot.test.ts:3` stay true.
SECURITY.md:551-554 ("The CVE-on-Friday runbook and the exact-pinned Aztec line … both further down this file") stays
true if both land below it. The `#binary-dependencies` links and the `action.yml` pointers target the presto,
geckodriver and Aztec-toolchain posture, which stays. `.claude/skills/**` names SECURITY.md nowhere.

**Facts inside the five paragraphs**: `minimumReleaseAgeExcludes` (`bunfig.toml:34-42`), `bun run audit:vue` and
`bun run test:e2e` (root `package.json`), CLAUDE.md § Account-address freeze, and the archive anchor
`bun-1.4-bump/plan.md#age-gate-probe` (heading "Age gate probe") exist. The sync trap's "the `bun-version:` literals in
a few jobs" counts five (`publish-packages.yml:97`, `release.yml:764,834`, `store-check.yml:51,86`), as SECURITY.md:599
says. Its "no CI step that verifies the pinned values match" holds for the sites it names (`setup-bun` and those
literals): `scripts/ci-cd/docker-ci-like-pins.test.ts` checks only the Docker runner's pin, which the paragraph does
not name.

**Duplication** (out of this lane, recorded): the sync trap is a subset of CLAUDE.md:111 and overlaps SECURITY.md:598-603
("Bun pinned"); #25305 also sits in CLAUDE.md:108, `bunfig.toml:44-52`, `UPDATE.md:11`; the Aztec paragraph's procedure
is the `aztec-update` skill's.

**Adjacent, out of scope**: four presto paragraphs (Distribution scope, Origin authorization, Production transport,
License posture; 795-837) sit after the geckodriver paragraphs, so "the binary" in Distribution scope first reads as
geckodriver. Same class as #1274, not named by it.

## Open work

`gh issue list --state all --search "SECURITY.md"`: #1186 and #1274 open; no collision. Closed #1185 (the strict
toggle's dialog) is fixed: `apps/extension/src/popup/pages/settings/lock.vue:125-126` says "From your next unlock,
every profile on this device …" and "… without your password or passkey", which SECURITY.md:145-147 matches.
`gh issue list --state closed --label known-limit --search "SECURITY.md strict bearer"`: none.
