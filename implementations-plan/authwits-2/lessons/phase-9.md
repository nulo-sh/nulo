# authwits-2, phase 9: arc 3's gate and the Codex pass

- Static gates at retry 0: lint 0, `typecheck:all` 0, the touched tests and bans 13 files 391 passed, 1 skipped, `check:plans` 0.
- Smoke `type-roles`, armed build, retry 0: Chrome 14 passed, 1 skipped, 133.5 s; Firefox 15 passed, 219.9 s. The page's check meets the stand-in node's 400 there and changes nothing.
- Network, proverless, retry 0, `authwit-lifecycle`, `authwit-variants`, `authwit-consume-smoke`, `popup-escape-layered`: Chrome 8 passed, run 517.0 s; Firefox 8 passed, run 484.1 s.
- Codex pass (gpt-6.1-sol, high, read-only, bounded form): conditional approve, four findings, all fixed (§ Audit verdicts). The useful one: a sealed read captures storage before it decrypts, so a list snapshot can predate a delete whose event arrives first; `useEntityCrud` now replays events that arrive during a fetch over its snapshot.
- The replay pushed `useEntityCrud`'s `refresh` to cognitive complexity 19; two small helpers (`land`, `stopRecording`) bring it back under 15 with no suppression.
- Codex round 2: conditional approve, one finding (the flag read's race when joining another window's check), fixed with the event counter Codex proposed.
- After the Codex fixes, at the final code head `afd188a92`, retry 0: lint 0, `typecheck:all` 0, the settings pages (the five `useEntityCrud` lists), auth-registry and the bans 43 files 947 passed, 1 skipped; smoke `type-roles` + `settings-routes` (armed builds) Chrome 20 passed, 1 skipped, 115.9 s, Firefox 21 passed, 193.5 s; network, the same four specs, Chrome 8 passed, run 297.7 s, Firefox 8 passed, run 371.1 s.
