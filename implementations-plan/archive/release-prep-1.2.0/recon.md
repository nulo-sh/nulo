# release-prep-1.2.0: recon

Base: `origin/dev` at `ce16a57a9`. Release: tag `v1.1.0` at `241097f6c` (`chore(main): release 1.1.0 (#1166)`), GitHub Release published 2026-10-27. Two Explore agents (sonnet) plus the planner's own reads.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Check a release zip against its pin and `SHASUMS256.txt` | `apps/extension/tests/e2e/fixtures/update/release.ts` `releaseProblem` / `releaseBuild` (download, digest, one-line SHASUMS match) | reuse as is |
| Check a zip's build attestation | no per-tag CLI; `scripts/release/attach-assets-run.ts` wires it as an IO port. `gh attestation verify` by hand, as the v1.0.0 pin did (searched `attestation\|SHASUMS256` under `scripts`, `.github`, `.claude/skills/release`) | reuse the hand command |
| Pin a release | `RELEASE_DIGESTS`, `RELEASE_TRAITS` in `release.ts`; `scripts/e2e/update-recording.test.ts:36` requires the two key sets to match | adapt (add `v1.1.0`) |
| Record a release's storage | `update-in-place.test.ts:400-413` with `NULO_E2E_UPDATE_RECORD=1`, `recording.ts` `writeRecording` (Chrome only), `recordingProblems` | reuse as is |
| Guard a committed recording | `update-recording.test.ts:62-69` pins only v1.0.0's: it replays as a sealing release's and names no URL off this machine | adapt (see plan D2) |
| Build the candidate | `apps/extension/scripts/e2e/build-update-candidate.sh`: refuses a dirty tree outside `apps/extension/tests` and `implementations-plan` (`source.ts:7`), any test-only `VITE_*`, any `.env*`; stamps `<version>-update.1` (here `1.1.0-update.1`, manifest `1.1.0.1` > `1.1.0.0`); the scenarios refuse a candidate built at another commit than HEAD (`in-place.ts:23-29`) | reuse as is |
| Arrival scenario | `default-network-arrival-update.test.ts:137-138` asserts the release holds no Mainnet; v1.1.0 seeds it (`seeds.ts`, renamed "Alpha V6") | not run |

Every other tag reference in `apps/extension/tests/e2e/**` and `apps/extension/scripts/e2e/**` is trait-driven or a refusal-case fixture (searched `v0\.31\.0\|v1\.0\.0\|RELEASE_TRAITS\|RELEASE_DIGESTS\|own-window\|replaces-page`). No `v1.1.0` literal exists in the tree.

## v1.1.0's artifacts (checked 2026-10-28)

- `gh release download v1.1.0` into an empty scratch folder; `sha256sum -c SHASUMS256.txt`: both OK.
  - Chrome `bcc66cb0960359a8a70fe7693086faff82af4718cf2429d7fb0ac79ffc261117`.
  - Firefox `388fadfb24c86fae309605a64077924a5a384574429fa2a2fa7aa35e37e1a762`.
  - Both equal the GitHub asset digests.
- `gh attestation verify <zip> --repo nulo-sh/nulo --signer-workflow nulo-sh/nulo/.github/workflows/release.yml --source-digest 241097f6c… --deny-self-hosted-runners`: exit 0 for both.
- Both manifests: `"version": "1.1.0.0"`. Aztec line: `@aztec-labs/*` `6.0.0` at the tag and at HEAD.

## The traits, from the tag's source

- **storage: `sealed`.** `stores.ts` (the `sealedCodec` roots, the four `ui*` preference roots included), `services/ui-preference/service.ts:74-77` (pins, both fee-pick maps and the selection as sealed rows; the legacy `nulo:ui:activeAccount` read only to migrate, lines 109-110) and `storage/sealed-entity-storage.ts`. All three, and `ui-preference/spec.ts`, have the same blob at `v1.0.0` and `v1.1.0`.
- **connect: `own-window`.** `services/wallet-sdk/session-established.ts:266` opens the emoji check with `createPlaced` (a window of its own); its `windows` port has no `navigate` or `update` (v0.31.0's did). Same blob at `v1.0.0` and `v1.1.0`. `utils/own-window.ts` changed between the tags, but only to add Firefox own-window routes for the passkey and file-picker pages, not the connect flow.

## The surfaces the scenarios drive

`git log v1.0.0..v1.1.0 -- apps/extension/src packages`: 24 commits (3 feat: `0634a7954` per-profile passkey unlock key, `74cf8995b` passkey recovery phrase, `bd4e666b9` unlock choice after a phrase import or restore; 17 fix; 2 docs; 2 test).

- About 85 testids the release path uses (`register-*`, `network-*`, `contact*`, `import-account-*`, `account-*`, `send-*`, `token-*`, `tx-incoming-card`, `discover-allow-btn`, `verify-*`, `cap-*`, `execute-*`, `confirm-*`, `auth-*`) match the same source files at both tags.
- The service methods the scenarios call through the release's worker are unchanged, `network/spec.ts:343` `updateEndpoint` included. `account/spec.ts` changed off the release path only.
- The first-run onboarding tab now hands over to a popup window (`onboarding/hand-over.ts`); `fixtures/extension.ts:318` `closeFirstRunSurface` handles either outcome. Account import now refuses an address already held; the scenario imports a foreign file.
- The Mainnet seed is renamed "Alpha V6" (`244bfc536`); no scenario selects it by name, and the live scenario switches to Testnet whenever the header is not "Testnet".
- The stored-shape baseline: stamp 0 was re-cut in `74cf8995b` between the tags. `stored-shapes/` is identical at `v1.1.0` and HEAD (1 stamp, `0a82f0be…`), so the candidate reads v1.1.0's shapes as its own.
- Terms: the fixture seeds acceptance from HEAD's manifest (Terms 1.2, Privacy 1.2.7), so the release's sheet stays quiet, as on v1.0.0.

Prediction (high confidence): the live scenario and replay cases 1, 2 and 4 run from v1.1.0 with only the pins and the recording; case 3 does not (next section).

## A case that refuses v1.1.0 (code trace)

- `update-replay.test.ts:669-695`, case 3, registers a passkey profile on the release, updates it, and requires `auth-setup-again` with no `auth-submit`. Its failure mode is a pre-1.1 passkey row that the candidate must refuse.
- On HEAD, `profile/profile-row.ts:45-66` classifies a row as `retired` only when it is "a passkey row from before 1.1". `auth.vue:65,363` shows Set up again only for such a row.
- #1139 (`74cf8995b`, a passkey profile keeps a recovery phrase its passkey unlocks) is in `v1.1.0`, not in `v1.0.0`. `profile-row.ts` is unchanged from `v1.1.0` to HEAD.
- So a passkey profile made by v1.1.0 classifies as `passkey` on the candidate. The auth page offers its unlock, and case 3 times out on `auth-setup-again`. This is a scenario fact about pre-1.1 releases that no fixture can answer: the case needs a per-release expectation and the unlock path for a 1.1 row.

## Collisions

- Open issues: `--search "update replay"` returns #1157 (chaos, no collision); `RELEASE_DIGESTS`, `v1.1.0` and `Set up again replay passkey` return none that apply. Closed known limits searched with `update`: none on the replay's passkey case.
- Deadlines met while planning: the v0.31.0 recording's dApp session expires 2026-10-29 23:04 UTC; the v1.0.0 recording's 7 days after 2026-10-26. Neither is this lane's.
