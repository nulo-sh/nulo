# wrap-1: phase 1 (arc 1)

- The red proofs came from the base copies: the four component cases (scan halves) and SE1 at its 240 px banner check, on base builds in both browsers. SE1's red listed three texts clipped by `home-scroller`, the banner's title among them: the long name widened the whole banner past Home's scroller.
- The wall-clock looked 4 s worse on the first after-run (SE1 17.6 s against 11.5 s). Paired runs at the same host load (~140) gave SE1 13.7 s with the base file and 14.4 s with the new one, step by step equal (`expectFitsNarrow` on the banner 2.25 s in both). The gap was host load, not the change.
- `held32` was measured by writing the builder's held-account sentence into the real warning's text node. That is a synthetic sentence in the real box, labelled so in the PR. The real held path needs an imported key on a chain no seed serves, and no smoke helper builds one.

## Codex loop

- **Round 1, Codex, gpt-6.1-sol, high, read-only (session 01a18d6e): clean.**
- **Round 1, Opus 5.5 (general-purpose): findings, all accepted.**
  - Two exact-object pins also froze unrelated declarations; they became `toMatchObject`.
  - The comments said a name "is" one word; they now say it "can be".
  - The `.warning_block` comment claimed a flex item "never shrinks below" min-content, which is false once `min-width: 0` is set. It now names the automatic minimum.
  - The 32-`W` held mount half was redundant with the existing "Savings" case.
- **Round 2, Codex, resumed: clean.** It verified the fixes and found no regression.
