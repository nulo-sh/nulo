# Phase 0: planning consults

- Recon: one Sonnet reuse sweep (six capabilities) and one Sonnet dependency read. The sweep found that `stale-session.test.ts:34` pins `disconnect-request` as forwarded from any tab (P3 flips it).
- Reproducers: five scratch tests at `8ae2c06a4`, each red on the base and each beside a control that passes. The first try of P1's test passed on base: its fixture addresses were `{ toString }` stubs, which `JSON.stringify` writes as `{}`. Real `AztecAddress` instances, as the dispatch parse hands them over, made it red.
- Codex r1 (`gpt-6.1-sol`, high): conditional approve. Took outline B for P1 (delete the opening line), A elsewhere; asked for P5's second stub and a race test where a late pull meets a newer profile.
- Opus r1 (Plan agent): conditional approve. Asked for P1's entry in its own group, I2's reason corrected, F4 checked on Firefox 153, and the network spec framed as a no-regression check.
- Checking F4: Firefox 153.0.4's `omni.ja` (`ExtensionParent.sys.mjs`, `getSender`) sets `sender.origin` for content scripts from the document principal, and 153.0 is the manifest minimum. The relay's `sender.url` fallback is therefore not reached on a supported browser; P4 shrank to correcting the note that said otherwise (D4).
- Final Codex pass (fresh session): conditional approve, then approve after narrowing P3 to disconnect requests and P5 to the silent-restore clear. It also caught that deleting P1's opening line moves an existing read-ordering pin from 1 to 0 for NO_FROM, a tighter assertion.
