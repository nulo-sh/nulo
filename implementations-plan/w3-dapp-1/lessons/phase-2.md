# Phase 2 (arc 2): a call string the card cannot print whole

## Consults

- 2026-11-03, Codex arc 2 plan r1 (`gpt-6.1-sol`, high, read-only) on the widened § Arc 2: conditional approve. (1) UTF-8 `cd 8f` decodes to U+034F, a default-ignorable combining mark `safeWire` keeps, so the print check alone would admit an invisible character a grant refuses today; D5 now refuses `\p{Default_Ignorable_Code_Point}`. (2) Tests: a nested struct and array, a four-byte emoji, and `readableGrants` then `callSurface` reading the original string once. (3) Injectivity holds per `str<N>` and as exact text, not as glyphs. (4) Comments. All accepted. It confirmed A for OA-2, display placement (every decoded string reaches the card through `callSurface`), and a field past 0xFF as unreadable against the pinned serde (`type_impls.nr`, `u8` deserialization).

## Facts checked

- Bun: `/\p{Default_Ignorable_Code_Point}/u` matches U+034F, U+00AD, U+3164, U+200B, U+E0001, U+FEFF; `new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })` keeps a leading BOM and throws `TypeError` on a lone `e9`.
- No smoke e2e file opens the execute window: it needs a dApp, so its e2e gate is the network files that open it.
