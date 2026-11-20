# deps-ci-3 phase 1: the lockfile

## Attempts

1. In-place `npm update node-forge fast-xml-parser @libp2p/crypto --package-lock-only` under `lock.sh`'s settings, first in a scratch copy of `cli/`, then in place: byte-identical results, four keys moved (plan F2). Naming `@libp2p/crypto` moves nothing: neither its 2.x nor its 4.x line has a newer release.
2. Age probe: the same update at a 12-day setting holds `fast-xml-parser` 5.12.0 and `fast-xml-builder` 1.3.1, so the setting governs `npm update`'s pick (F3).
3. `install.sh` end to end with a scratch `AZTEC_HOME` and `TMPDIR`: exit 0. The pinned installer, given `NARGO`, the `install_foundry` override and Node at or above its 24.15.0 minimum, writes nowhere else (read before the run).

## Consults

- Codex r1 (gpt-6.1-sol, high, plan and diff): `findings (2)`, both accepted. The proposed title named `@libp2p/crypto`, which does not move (demonstrated); D3's reopening condition left out an in-range backport and new evidence about the locked code (plausible).
- Opus lens beside it: `findings (3)`, accepted with one part left out. The title (as Codex). The known-limit issue had no step: added. The override case was miscounted and understated; reading `@aztec-labs/p2p` 6.0.0's `@libp2p/crypto/keys` imports against the 5.1.21 tarball shows it breaks at load. Its unverified claim about the older parsers' bounds stays out.
- Codex r2 (resumed, verify only): every accepted fix verified, and the 5.x load break confirmed on 5.1.22 and 5.2.0 too. `findings (3)` in the PR and issue drafts, all accepted: the PR body denied the existing `systeminformation` override, called 5.1.22 the only fixed release rather than the first, and the issue lacked its failure hypothesis.
