# deps-ci-2 phase 1: the lockfiles and the record

- npm 11.19.1 printed `up to date in 1s` for the in-place update and still rewrote the two entries; the keyed compare is the proof, not the message.
- `bun update follow-redirects --lockfile-only --ignore-scripts` (Bun 1.4.2) moved the one line; the frozen install relinked axios's copy to 1.16.2. The old 1.16.1 store entry stays under `node_modules/.bun` (no prune), so the fresh export (G4) is the install proof.
- G3: `npm ci --ignore-scripts` of the base and head pairs, 1048 packages each; the installed walk differs in `follow-redirects` and `node-forge` only.
- G6: base and head builds identical, `THIRD-PARTY-NOTICES.txt` included (sha256 `af2112220d73…` in both trees).
- G7: `lint`, `lint:actions`, `typecheck:all`, `test` (989 files), `test:all` (every workspace exit 0, 168 s) and `test:ci-gating` (747 pass) green at retry 0. `test:release` first ran 352 pass, 7 fail: every failure is `Executable not found in $PATH: "zip"` in `scripts/release/zip-read.test.ts` and `zip-reproducible.test.ts`, and the same 7 fail at `44d5a7064`. Rerun with Ubuntu's `zip` 3.0 deb unpacked into the lane's scratch directory and prepended to `PATH`: 359 pass, 0 fail.
