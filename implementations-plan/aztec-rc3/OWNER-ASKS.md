# aztec-rc3: owner asks

Each ask names the surface, the options, what ships now without waiting, and the recommendation. The plan builds the default. The draft's PrivateFPC sequencing ask is gone: the wallet copies the address from `@alejoamiras/private-fee-juice`'s own `canonical-deployment.json`, which unleashed already mirrors under its own test (plan M5).

## OA-1. Release order (plan Ask A1)

- **Surface:** what a store-installed V6 user sees after updating to an rc.3 build.
- **Options:** (a) no store upload of an rc.3 build until stale-network-reset's reset screen is on `dev`; (b) release when this plan merges: anyone who installed V6 from AMO's experimental listing meets the integrity barrier (exits: delete the profile, or reinstall) until the reset screen ships.
- **Ships now:** merges to `dev` only; releases are yours either way.
- **Recommendation:** (a).

## OA-2. Account files exported under rc.1 (plan Ask A2)

- **Surface:** Settings → import an account file.
- **What happens:** the rc.3 build refuses an rc.1 file ("Account export is for a different Nulo regime"), as V6 refused V5 files: the file names the old artifact's digests.
- **Options:** (a) refuse (today's gate); (b) accept a file from the previous entry of the same major and derive its new address (a new import path, its own plan).
- **Ships now:** (a).
- **Recommendation:** (a). Testnet was reset, so nothing is reachable at the old address.

## OA-3. Nightly's `token-list-host-live` after the empty list is published (plan Ask A3)

- **Surface:** no screen. Nightly's advisory job; no PR gate reads it.
- **What happens:** `infra/token-list/test/live.test.ts:25` expects at least one entry. Once you approve the publish of `"tokens": []`, the job reds every night until unleashed's rc.3 generation repopulates the list.
- **Options:** (a) leave the test as written and file an open issue, `blocked:external` on unleashed's rc.3 generation, naming the red as expected; (b) let the test accept an empty list, a third token-list file outside the grant and a weaker check; (c) publish the empty list only when unleashed's tokens are days away, leaving the old rc.1 entries served meanwhile (the wallet filters them out by chainId).
- **Ships now:** (a). Arc 1 edits only `class-ids.ts` and `list.source.json`.
- **Recommendation:** (a). The red is true, bounded, and on an advisory job.

## OA-4. The regime entry's name (plan Ask A4)

- **Surface:** none visible; the id appears in exported account files and integrity records.
- **Ships now:** `nulo-v6.1`.

## OA-5. Conditional: no SponsoredFPC on the new Testnet (plan Ask A5)

- **Raised only if** P3's probe finds no SponsoredFPC instance at the rc.3 address.
- **Surface:** Fee settings' default Sponsored row; sends that use it would fail.
- **Ships now:** nothing is pinned; arc 1 stops at P3 until you answer.
