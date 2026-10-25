# Charters and triage: passkey-chaos-1

A charter tells one agent where to push and how to behave. The orchestrator's fleet hands each agent one charter, the session commands (`tests/e2e/README.md` § Chaos runs, from C2) and these rules. The fleet spawns each agent under § Fleet permissions; these are the tool configuration, not requests in the charter. An agent never files an issue, pushes, or reads the Testnet endpoint constant; it writes findings to its session's `findings.jsonl` with the steps that led there and the outcome it expected.

## Rules every agent follows

- Drive the wallet the way a person would, through `snapshot`, `click`, `fill`, `press`, `open`, `close`, `pick-file` and the `passkey` faults. Use `do <action>` only to reach a starting point quickly.
- Every value you type into a password, file-password or recovery-phrase field becomes a needle the leak scan looks for, so type real-looking secrets there and nowhere else.
- Run `oracle` after anything surprising and before `end`. A finding is anything an oracle reports, or anything a person would call wrong: a screen that says something untrue, a control that does nothing, a state with no way out. Write the outcome you expected beside it: the session keeps no model of the wallet.
- On Chrome the anchor page holds every passkey; the launcher refuses to close it. Charters that open many windows during passkey steps run on Firefox.
- Stop at 60 minutes, or earlier when the charter is exhausted; end with `end`.

## Fleet permissions

The host's sandbox does not confine a process, and agents share one user, so the boundary is each agent's tool configuration: its only shell command is `bun apps/extension/scripts/e2e/chaos-session.ts cmd <its session directory> …`, its only file reads are inside that directory (snapshots, screenshots, downloads), and it has no GitHub token, no `gh`, no `git` and no other network tool. `snapshot` gives it every testid on the page, so it never needs the source or the dist copy. C2.2 proves this with a probe before the pilot.

The dApp flows (a dApp calling while locked or mid-unlock) are not a fleet charter: the launcher has no network mode, and the seeded network file covers them.

## Personas

- **Hostile:** wrong secrets, files from other profiles or older versions, truncated or edited files, another profile's passkey, the same action repeated after it was refused.
- **Clumsy:** wrong passwords, cancels at every prompt, back and close at every step, half-filled forms, the wrong file.
- **Impatient:** double clicks, closing the popup mid-step, a background restart mid-step, two windows doing two things at once.

## Charters

| ID | Area | Persona | Faults | Browser | From |
|---|---|---|---|---|---|
| CH1 | Create (password, passkey) and the recovery phrase stage | clumsy | refused and no-PRF prompts | both | C1 |
| CH2 | Lock, unlock, switch profile, strict mode, background restart | impatient | held prompts, restarts | Firefox | C1 |
| CH3 | Full backup export and restore | hostile | truncated, flipped and foreign files, wrong passwords | both | C1 |
| CH4 | Account files and imported accounts | hostile | foreign and edited files | Chrome | C1 |
| CH5 | Reveal and re-import the recovery phrase; compare accounts | clumsy | refused prompts | both | C3 |
| CH6 | Profiles made before the update: listed, refused, deleted | hostile | every refused path | both | C3 |
| CH7 | Unlock method changes, both ways, interrupted | impatient | cancels mid-change, restarts | Firefox | C4 |
| CH8 | One passkey for several profiles | hostile | another profile's passkey, deleted profiles | Firefox | C4 |
| CH9 | Leak hunt: everything that leaves (backups, account files, logs, log export) | hostile | none | both | C1 |

## Pilot (C2.2)

Three agents, 30 minutes each, on today's `dev`: CH1 on Chrome, CH3 on Firefox, CH2 on Firefox. The pilot proves the launcher and the verbs, not the wallet: its gate is that each agent's `actions.jsonl` replays to the same end. Results are recorded here.

## Triage

1. **Class it first.** Before any evidence leaves the run's local directory, decide whether the finding is a suspected exploitable weakness. If it is, or might be: a private draft security advisory, nowhere else; only a count appears in any report, plan, issue or PR until the advisory is published. Nothing below copies its evidence anywhere public.
2. **Reproduce.** Replay the agent's `actions.jsonl` through the launcher, or the seed and plan of a seeded run (`plan.md` § Finding → reproduction). A finding that does not replay in three tries is recorded in the plan as unreproduced, with a one-line summary, and filed only if its evidence alone shows a broken property.
3. **Classify.** Harness artifact (fix the harness, no issue), product bug, behaviour the contract allows (record the contract in the plan), or conditions the wallet does not support (a closed `known-limit` issue).
4. **Grade** by OA-C5's severity.
5. **File** a public finding: dedupe (`gh issue list --state all --search "<words>"`), then an issue in the five sections (`implementations-plan/README.md` § Where open work lives), with excerpts that mask the run's secrets.
6. **Reduce.** Trim the action list by hand to the shortest one that still fails (`NULO_E2E_CHAOS_ACTIONS=<file>`); put it in the issue or the advisory.
7. **Guard.** The fix's PR adds the regression test in the cheapest layer that reproduces the failure (unit, composition, then e2e); the next wave re-checks it.
