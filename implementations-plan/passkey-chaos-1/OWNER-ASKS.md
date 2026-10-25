# Owner asks: passkey-chaos-1

Six decisions only the owner makes. None is about what a person sees in the wallet: this lane changes no screen. Each ask gives the options, what each means, the recommendation, and what the lane builds without waiting.

**What ships now, whatever the answers:** C1 (the seeded harness and its baseline on today's `dev`) and C2 (the agent session launcher, the charters and a pilot of three agents) depend on no ask. C3 and C4 wait only for passkey-unlock-1's A2 and A3 merges. C5, the campaign, waits for OA-C1, OA-C2, OA-C3, OA-C5 and OA-C6. OA-C4 is a CI change in its own PR after C5.

## OA-C1. The fleet: how many agents, in which waves

Each agent drives one isolated wallet session for one charter (CHARTERS.md). A session uses about one browser's worth of memory and one or two cores; the host keeps load1 under 150.

- **A, small:** one wave of 8 agents, 45 minutes each (6 agent-hours). Catches the obvious; thin on Firefox.
- **B, medium (recommended):** two waves of 12 agents, 60 minutes each (24 agent-hours), half on Chrome and half on Firefox, each of CH1 to CH9 run at least twice (the dApp flows stay with the seeded network file). Wave 2 starts after wave 1's findings are triaged, so wave 2 also re-checks fixes.
- **C, large:** three waves of 20 agents, 60 minutes each (60 agent-hours). More personas and repeats; triage becomes the bottleneck.

Whatever the size, the fleet starts only after C2.2's probe shows each agent confined to its session (CHARTERS.md § Fleet permissions); running agents without that confinement is a separate approval.

Also: which model the agents run on. Recommendation: Opus 5.5 for the hostile charters, Sonnet for the clumsy and impatient ones.

## OA-C2. The testnet pass

Someone drives a release-candidate build against unleashed's testnet app (`https://testnet.app.unleashed.systems`): create or restore profiles, connect, send, lock and unlock, restore on a second install. It is the manual pre-release smoke CLAUDE.md names, never a gate. It needs testnet funds and puts load on the build's own Testnet endpoint. It cannot run through the lane's harness, whose egress guard refuses every outside host by design.

- **A, skip:** the local campaign only.
- **B (recommended):** a manual pass by the owner, or by the orchestrator on the owner's word, once per browser, from a written checklist the lane adds to CHARTERS.md in C5, inside C5: after the local campaign's fixes land and before C5's acceptance. No new code.
- **C, agents:** two agents, one per browser. This needs a launcher mode without the egress guard, which is a plan change: the agents would hold the host's credentials while reading untrusted public pages, would sign public transactions, and would run a build that holds the Testnet endpoint.

Also: where the funds come from (a faucet, a funded account the owner names, or unleashed's bridge), and whether public transactions from new accounts are acceptable.

## OA-C3. The campaign's exit criteria

What must be true before passkey-unlock-1 closes and before a release carries the change.

- **Recommended:** on A3's merged head (A4 is words only): (1) 100 seeds per browser of the smoke chaos and 10 per browser of the network chaos, all green at retry 0, every action family completed at least 50 times per browser; (2) the fleet of OA-C1 run in full; (3) no open finding at the release-blocking severity (OA-C5); (4) every finding filed, with its reproduction, and each fixed one with its regression test merged; (5) the testnet pass, if OA-C2 says so, with no blocking finding.
- **Cost, estimated before C1.2 measures it:** a seed of 24 actions takes about 3 to 5 minutes on Chrome and 5 to 8 on Firefox (from the recorded times of the passkey and backup files). 100 seeds per browser is about 8 hours on Chrome and 13 on Firefox run one at a time, or about 1 and 2 hours on eight isolated workers in parallel. C1.2's measured figure replaces this estimate before C5.
- **Lighter:** 30 seeds per browser and one fleet wave.
- **Heavier:** 300 seeds per browser, and a second campaign after the fixes on the release candidate itself.

## OA-C4. Chaos seeds in CI

Today two fixed `send-chaos` seeds run in the required network lane, and the nightly draws a new one each night.

- **A (recommended):** a nightly job per browser runs the smoke profile chaos with a new seed each night (about 5 to 8 minutes per browser), gating the nightly's publish as send-chaos does. No fixed seed in a required lane.
- **B:** A, plus one fixed seed per browser in the required smoke lane (about 4 minutes per browser on every PR that trips the smoke filter).
- **C:** none; the campaign only.

A soak entry is not possible: the soak cannot run an armed file (CI.md § the soak). Whatever the choice, a red CI run prints only the seed, the step, the action and the property's id; the evidence is neither printed nor uploaded, and the triager replays the seed locally to see it.

## OA-C5. The severity that blocks the release

- **S1:** a secret leaves the wallet readable (a seed, a key, a password, `prfSalt` outside storage); a profile opens without its own secret; keys or accounts lost.
- **S2:** a profile its own secret cannot open; a session open after lock; a stuck flow with no way out; a stored row that reads differently from what the last completed action wrote.
- **S3:** a wrong screen or message, an error with no guidance, a pending state past its bound.
- **S4:** cosmetic.

Recommended: S1 and S2 block the release; S3 blocks unless the owner accepts it by name; S4 never blocks. A suspected exploitable weakness is handled privately, whatever its severity.

## OA-C6. The campaign's report

The orchestrator publishes it as a page. Recommended contents: the head tested; seeds and agent-hours per browser; coverage per action family and per flow; findings by severity, each with its issue and its status (fixed, open, known limit); what was not tested and why (PRF across devices, the toolbar panel on a Mac, real authenticators); the exit criteria, each marked met or not. Findings tracked privately appear only as a count until their advisory is published.

Alternative: a one-screen summary with the same numbers and a link to the plan.
