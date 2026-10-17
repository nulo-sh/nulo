# ci-dedupe-1: recon

Read at `093fa10d` (origin/dev). Two Sonnet explorers (partition reuse sweep; release dispatch path) plus the planner's own reads. Line numbers are at that commit.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| One network job (a shard or a file list) | `.github/workflows/_extension-network-e2e.yml` (inputs `shard`, `shard_label`, `test_files`, `exclude_files`, `proverless`, `retry`, `chaos`, `chaos_seed`, `browser`; job name `network suite[ (shard N/5)]`) | reuse as-is |
| The partition (pool, dedicated groups, seeds) | hand-written per caller: `pr-extension-network-e2e.yml:140-279`, `pr-extension-network-e2e-firefox.yml:108-202`, `nightly.yml:187-282` and `:386-468`, `release.yml:250-375` (11 legs) | build new: one reusable lane `_extension-network-e2e-lane.yml`; callers call it |
| A rendered matrix | `extension-network-e2e-soak.yml:55-82` (prep job + `fromJSON`) | rejected for the partition: hides it from actionlint and a reader, and adds a job; `fromJSON` kept only for the seed list (an input default) |
| A generator with a byte check | `packages/design/scripts/gen-tokens.ts` + `tokens.drift.test.ts`; `apps/extension/scripts/store-icons.ts --check` | not used: no script here emits YAML (`Bun.YAML.stringify` unused; comments would be lost), see plan § Decision ledger D1 |
| Expanding a caller's suite calls in a pin | three ad-hoc expanders in `scripts/ci-cd/behavior-gating.test.ts`: `legs()` (147-177), the release leg binder (921-980), the nightly comparison (896-917) | adapt: one local `suiteCalls()` in that file replaces all three |
| Certification job names | `scripts/ci-cd/verify-cert-run.sh:50-62` (manual tool; no workflow calls it; Chrome PR lane only) | reuse as-is; its pin derives the names through the lane |
| Download + verify a published asset | `fetchVerified` (`scripts/release/attach-assets-run.ts:181`), `checkShasums` (`:200`), reused by `store-copy-run.ts` | reuse as-is from a new `select` command |
| Release state + refusal reasons | `readState` (`attach-assets-run.ts:80`), `planAttach`/`planPublished` (`attach-assets.ts:41-71`) | reuse; `select` takes `planPublished`'s refusal for an incomplete release |
| Smoke of an unpacked tree from an artifact | `_extension-smoke-e2e.yml` `artifact_name` (download to `_e2e-extension`, `manifest.json` at its root) | reuse as-is |
| Unzip a release zip to a tree | `source-rebuild.yml:77-86` (`unzip -q`); the zip root is the extension root (`zip-reproducible.ts:35-52`) | reuse the shape |
| Read-only job that verifies attestations | `verify-store-copies.yml:38-40` (`contents: read`, `attestations: read`) | reuse the permission set |
| Release aggregator | `release.yml:809-918` state machine; pinned by `aggregators.test.ts` worlds (`release()` 108-118, cases 160-215, attach-assets clauses 337-365) | adapt |

Absence trails: YAML emission: grepped `YAML.stringify`, `yaml.stringify`, `writeFileSync`, `Bun.write` under `scripts/`, `apps/*/scripts`, `packages/*/scripts`; no script writes `.github/`. YAML library: no `yaml`/`js-yaml` in any `package.json`; every pin uses `Bun.YAML.parse`. Callers of `verify-cert-run.sh`: grepped the repo outside `archive/`: `CI.md:54`, its own usage lines, `behavior-gating.test.ts:129,147,167`. Nightly chaos name references (`chaos / sends`, label `chaos`, `network-e2e-logs-chaos`): only `nightly.yml:272,278,409,416`.

## Facts the plan rests on

- Live job names (PR network run 39053876135): `Run / shard N/5 / network suite (shard N/5)`, `Run / heavy / … / network suite`, `Run / canary / real-proving / network suite`, `Run / chaos / seed <s> / network suite`. A reusable call's jobs are named `<caller job name> / <called job name>`.
- `nightly.yml` resolve refuses any ref but `refs/heads/dev` (`nightly.yml:~107`): a nightly cannot be dispatched from a feature branch.
- Store dispatch v0.31.0 (run 38815080815): builds 35 s and 30 s; Chrome smoke 24 min, Firefox smoke 31 min; `attach-assets` logged `use-published` and no rebuild warning, so that rebuild was byte-identical to the published zips.
- Environment `production` (attach-assets) has no protection rules and no branch policy; `chrome-web-store` and `firefox-add-ons` have a branch policy and required reviewers.
- `v0.31.0` (`08856c26`) holds all twelve dedicated network files.
- Draft releases are listed only to tokens with push access; `contents: read` sees published releases only.

## Open work and collisions

- **#555** (open): smoke and publishers download the build's artifact by id and digest. It touches the same `release.yml` smoke/attach downloads; this plan keeps download-by-name and adds no obstacle (the published trees get artifact names #555 can switch to ids).
- **#21** (open): published releases are mutable. The plan's re-read of the release digests before the store artifact is cut is what catches a replaced asset.
- **#620**, **#668**: CI issues in other files; no overlap.
- Closed known limits searched (`network partition`, `store dispatch`, `release smoke`, `chaos seed`): #322 (a Firefox chaos-seed flake) only, unrelated to scheduling.
