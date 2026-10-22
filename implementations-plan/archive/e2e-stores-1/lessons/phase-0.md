# e2e-stores-1 — phase 0 (planning)

## Consults

- **Codex round 1** (gpt-6.1-sol, high, read-only; 2026-10-22): `conditional approve` — (1) the D4 guard inside `createRunDir` runs after `markBootStarted()`, so its throw would be a retried exit 86: validate before it; (2) world state runs in a marked `aztec-wsdb` child (`@aztec-foundation/ipc-runtime` `spawned_backend.ts`), so I1's "node's own pid" is wrong, and an unreadable fd dir must not read as empty; (3) the red probe would itself leak stores into `/tmp`: give it a parent `TMPDIR` of its own; add boundary, foreign-marker and `(deleted)` unit cases; correct F3 and F4; pass an absolute `TMPDIR`. Each claim checked against the pinned install and the harness; all held. Dispositions in plan.md § Audit verdicts.
- **Opus 5.5 leg** (Plan agent, read-only; 2026-10-22): `conditional approve` — the same D4 placement and I1 findings; plus: log a pass line (nothing logged the run dir, so the draft's Phase 2 gate was unobservable); home the check in `boot-guard.ts` with a private fd reader; an unmarked-process test case, children without stdio past fd 2 (tests run on Bun); stale "mandatory `--data-directory`" comments in `global-setup.ts`; the Firefox network run adds no evidence for this change (kept: the lane brief requires it); a tmpfs-speed trade-off. Checked `rmSync` on Bun 1.4.2 (it does not follow a symlink either). Dispositions in plan.md.
- **Codex rounds 2-3** (resumed, same session): r2 `conditional approve` on one condition (delete the red probe's scratch `TMPDIR` only after the lock clears), applied; r3 `approve`, no new material findings.

## Host one-off (the owner's; never run by an agent)

The fix stops new leaks; it does not touch what is already in a host's `/tmp`. Any local network on the host (this repo's e2e, another repo's, a TXE) writes the same names, so a directory's name does not say whose it is. The owner decides. Steps, on Linux, as the user who owns the directories:

1. Inventory, read-only. Count the node kinds older than two hours:
   `find /tmp -maxdepth 1 -user "$(id -un)" -mmin +120 \( -name 'archiver-*' -o -name 'p2p-*' -o -name 'signing-protection-*' -o -name 'slasher-*' -o -name 'sentinel-*' -o -name 'l1-tx-utils-*' -o -name 'aztec-world-state-*' -o -name '.foundry-deploy-*' -o -name 'cdb-ts-*.sock' -o -name 'wsdb-*' -o -name 'avm-*' -o -name 'bb-batch-*' \) | wc -l`
2. List the `/tmp` entries a live process holds open, and keep them out of any deletion:
   `for f in /proc/[0-9]*/fd/*; do readlink "$f"; done 2>/dev/null | grep -o '^/tmp/[^/]*' | sort -u > ~/.cache/tmp-held.txt`
3. Delete only what step 1 finds and step 2 does not list:
   `find /tmp -maxdepth 1 -user "$(id -un)" -mmin +120 \( … the same names … \) | grep -vxF -f ~/.cache/tmp-held.txt | xargs -r rm -rf --`

Run step 2 right before step 3: a node that starts between them is not protected. If in doubt, stop every local network on the host first.
