# privacy-cache-line-1: phase 0 (planning)

## Recon

- One Sonnet explorer: every list and price fetch, their RequestInit, the tests that pin them, and every `1.2.1` mirror. Result in [recon.md](../recon.md). No claim of the lane brief failed.

## Consults

### Round 1 (2026-10-20)

- **Codex** (gpt-6.1-sol, high, read-only; session `01a15b87-1124-74f3-acd2-ecd1303f2014`): conditional approve. One P2: the handoff omitted AMO's pasted policy copy. D2: keep the placeholder; § 4's paragraph carries the date, no dedicated line. Found no misrepresentation; agreed the § 5.2 singular stays (owner wording).
- **Opus Plan leg**: conditional approve. P2: D2 needs a § 4 item naming 1.2.2 (the paragraph assumes no version yet, never names AMO, and `git grep «FILL` mixes these lines with the Terms blanks held for 1.0.0; a 0.x promote is ungated). P2: AMO. P3s: `remote-code.md:110` cites `legal/privacy.md:391-392`, which the insertions move (verified); D4 overclaims; patch vs material unaddressed; A2 contradicted OWNER-ASKS; the word-diff gate step cannot fail.
- **Resolution**: all accepted except Codex's "no dedicated line", rejected on Opus's evidence (plan D2, D3). The § 4 item and the citation fix are the two edits outside the lane (A2).

### Final fresh pass (2026-10-20)

- **Codex** (gpt-6.1-sol, high, read-only, new session `01a15b94-ca5a-7f50-a5ec-af0f2c342c0a`): approve, no P1 or P2. Upheld D2 and the § 4 item; the two out-of-lane edits are required maintenance, not scope creep.
