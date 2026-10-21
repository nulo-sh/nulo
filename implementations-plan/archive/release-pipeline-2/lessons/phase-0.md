# release-pipeline-2: phase 0 (planning) log

- 2026-10-21 GitHub docs (reuse workflows, deployments and environments, workflow syntax) read through a web-fetch agent: a reusable workflow's job declares the environment; the caller must still pass the secret (`secrets: inherit` or by name), and an unpassed environment secret resolves empty with no error. `deployment: false` exists but its docs do not say branch policies still apply.
- 2026-10-21 actionlint 1.7.12 probe on a scratch copy of `.github/`: `secrets: inherit` with no `on.workflow_call.secrets` passes; a by-name secret the callee does not declare is refused.
- 2026-10-21 round 1, Codex (gpt-6.1-sol high, session 01a15f11): approve with changes, five findings; dispositions in plan.md § Audit verdicts. Opus Plan leg: approve with changes, eight findings; dispositions in plan.md.
- 2026-10-21 GitHub environment names are case-blind (Codex, citing the manage-environments page); `deployment: false` is documented for branch-policy scoping without deployment records; `release-app` holds no variable.
- 2026-10-21 round 2, Codex (resumed): approve with changes, three findings (staged copy, `OWNER-ASKS.md` wording, recon sentences), all accepted. It found GitHub's 2025-11-07 changelog (effective 2025-12-08) on which ref environment rules evaluate for pull-request events; read and confirmed through a web-fetch agent (plan F8).
- 2026-10-21 round 3, Codex (resumed): approve, no remaining finding.
