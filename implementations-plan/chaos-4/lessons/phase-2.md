# Phase 2: the scenario list

Every run at retry 0, `T` = `cd apps/extension && bun --bun vitest run --retry=0`. Loads are the host's 1-minute average.

## Runs

- `T` scenarios file, first run: 30/33. Three break fixtures failed, none a product fault. Two were red at the right step and oracle, but their pattern named another message than the checker's ("reports <id> active"). The third installed its MAC spy before the method change ran, so the spy caught the change's own MAC check (`envelope MAC does not cover the DEK slot`) instead of the restore's. Fix: the spy is installed once the change is parked, before the restart.
- Second run: 32/33; the lenient stop's break fixture is red with "the service's active profile is none", and its pattern now says so.
- Third run: 33/33, 0.77 s of tests.
- Plan digest (seeds 1, 1001, 3001, 7001-7030, 7101-7105, 7201-7205 under three caps and three starts, plus a hand list through `planFromList`): identical at `origin/dev` and the head.
- `T` model test and both composition files, load 104: the model test's "the counter moves by one exactly at a mint … on Chrome" timed out at 5529 ms. Planning alone measures 3.07 s outside vitest at load 106 (3,000 plans, 75,000 steps). Filed #1327 (`flake`); Codex consult: give it the sibling's 180 s budget (option A), and the citation and surface cases too (4.7 s and 4.9 s outside vitest at load ~380). D22.
- The same three files after the budget, load 354: 339 passed, 1 skipped.

## What the scenarios found

No product fault. Every scenario ran as recon.md § Scenario map traced it. One reading to keep: a reveal held at its answer returns the words after a lock, by design (D15). A row transplanted from a live row's slots opens to the live row's master with no trusted DEK and no bearer, because the envelope MAC binds the row id.

## Harness notes

- A one-shot spy on `crypto.subtle.verify` catches the first HMAC verify after it is installed, whichever call makes it. Install it at the instruction the scenario names, not at the step's start.
- `ConfigStore` does not watch storage, so strict mode turned on for a booting worker goes through that worker's own config (`StepHooks.onBoot`), not a storage write.
- A row planted around the log holds needles (a slot, a salt) in a place no wallet write put them. `plant` records them, so O7 reads only what the wallet writes.
