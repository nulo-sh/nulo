# floor-superseded-1: recon

One Sonnet explorer (a batched reuse sweep) plus the planner's reads, against `origin/dev` at `85edeb866`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The floor rule | `raisesFloor` in `infra/token-list/scripts/floor.ts:15-19` | reuse as is, applied to more lists |
| Reading an envelope unverified | `envelopeMeta` in `infra/token-list/scripts/open-publish-pr.ts:33-40`, already in the `publish-pr` closure | reuse as is, wrapped so a bad envelope is a finding, not a throw |
| Reading `floor.json` at a commit | `io.read(FLOOR_PATH, sha)` reads the text; `check.ts:90-101` parses it into findings, outside the closure; `packages/token-list` compiles it | build new: `floorSequence` beside `floorText` in `floor.ts` (no import) |
| Listing PRs with paging | `scripts/release/prune-nightlies-run.ts:69-75,99-109` (`Link` pages); `scripts/release/attach-assets-run.ts:399` (page numbers) | adapt the page-number loop locally: the `publish-pr` closure may import only `node:` and relative files (`publish.test.ts:248-256`), so no import from `scripts/release` |
| Fork filter for publish PRs | `publishPrs(pulls, repo)`, `open-publish-pr.ts:63-67`, tested at `publish.test.ts:96-109` | adapt: also drop merged PRs, carry the head SHA |
| Listing branches by prefix | none (searched `matching-refs`, `git/refs`, `heads/` under `scripts/ infra/ .github/`) | build new: one `githubIO` method |
| A fake GitHub for a two-run sequence | `fakeIO` in `publish.test.ts:44-64`, stateless; `scripts/release/open-sync-pr-run.test.ts:16-58`, scripted, another interface | adapt `fakeIO`: it stays stateless and gains `prs` and `branches` inputs; run 2's inputs are built from run 1's recorded writes |

## Constraints found

- `publish.test.ts` asserts exact `calls` lists; the new reads must not log into `calls`.
- `scripts/ci-cd/behavior-gating.test.ts:1200-1260` pins the `publish-pr` step command and its empty `env`; `scripts/ci-cd/release-integrity.test.ts` pins its permissions and actions. The arc changes neither.
- The `prepare` closure (`summary.ts`, `check.ts`, `live-check.ts`) imports `./floor`, so `floor.ts` stays import-free.

## Docs that state when the floor rises

`infra/token-list/README.md:20,27-30,52-53,55-57,72-73`; `SECURITY.md` § Token list signing ("Rollback and freeze", "The floor's writer"); `infra/token-list/FORMAT.md:68` and `packages/token-list/README.md:18` ("the last list that delisted or flagged a token", still true read against any signed list); `summary.ts:159` (the prepare summary's floor line); `prBody` in `open-publish-pr.ts`. `CI.md:150` says the job closes older publish PRs, which stays true.

## Open work

No open issue covers the floor; closed known limit #386 (a host serving an older list to a fresh install) is the limit the floor answers. No `token-list-publish-*` branch exists today (`git/matching-refs` returns `[]`); all three publish PRs merged.
