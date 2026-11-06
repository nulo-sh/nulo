# Phase 3 — the notice

- 2026-11-05: gate green. Subscribe `bun test` 91/91 (the `CONSENT_VERSION` pin reads 1.2); landing test 172 pass, 1 skip; `bun run test:all` 0; `scripts/check-no-local-paths.sh` ok.
- Deviation (D12): `scripts/legal-pages.test.ts` "the notice … its history row carries its header's version and date" compared `parseDocumentHeader`'s `effective` (`null` for a placeholder) with the raw row cell (`«FILL: effective date»`), so a dated notice was the only one it accepted. The renderer and the main-only launch gate are built for a draft on dev; the row reader now maps a placeholder cell to `null`, as the header parser does. Control: `NULO_LAUNCH_GATE=1` reds "the website notice main would publish has no blank left" on this tree.
