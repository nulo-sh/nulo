# Phase 2b: viewers in shadow roots, `style-src` without `'unsafe-inline'`

## Release (2026-10-16)

The orchestrator released arc 2b with a correction: its earlier message ("struck: P12-03 was vetoed") was wrong. Page 12's sign-off record (2026-10-15T14:16Z) holds P12-03 = null, the page's value for a veto-list item the owner left standing, as P12-02 and P12-04, both of which shipped; #101's Decision block reads "accepted from the veto list". So A6 and D28 resolve: this arc builds item 15, its PR says `Refs #101`, and the close-out PR says `Closes #101` (D-orch-11). R3 holds nothing (#212 closed by #255 on 2026-10-10); R5 holds nothing (#156 shipped in #534). Branch `chain-endpoints-2b` off `chain-endpoints-close-out` (78d22cca), dev merged at 7697c376.
