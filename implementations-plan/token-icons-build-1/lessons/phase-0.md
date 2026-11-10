# Phase 0: planning consults

## Consult 1: Codex plan audit (gpt-6.1-sol, high), session 01a1c68c

- Verdict: conditional approve. Findings R1 (the SVG substring rule is bypassable through XML character references and CSS escapes; the image context is the boundary), R2 (size does not bound render cost; PNG unused), R3 (README provenance is a tree-check guarantee only), R4 (capacity misstated: 16 per chain, 1,024 total; 16 entries with 2 KB SVGs reach 64,785 B), R5 (artwork defaults and awaiting/terminal Activity rows are owner calls), R6 (phase 1 gate fails; import-closure pins the closure; test:components path), R7 (TransactionsList is the History intermediary).
## Consult 2: Opus Plan audit (opus), round 1

- Verdict: conditional approve. Findings: the SVG blocklist is bypassable (namespace prefix, character references, CSS escapes) and misses animation and filters → an element allowlist on literal text with `&`, `\`, `<!`, `<?` refused; phase 1's gate is red with L3 in `checkSource` (T-1) → L3 in the tree check; arc 2's decode assertion would red the release lane's artifact run (T-2); I1 arithmetic; show the letter marks to the owner before publish; keep awaiting and terminal Activity rows (the layout's lifecycle invariant).

## Disposition after both legs

- Ledger D1 to D12 in plan.md. Contested: D2 (Codex A, Opus B → B), D6 (Codex none, Opus allowlist → allowlist), D7 (Codex ask, Opus include → include), D9 (Codex ask first, Opus ship and show → ship and show, decided at the `sign` approval).

## Consult 3: Codex final fresh pass (gpt-6.1-sol, high), session 01a1c6a3

- Verdict: conditional approve; upheld D2, D7, D9. M1: `filter` as a presentation attribute or inline CSS passed the element allowlist (demonstrated, 194-character data URL). Fixed by refusing `filter` in every spelling with both counterexamples as tests; claims reworded to what the checks prove. Resumed: approve.
