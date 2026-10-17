# dapp-boundary-1: owner asks

## OA-1: may a dApp profile a transaction's gate counts again?

Issue: #699.

- **Surface.** No wallet screen. A dApp that calls `profileTx` (a developer tool that counts circuit gates) gets an answer from the wallet; nothing in the popup changes.
- **What ships now.** Every dApp `profileTx` is refused with the wallet's typed answer `{ code: -32601, message: "Unsupported wallet method: profileTx", data: { walletErrorCode: "UNSUPPORTED_METHOD" } }`, before any work. The lane brief asked for a profile "with a stubbed signer"; no profile mode can run without the account's real signature (plan.md, Brief claims), and the brief refuses every mode that needs it.
- **Option A (ships now).** Keep the refusal. A dApp developer profiles against a local development wallet instead.
- **Option B.** Allow `profileMode: "gates"` only, never a proof. The wallet signs inside itself, as a send does, and returns only function names, gate counts, circuit kinds and timings. The signature and the witnesses never leave the wallet; the counts and timings follow the transaction's private execution, and a dApp would receive them without a window.
- **Recommendation: A.** Gate counting is a development task, the refusal is what the brief's rule gives, and B returns execution metadata without a window.
