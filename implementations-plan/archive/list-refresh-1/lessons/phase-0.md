# Phase 0: planning consults

## Recon

- Two Explore agents (sonnet): one on the popup → worker call pattern and refresh UIs, one on cadence statements, the legal bump and e2e. Findings in `recon.md`.
- The lane brief's "ceiling moved with it" did not hold: the 24 h backoff step needs a ceiling of at least 24 h (plan F-2).

## Audit round 1

- Codex (gpt-6.1-sol, high, fresh session): conditional approve. Six findings: the `http-status` → "not reached" mapping and the "up to date" claim for `unchanged`; `SettingItem` sets no `aria-busy`; the gate tested an unbuilt or disarmed `dist`; qualify the 6.5 h target and the capacity inference; About's privacy notice and the store text are visible surfaces; OA-1's "at once" and its failure row. All accepted; the full-suite gate partly (D10).
- Opus (Plan leg): conditional approve. Eleven findings: § 5.11's "sooner after a failed attempt" is false from the fourth failure; the `aria-busy` claim; the page-test stub renders only `#right`; the control vanished with no tokens; ceiling tests cannot be red at the base for the right reason; fewer tests; conversion details (the `logger` property clash, the instance `name`); recon's e2e absence claim was wrong; offline presses push the schedule to a day (a known limit); `wrapDescription`; the smoke suite. All accepted; the suite as D10.
- Competing outline (cheapest-first, a `TokenService` delegate, a "checked" toast, the moved ceiling): rejected by both legs (D2, D4, D6).

## Final fresh pass

- Codex (gpt-6.1-sol, high, new session) on the consolidated plan and ledger: conditional approve, one condition: CLAUDE.md asks for the full smoke suite locally before a popup PR, and the Firefox suites when `tests/e2e/fixtures/**` changes; D10 had left both to CI. Accepted (D10, the gate). Resumed on the change: approve.
