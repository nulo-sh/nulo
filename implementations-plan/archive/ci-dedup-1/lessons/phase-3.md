# Phase 3: proof on runners

- `pr-quick.yml` dispatch on `f9ea41ee`: run 41356013693, green. The composite logs `bun-version-file: package.json`, `Obtained version 1.4.2 from package.json`, and restores `Linux-bun-1.4.2-<bun.lock hash>` (the key value is unchanged, so no cache churn).
- `source-rebuild.yml` dispatch on `f9ea41ee`: run 41356015938, green. Both inline steps log `Obtained version 1.4.2 from package.json`. ARM64 downloads `bun-v1.4.2/bun-linux-aarch64.zip` by its exact URL; x86_64 takes the cached binary.
- PR #1492 opened without labels; its run carries the `preview-comment` and e2e-lane evidence.
