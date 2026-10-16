# OWNER-ASKS: token-list-live-check

No wallet surface changes. The new text is the `prepare` step summary the owner reads before approving `sign`, and its content is what the decision on #382 (page 19, option A) names.

## O1: when the step first runs on GitHub (operational, not UI)

- **Surface:** `publish-token-list.yml` on `dev`. `prepare` runs only on `dev`, so no run on the feature branch can exercise the new step.
- **Options:** (a) wait for the next real publish, where the step runs for the first time; (b) after the merge, dispatch the workflow on `dev`, read the live section, then reject `sign` in the `token-list` environment.
- **What each looks like:** (a) nothing extra; the first live section appears with the next list change. (b) one run with a pending `sign` approval that the owner rejects; no envelope, no publish PR.
- **Recommendation:** (b), once, if the owner wants the step proven before a list change depends on it.
- **What ships now:** the arc ships proven by the unit tests and a local run against the same public node; it does not wait on O1.
- **Answer:** owner, 2026-10-16, decision page 24: option A, one dispatch on `dev` after the merge, `sign` rejected.
