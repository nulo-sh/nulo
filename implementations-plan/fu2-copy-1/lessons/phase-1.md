# fu2-copy-1: phases 1 and 2 (arc 1)

## Reproduce

- The smoke capture spec reached Settings › Lock, New account, New contact and Edit profile on the base armed build; each shows the old words (`screenshots/*-before.png`).
- Holdings and Import token need the network harness. On the base build Holdings' line read "Prices unavailable" without a seeded quote, and the spec's Disconnect all step never opened its menu. The source had moved on by then, so the lab's own frames stand as the before pictures for Holdings ("1 tokens") and Import token ("Already exist"). Disconnect all at one session is proven by its component test, as the plan allows.

## Implement

- T1-T4 red on the base copy (`751defc1d`), green after (`54fa135ee`). A second "1 tokens" pin at `holdings.test.ts:477` surfaced on the first full run and was updated with the rest.
- T5's execute-window singular sits in `call-surface.test.ts`, not `OperationCard.fallback.test.ts`: `rawToggleLabel` is a pure export, so the cheaper layer proves it.
- The connected-apps test stubs the menu by its component name, `DropdownRoot`; a `Dropdown` stub never applies.
- A signed commit hung on the SSH agent; `env -u SSH_AUTH_SOCK git commit` signs with the key file directly.

## Store (D5)

- The caption fits its column on four lines; the rule did not fire.
- Screenshot 4's popup capture still showed strict mode's earlier line beside the new caption. One run of the opt-in `store-captures` spec re-captured all five; only `captures/security.png` is kept (it differs in the strict line and the sandbox's random address), and only screenshot 4 re-renders differently.

## Review

- **Round 1, Codex** (gpt-6.1-sol, high, session 01a19d6f): approve, no finding.
- **Round 1, Opus 5.5** (general-purpose): conditional approve. Settings search reads a row's description, so the signed strict line dropped "secure" and "unlock" (both now synonyms, pinned); New sender's verdict had no test (added, red on the old literal); the constant's comment overclaimed (reworded); the store address mismatch is disclosed.
- `audit:vue` caught what the Phase 1 gate could not: `scripts/e2e/profile-chaos-model.test.ts` cites source lines by number, and an added import moved one. Phase 1's `vitest run src` does not reach `scripts/`.
- **Round 2, Codex** (resumed): approve; one wording nit on the comment, taken.
