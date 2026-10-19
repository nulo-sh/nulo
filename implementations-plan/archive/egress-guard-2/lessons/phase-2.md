# Phase 2: the docs say what the guard does (#835, #836)

## Gate (2026-10-19)

- The stale-phrase grep over the skill, `FIREFOX.md` and the README printed nothing; `closePxeHost` appears once in the skill, `CRS_HOSTS` once in each of `FIREFOX.md` and the skill; `bun run lint` exit 0.
- Read against the code: `global-setup*.ts` (both provide `egressGuard: true`, only the artifact smoke `liveLeg`), `egressFailure` (the close's failure classes), `extension.ts:121-125` (`live: true` throws without `liveLeg`; direct hosts are `CRS_HOSTS` plus the live pair), `egressGuardPrefs` (one `DIRECT` line per direct host), `cold-wake-discovery.test.ts:42-59` (the pre-kill order).

## Deviation

- `NULO_E2E_INTERCEPT_LOG` exists on Chrome only (`chrome-rpc-intercept.ts:49`); the README and the skill say so, and on Firefox point at the arms instead.
