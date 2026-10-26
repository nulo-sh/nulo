# Charters and triage: passkey-chaos-1

A charter tells one agent where to push and how to behave. The orchestrator's fleet hands each agent one charter, the session commands (`tests/e2e/README.md` § Chaos runs, from C2) and these rules. The fleet spawns each agent under § Fleet permissions; these are the tool configuration, not requests in the charter. An agent never files an issue, pushes, or reads the Testnet endpoint constant; it writes findings to its session's `findings.jsonl` with the steps that led there and the outcome it expected.

## Rules every agent follows

- Drive the wallet the way a person would, through `snapshot`, `click`, `fill`, `press`, `open`, `close`, `pick-file` and the `passkey` faults. Use `do <action>` only to reach a starting point quickly.
- Every value you type into a password, file-password or recovery-phrase field becomes a needle the leak scan looks for, so type real-looking secrets there and nowhere else.
- Run `oracle` after anything surprising and before `end`. A finding is anything an oracle reports, or anything a person would call wrong: a screen that says something untrue, a control that does nothing, a state with no way out. Write the outcome you expected beside it: the session keeps no model of the wallet.
- On Chrome the anchor page holds every passkey; the launcher refuses to close it. Charters that open many windows during passkey steps run on Firefox.
- Use the whole session: when an area is exhausted, vary the order, the persona's mistakes, the faults and the windows, and go again. The session ends itself at its deadline and answers `ended`; `end` only stops one early on purpose. (Told to finish near 100 commands, the first pilot's agents ended after about five minutes.)

## Fleet permissions

The host's sandbox does not confine a process, and agents share one user, so the boundary is each agent's tool configuration: its only shell command is the launcher's `cmd` on its own session directory, its only file reads are inside that directory (snapshots, screenshots, downloads), and it has no GitHub token, no `gh`, no `git` and no other network tool. `snapshot` gives it every testid on the page, so it never needs the source or the dist copy. Each agent is spawned exactly so (`<worktree>` is the worktree's absolute path, `<dir>` the session's):

```bash
cd <dir>
env -i HOME="$HOME" PATH="$PATH" LANG=C.UTF-8 USER="$USER" CLAUDE_USAGE_MODEL=opus \
  claude-usage run best -p "<charter prompt>" --model opus \
  --permission-mode default --permission-prompts none \
  --tools Bash,Read --strict-mcp-config --setting-sources "" --safe-mode \
  --allowedTools "Bash(bun <worktree>/apps/extension/scripts/e2e/chaos-session.ts cmd <dir> *)" "Read(/<dir>/**)" \
  --output-format stream-json --verbose > <transcript> 2>&1
```

The working directory is the session directory, not the worktree: Claude Code approves reads and read-only commands inside its working directory without a rule, so at the worktree root an agent could read `apps/extension/src` and the build (D68). `--setting-sources ""` and `--safe-mode` keep the user's allow rules, hooks and instructions away from the agent; `env -i` leaves its shell no credential; `--permission-prompts none` refuses whatever would ask. Never `--dangerously-skip-permissions` or `bypassPermissions`. The C2.2 probe shows what this line refuses: `src`, the build, the dist copy, the runner's log, other sessions, links, every write, `gh`, `git push`, network tools and every injection into the allowed command (lessons/phase-C2.md). What it lets through: the agent's own directory, and shell expansion of a non-secret variable or a file name into a `cmd` argument.

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

Three agents, 30 minutes each, on today's `dev`: CH1 on Chrome, CH3 on Firefox, CH2 on Firefox. The pilot proves the launcher and the verbs, not the wallet: its gate is that each agent's `actions.jsonl` replays to the same end. Results, from round 2 (2026-10-26, at `e2c1b37b4`; lessons/phase-C2.md has round 1, the triage and every difference):

| Charter | Browser | Minutes | Commands | Findings | Replay |
|---|---|---|---|---|---|
| CH1 | Chrome | 30 (agent 22) | 433 | #1145, #1148 | 4 differences: the harness's (fixed) and a PXE request a restart caught in flight in the replay only |
| CH2 | Firefox | 30 (agent 18) | 270 | #1144, #1147, #1149 | 19: the harness's (fixed), then from command 229 another fallback profile after a reset (#1150); #1144 reproduced |
| CH3 | Firefox | 30 (agent 16) | 354 | #1146, #1150 | 16: the harness's (fixed, the backup's size among them) and one snapshot of the other fallback profile (#1150) |

Each pilot found something, so each was triaged and its replay recorded. The harness's differences are fixed (D75), and a session on each browser then replayed to the same end. A replay that deletes the selected profile can still differ until #1150 is fixed.

## Testnet pass

P87-03 B: a manual pass, once per browser, after the local campaign's fixes land and before the campaign is accepted. The owner drives it, or the orchestrator on the owner's word; no agent and no harness run touches Testnet. Whoever drives it follows these rules throughout:

