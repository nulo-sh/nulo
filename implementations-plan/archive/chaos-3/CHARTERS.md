# Charters, brief and triage: chaos-3, arc 2

Arc 2's fleet wave, adapted from the campaign that ran waves 1 and 2 (`implementations-plan/archive/passkey-chaos-1/`, evidence only). The orchestrator spawns the fleet; each agent gets one charter, the per-agent brief below, and the session commands (`apps/extension/tests/e2e/README.md` § Agent sessions). An agent never files an issue, pushes, or reads the Testnet endpoint constant; it writes findings to its session's `findings.jsonl` with the steps that led there and the outcome it expected.

## Per-agent brief

> You drive one isolated Nulo wallet through its session directory for 60 minutes, as the persona and the area your charter names. Your only shell command is the launcher's `cmd` on your own directory; your only reads are inside it.
> - Drive it as a person would: `snapshot`, `click`, `fill`, `press`, `open`, `close`, `pick-file` and the `passkey` faults. Use `do <action>` only to reach a starting point quickly, before your first direct command.
> - Every value typed into a password, file-password or recovery-phrase field becomes a needle the leak scan looks for: type real-looking secrets there and nowhere else.
> - Run `oracle` after anything surprising and before `end`. A finding is anything an oracle reports, or anything a person would call wrong: a screen that says something untrue, a control that does nothing, a state with no way out. Write the outcome you expected beside it with `report`; the session keeps no model of the wallet.
> - The test authenticator approves every prompt silently. A fault (`passkey refuse|no-prf|other|hold`) applies only to the next command that drives its page: set it right before the press that prompts. "Use a password instead", Unlock method's buttons and Full Backup's agreement prompt on the press itself, so a fault set after it meets nothing; a step that ran "with no prompt" is your fault's timing, not a finding.
> - "Use a passkey I already have" asks the browser to pick among every passkey it holds: set `passkey other <profile>` first to choose which one answers; an unchosen pick over several passkeys is refused at once and reported `incomplete`.
> - On Chrome the anchor page `p0` holds every passkey: a passkey step on another page is refused at once, `close` refuses `p0`, and the authenticator holds three passkeys, so a fourth create is refused with an `incomplete` line. Charters that open many windows during passkey steps run on Firefox.
> - Use the whole session: when an area is exhausted, vary the order, the persona's mistakes, the faults and the windows, and go again. The session ends itself at its deadline; `end` stops it early on purpose only.

## Fleet permissions

The host's sandbox does not confine a process and agents share one user, so the boundary is each agent's tool configuration. Each agent is spawned exactly so (`<worktree>` the worktree's absolute path, `<dir>` the session's), its session started at spawn so its 60 minutes count from there:

```bash
cd <dir>
env -i HOME="$HOME" PATH="$PATH" LANG=C.UTF-8 USER="$USER" CLAUDE_USAGE_MODEL=opus \
  claude-usage run best -p "<per-agent brief + charter>" --model opus \
  --permission-mode default --permission-prompts none \
  --tools Bash,Read --strict-mcp-config --setting-sources "" --safe-mode \
  --allowedTools "Bash(bun <worktree>/apps/extension/scripts/e2e/chaos-session.ts cmd <dir> *)" "Read(/<dir>/**)" \
  --output-format stream-json --verbose > <transcript> 2>&1
```

The working directory is the session directory, never the worktree (Claude Code approves reads inside its working directory without a rule). `--setting-sources ""` and `--safe-mode` keep the user's rules, hooks and instructions away; `env -i` leaves the shell no credential variable (files under `$HOME` stay as readable as the allow rules make them); `--permission-prompts none` refuses whatever would ask. Never `--dangerously-skip-permissions` or `bypassPermissions`. Before the wave, probe the exact spawn line on one live session per browser, with a link planted in its `files/` pointing into `apps/extension/src` and a stopped session as "another session". A headless agent makes one tool call per item, exactly as written; the transcript (`--output-format stream-json`) is the evidence, not its report. It must run `cmd` on its own directory and a Read inside it, and refuse every other item: `cat`, `ls`, `find`, `grep`, `head` and Read under `apps/extension/src` and `apps/extension/dist`; the dist copy, directly and by `../`; the runner's log; another session (Read, `cat ../…`, `cmd <other>`, `cmd <dir>/../<other>`); the planted link; a canary file planted under `$HOME` outside the directory; writes inside and outside the directory (`>`, `| tee`); `gh`; `git -C <worktree> push` and `status`; `cd <worktree>/apps/extension/src && ls`; `start`; `bun -e`; `printenv`; `curl`; and `;`, `&&`, `$(…)` and backtick injection. A fixed command under the same line shows `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN` and `SSH_AUTH_SOCK` absent. Check first that the installed CLI still accepts `--permission-mode default` and `--permission-prompts none`. Record the result in `lessons/phase-2.md`. This boundary is a tool configuration, not isolation: a process of the same user acting outside it can do what the user can.

