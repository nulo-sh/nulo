# Phase 6: a2's e2e and captures

- `same-token-concurrent-sends` is proverless-gated: `bun run e2e:agent` refuses it with FATAL unless `NULO_E2E_PROVERLESS=1`.
- The review mounts its own `PayeeBlock` in `#popup` beside the form's, so `readSendInputs`, `chooseRecipient` and `expectNothingSent` scope to `send-page`.
- `waitForReviewReady` reads `data-ready` and `aria-disabled`, never `disabled`: Send now is never natively disabled.
- The Tab walk on the review visits exactly the close and Send now, on every state measured (named, pasted, public, paid privately, paid publicly with the warning).
- A Space press held across the arm cannot be driven in a committed spec without a seam that holds the arm open in production code. A scratch page on both engines settled the platform half: an unguarded button clicks once on the carried release; refused at keydown and keyup it does not, and a fresh Space or Enter still clicks.
- The local network has no price feed, so every capture's fee reads in Fee Juice alone ("~0.00002 FJ").
- Review rounds, the e2e side: round 1 scoped `expectNothingSent` to `send-page` and corrected a spec comment; round 2 corrected the skill (`aria-disabled` announces, the guards enforce); round 3 touched no spec.
- The first send's info toast sits over Send now's footer inset and covered the re-ask review's fee sentence in its capture; the capture closes it on Home before opening the review.
