# Phase 5: the runbook moves to a skill

- 2026-10-13: the gate as first written (`sed -n '555,751p'` against every line after the front matter) also reports `0a1` and `197d197`: line 751 is the blank that separated the runbook from the next CLAUDE.md section, and the skill keeps the blank line its siblings put after the front matter. Trimming both framing blanks (`555,750p`, `tail -n +6`) leaves exactly `5c5`, the D4 sentence; the plan's gate now names the trimmed form.
- The harness listed the `release` skill as soon as `SKILL.md` was written (I1 holds).
- CLAUDE.md: 115,423 → 86,787 bytes.