- Type invented passwords and file passwords, write each phrase on paper only, and never paste a phrase, a password, a file password or a screenshot showing one anywhere.
- Never copy, print or screenshot a node endpoint (Settings → Networks).
- Read a log export before it leaves the machine.
- Transactions on Testnet are public.
- Funds come from where the owner says (OA-C2's open question).

**The build.** A release candidate of the campaign's head, built as a release is, with no test-only `VITE_*` flag and no env file: `bash apps/extension/scripts/e2e/build-update-candidate.sh <browser> rc.1` writes one to `apps/extension/.e2e-state/update-candidate/<browser>/`. On Chrome, load it unpacked into a new, empty browser profile. On Firefox, a temporary add-on is removed when Firefox restarts, which step 9 does: zip the directory's contents and install the zip from Add-ons → Install Add-on From File, in Firefox Developer Edition or Nightly with `xpinstall.signatures.required` set to `false`, in a new, empty profile. A second empty profile of the same browser is the "second install" of step 11. A new or restored profile starts on Mainnet: switch each one to Testnet (Home → network) before it is funded, compared or sent from.

| # | Step | Expected |
|---|---|---|
| 1 | Install; onboarding opens. Create a **password** profile, pass the recovery phrase stage with "I saved it" (write the 24 words down), switch it to Testnet | Home with one account; no error notice |
| 2 | From the lock screen's New profile, create a **passkey** profile; at its phrase stage choose "Do it later"; switch it to Testnet | a passkey prompt, then Home with another account; Get started offers the phrase |
| 3 | Reveal each profile's phrase (Settings → Security → Backup → Recovery phrase): the password profile with its password, the passkey profile with "Reveal with passkey" | 24 words each; the password profile's match step 1's |
| 4 | Import each phrase as a new profile, one choosing Password, the other Passkey, confirming the duplicate-wallet warning; switch each to Testnet | each imported profile shows the same first account address as its source |
| 5 | Fund the password profile's first account | the balance shows after sync |
| 6 | Open unleashed's testnet app (`https://testnet.app.unleashed.systems`) and connect the funded profile; check the emoji | the connect window names the app, the emojis match, the app shows the account |
| 7 | Send once: a small amount of a default token to the passkey profile's address, approved in the wallet | the send proves and lands; Activity shows it; the recipient's balance rises after sync |
| 8 | Lock and unlock each way: the password profile with a wrong password, then the right one; the passkey profile with its prompt cancelled, then approved | the wrong password marks the field wrong and stays locked; the cancel stays locked with no message; the right secret opens it |
| 9 | Settings → Lock: Strict security on, unlock, then close every wallet window and stop the background (Chrome: `chrome://serviceworker-internals` → Stop; Firefox: `about:debugging` → This Firefox → Terminate background script), check it shows stopped, and open the wallet; then off, unlock once, and the same again; then restart the browser | on: the lock screen after the background restart; off: the session stays open across it; after the browser restart, the lock screen whatever the setting |
| 10 | Export a full backup and an account file of each profile: the password profile's under its profile password, the passkey profile's under a file password of its own after its passkey approves | each file downloads; the passkey profile's 7-character file password is refused before any file exists |
| 11 | On the second install, restore each full backup with the password it was made under (the password profile's profile password, the passkey profile's file password), choosing the unlock method the restore offers, and switch each to Testnet; import each account file into another profile with the same password | the restored profiles show the same accounts and, after sync, the same balances; the imported account shows its original address; a wrong password is refused with no profile made |

**A step that fails** is a finding, written with the browser and its version, the build's version and commit, the step's number and what was done, the expected outcome above, what happened, the time, and a screenshot or a log export read first. It goes through § Triage below, class first; a suspected exploitable weakness goes to the orchestrator privately and nowhere else.

## Triage

1. **Class it first.** Before any evidence leaves the run's local directory, decide whether the finding is a suspected exploitable weakness. If it is, or might be: a private draft security advisory, nowhere else; only a count appears in any report, plan, issue or PR until the advisory is published. Nothing below copies its evidence anywhere public.
2. **Reproduce.** Replay the agent's `actions.jsonl` through the launcher, or the seed and plan of a seeded run (`plan.md` § Finding → reproduction). A finding that does not replay in three tries is recorded in the plan as unreproduced, with a one-line summary, and filed only if its evidence alone shows a broken property.
3. **Classify.** Harness artifact (fix the harness, no issue), product bug, behaviour the contract allows (record the contract in the plan), or conditions the wallet does not support (a closed `known-limit` issue).
4. **Grade** by OA-C5's severity.
5. **File** a public finding: dedupe (`gh issue list --state all --search "<words>"`), then an issue in the five sections (`implementations-plan/README.md` § Where open work lives), with excerpts that mask the run's secrets.
6. **Reduce.** Trim the action list by hand to the shortest one that still fails (`NULO_E2E_CHAOS_ACTIONS=<file>`); put it in the issue or the advisory.
7. **Guard.** The fix's PR adds the regression test in the cheapest layer that reproduces the failure (unit, composition, then e2e); the next wave re-checks it.
