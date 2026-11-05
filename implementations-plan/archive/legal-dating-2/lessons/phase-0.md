# legal-dating-2: phase 0 (planning)

- 2026-11-04 — recon: one Explore agent (sonnet), read-only. Confirmed the placeholder set, that no test pins a `terms.md` or `privacy.md` history row's date, and that the extension renders no effective date. Persisted in `recon.md`.
- 2026-11-04 — Codex plan audit (gpt-6.1-sol, high, read-only), one session resumed twice. r1 `conditional approve`: G1 numstat without a range, a miscount of placeholder lines, a word-diff expectation that misread the version lines, a checkbox bound that proved nothing, and a close-out ordering gap; all accepted, G2 became a byte compare against the base under the planned `sed` edits. r2 `conditional approve`: a clean `git grep` exits 1 and a `for` loop hides an earlier `cmp` failure; both accepted. r3 `approve`.
- 2026-11-04 — G2 negative control: the extracted block, run under zsh on the unchanged base, flags all five files and ends `G2 fail=1`.
