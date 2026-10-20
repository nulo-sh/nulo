# index-union-1: phase 0 (planning)

## Probes

- git 2.43.0, scratch repos outside the clone: the nine cases in [recon.md](../recon.md) § Git probes. Takeaways: union resolves pure appends; it keeps both sides of an edit; a local merge reads attributes from the working tree (one more conflict for a branch cut before the attribute, avoided with `-c attr.tree=origin/dev`); a bare `merge-tree` reads them from `HEAD`.
- Web search (2026-10-20): no GitHub statement on `merge=union` in PR mergeability; a 2016 RuboCop PR reported GitHub ignored it. Treated as unknown.

## Consults

- Codex r1 (gpt-6.1-sol, high, session 01a15ab4, alejo-gmail login): conditional approve, five findings; all folded (plan § Audit verdicts).
- Opus Plan r1 (model opus): conditional approve, seven findings; five folded, two declined with reasons (D3 `runGit` option, D6 label).
- Codex r1 resumed: approve, no remaining finding.
- Fact the panel caught: PR CI tests `head.sha` (`pr-quick.yml:241`), not the merge ref, so a bad union on `dev` surfaces only when a branch merges `dev`.
