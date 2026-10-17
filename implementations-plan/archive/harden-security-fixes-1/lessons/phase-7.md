# Phase 7: dependency log level and the frame scrub (C7)

- `scrubHex32` replaces a `0x` hex run of 32 bytes or more (a longer run holds one), in strings and object keys of `trim`'s output; the wrapper is `offscreen/frame-logger.ts`, wired at both sites in `offscreen/index.ts`. Red proof: the wiring test (`offscreen/index.test.ts`, mocked `createPxeOffscreen` and `documentLogger`) fails with either wrap removed.
- Gate deviation: the plan's negative grep `LOG_LEVEL.{0,3}verbose` matched an upstream fallback in the offscreen prover chunk (`{…}.LOG_LEVEL||"verbose"`), dead once the define sets the level. The bundle check reads the define's own text instead: `LOG_LEVEL:.warn` in 6 chunks, `LOG_LEVEL:.verbose` in none.
- `trim` caps an error message before any wrapper sees it, and walks a field element into `{ asBigInt }`: the frame scrub also takes a hex run ending at the cap's `…` and a bigint of 2^128 or more.