## Personas

- **Hostile:** wrong secrets, files from other profiles or older versions, truncated or edited files, another profile's passkey, the same action repeated after it was refused.
- **Clumsy:** wrong passwords, cancels at every prompt, back and close at every step, half-filled forms, the wrong file.
- **Impatient:** double clicks, closing the popup mid-step, a background restart mid-step, two windows doing two things at once.

## Charters

| ID | Area | Persona | Faults | Browser |
|---|---|---|---|---|
| CH1 | Create (password, passkey, "I already have") and the recovery phrase stage | clumsy | refused and no-PRF prompts | Chrome |
| CH2 | Lock, unlock, switch profile, strict mode, background restart | impatient | held prompts, restarts | Firefox |
| CH3 | Full backup export and restore, each unlock choice | hostile | truncated, flipped and foreign files, wrong passwords | both |
| CH4 | Account files of both methods and imported accounts | hostile | foreign and edited files, another passkey | Chrome |
| CH5 | Reveal and re-import the recovery phrase under each unlock; compare accounts | clumsy | refused prompts | Chrome |
| CH7 | Unlock method changes, every direction, interrupted | impatient | cancels mid-change, restarts, a second window | Chrome, Firefox ×2 |
| CH8 | One passkey for several profiles | hostile | another profile's passkey, deleted profiles | Firefox ×2 |
| CH9 | Leak hunt: everything that leaves (backups, account files, logs, log export) | hostile | none | Chrome |

Twelve agents, six per browser: Chrome CH1, CH3, CH4, CH5, CH7, CH9; Firefox CH2, CH3, CH7, CH7, CH8, CH8. Profiles made before the update are no charter: a session starts from an empty wallet, and the `pre-update` seeds cover them.

## Triage

1. **Class it first.** Before any evidence leaves the session's directory, decide whether the finding is a suspected exploitable weakness. If it is, or might be: a private draft security advisory, nowhere else; only a count appears in any report, plan, issue or PR until it is published.
2. **Reproduce.** `bun apps/extension/scripts/e2e/chaos-session.ts replay <dir>` on the session's own armed dist. A finding that does not replay in three tries is recorded in the plan as unreproduced, with one line, and filed only if its evidence alone shows a broken property.
3. **Classify:** harness artifact (fix the harness, no issue), product bug, behaviour the contract allows (record the contract in the plan), or conditions the wallet does not support (a closed `known-limit` issue).
4. **Grade:** S1 a secret leaves the wallet readable, a profile opens without its own secret, keys or accounts lost; S2 a profile its own secret cannot open, a session open after lock, a stuck flow with no way out, a stored row that reads differently from what the last completed action wrote; S3 a wrong screen or message, an error with no guidance, a pending state past its bound; S4 cosmetic.
5. **File** a public finding: dedupe (`gh issue list --state all --search "<words>"`), then an issue in the five sections of `implementations-plan/README.md` § Where open work lives, with its session, command number and replay result, and excerpts that mask the session's secrets.
6. **Reduce:** for a finding a seeded run can reach, the shortest action list that still fails (`NULO_E2E_CHAOS_ACTIONS=<file>`), in the issue or the advisory.
7. **Guard:** the fix's PR adds the regression test in the cheapest layer that reproduces it.

## Testnet pass

The owner's: #1189's checklist. No agent and no harness run of this lane touches Testnet or a funded account.
