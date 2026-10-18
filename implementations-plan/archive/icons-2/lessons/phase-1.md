# Phase 1: before pictures

- 2026-10-18 first launch skipped: the load check sat outside the launching command and load1 had risen past 150, so nothing ran. The runner now waits for load inside the command it launches.
- 2026-10-18 second run: 25 of 28 captures, then `navigateToSettings(…, "networks")` timed out on the Glossary page, a sub-page with no nav tab. Fixed in the scratch spec with `navigateByHash` (as `store-captures` does); the partial set was deleted.
- 2026-10-18 third run (`raw/4d873ae6`, Chrome, prover on): exit 0, 318 s; every band's mark check passed against the base table (Home 1 row: private + public; token page: both; fee row: public; strip and review: public, private, private; Edit network: the 18 px network glyph); 28 PNGs and `marks.json`. Spec removed from the tree.
