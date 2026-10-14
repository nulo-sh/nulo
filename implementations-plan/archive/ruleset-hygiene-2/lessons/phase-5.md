# ruleset-hygiene-2: implementation and review loop

## Gates

- Phases 1 to 5 each passed their gate on the first run (STATUS.md has the lines). One deviation: the Phase 3 anchor grep also hit `lessons/phase-0.md:7`, which quotes the pattern; it ran again with this plan's directory excluded and in link form over the whole tree, both empty (D12).
- CLAUDE.md: 86,744 bytes at the base, 64,753 after Phase 4, 65,091 after the review fixes.

## Consult 3: Codex implementation review, round 1 (2026-10-13)

- Call: `run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, default `~/.codex` login (`CODEX_ACCOUNT` unset; this host runs Codex in approve-for-me mode). Session `01a13716-1ff5-7a43-8409-d3068877451e`.
- Verdict: approve, no findings.

## Opus 5.5 diff review, alongside round 1

- Five findings, verified against the base: two prohibitions lost from the short sections because a lifted sentence was cut short (D3 named one sentence of the advisory bullet; the next, about PR titles and tests, carries a prohibition too), one lost antecedent, one pointer missing the duplication trend, one dropped reason clause. Fixed in one commit; two rejected (plan.md § Audit verdicts).
- Lesson: when lifting a sentence into a short section, lift it whole; a sentence cut at a semicolon loses its second rule silently, and no normalized diff of the moved block can see it, since the full text survives in the new home.

## Consult 4: Codex round 2 (resumed, 2026-10-13)

- Verdict: approve, no new material finding; it verified each fix against the base. Loop converged in two rounds.
