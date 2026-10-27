# Phase 0: measurement, prototypes and the panel

- Measurements, the A/B rounds and the tree dumps: `recon.md`. Scratch harnesses lived outside the repo; the prototype patch was reverted before the plan was written.
- `jsDocParsingMode: ParseNone` in copy-dash's own parse: no gain in vitest within the host's noise (827 to 1246 ms against 903 to 1017 ms with only the expression check). Dropped (D6).
- A file-level copy-dash check (`—`, `\u`, `&#`, `&mdash`) admitted 430 of 862 files and saved nothing measurable: the admitted files are the large ones. Its script-level form (D1) is what remains.
- Codex plan audit round 1 (gpt-6.1-sol, high, read-only, fresh session): reject, three demonstrated findings and one ask, all accepted (plan § Audit verdicts). One was self-inflicted: the tool that wrote `plan.md` decoded the two backslash-u escapes in its content into the characters they name, so the escape fixtures the plan named held no escape. Repaired with edits that write the backslash by code point; check escapes in a written file with `grep`.
- Opus Plan leg (opus, read-only): conditional approve; six findings, all accepted, three fact corrections (plan § Audit verdicts). It and Codex disagreed on log-payload; the plan leaves it unchanged (D4) because its candidate files carry about 87% of its parse time.
- Codex final pass (resumed session 01a1…): approve, no remaining material findings.
