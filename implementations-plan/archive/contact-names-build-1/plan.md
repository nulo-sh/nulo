---
plan: contact-names-build-1
tier: light
status: closed (lands with its PR)
issues: none
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: one Sonnet Explore agent for recon; one Codex gpt-6.1-sol high read-only review of the plan; one Codex pass over the plan and the completed diff, then targeted verification (bounded work); one Codex pass over the address-book delta
base: origin/dev at 0aabc016d
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-24.
- **Status:** closed. One arc, one PR against `dev`, opened as a draft for the owner's sign-off on its frames; the merge that lands it closes the plan.
- **Shipped:** `isAddressShapedName` (`utils/contact-name.ts`), one rule on a name's stored form; the New and Edit forms refuse such a name with "A name can't look like an address. Use a word, like Ana." and keep Add contact and Save off; a contacts-file row is listed under Can't be imported with "Name looks like an address", judged on the name it would write (D9); `addContact` and `updateContact` refuse it, the kept name of an address-only update included; a full backup restores its rows as they are. A stored name that breaks the rule names nothing in `nameBookOf`, `AddressDisplay` or Send. Send matches a term written like an address only by whole address, prints the short address under every Recent name, and counts only own accounts and past sends as known. The windows are unchanged (pick 2). An app granted the address book receives a contact whose name breaks the rule with its own full address as the name (pick 4, D10).
- **Known limits:** none recorded here.
- **Open items:** none. OA-1 is answered and built ([OWNER-ASKS.md](OWNER-ASKS.md), D10).
- **Dropped:** none. **Lessons:** none promoted (`lessons.md` is at its budget); the build's gotchas are in [lessons/phase-1.md](lessons/phase-1.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# contact-names-build-1: a contact's name can't read as an address; Send matches a typed address whole

The owner's picks of 2026-11-24, built as signed and nothing beside them. One arc, one draft PR against `dev`. Paths are under `apps/extension/src/` unless they name another root; [recon.md](recon.md) holds the census.

## The picks

1. **A.** "Refuse it at entry, edit and file import, and never print a stored one. The name field turns red and says "A name can't look like an address. Use a word, like Ana." Add contact and Save stay off. A contacts file lists such a row under Can't be imported with "Name looks like an address"; renaming it there makes it importable. A full backup restores its rows as they are: a name already stored stays in Contacts, where you can rename it, and is never shown in place of its address anywhere else. The rule: the name contains 0x and four hex digits, or two hex runs joined by dots, after folding look-alike letters. It passes Ana, Oxford and J.R. Smith. It wrongly refuses Abe...Dad."
2. **C.** "Leave it as it is: @Ana, with the address behind a press." Nothing is built: the windows' chip, `AddressDisplay`'s press and every testid stay.
3. **A.** "Text typed like an address matches only a contact whose whole address equals it; typing An still finds Ana. Each Recent row shows its short address under the name. "You have not paid this address before. Review it carefully before you send." now also shows for a saved contact you have never paid."
4. **C, on the address book** (OA-1, answered 2026-11-24). The question: "A stored name that reads as an address, sent to an app you gave your address book: sent as stored (A), left out (B), or sent with the contact's own address as its name (C)". The pick: "Send such a contact with its own full address as the name. The app shows the true address where it would have shown the name."

## Outcome & Quality Bar

- **For whom:** a person saving, importing or paying a contact; a person approving a dApp request that names one.
- **Excellent:** every writer that takes a name from a person or a file applies one rule, on the name as it would be stored; a stored name that breaks it reads, everywhere but Contacts, exactly as an address with no contact does; Send never offers a contact for the characters of an address; ordinary names (`Ana`, `Oxford`, `J.R. Smith`, `Zoë Ångström`) are saved, imported, printed and matched as written.
- **Not built:** the windows' layout (pick 2); a rule on own account names.

## Architecture & Implementation

**The rule** (`utils/contact-name.ts`, `isAddressShapedName(name)`). Fold: lower case, a table of letters drawn like the hex digits, `x` and `0` (Latin `o`; Cyrillic а в е о с х ԁ; Greek α β ε ο χ ϲ), NFKD, drop combining marks, lower case and the table again (NFKD turns `ϲ` into `ς`, a mathematical capital into a Latin one, and a marked Cyrillic letter into a listed one). Refused when the folded name contains `0x` and four hex digits (`/0x[0-9a-f]{4}/`), or two hex runs joined by two or more dots, where a run is three hex characters or a `0x` with one to three (`/(?:[0-9a-f]{3}|0x[0-9a-f]{1,3})\.{2,}[0-9a-f]{3}/`; fixed-width runs, so no backtracking on a long name). Callers pass the stored form (`sanitizeContactName`).

**Writers.** `contact-rules.ts` gains `ADDRESS_LIKE_NAME` (the sentence) and `contactNameError` returns it before the duplicate check, so `canSubmitContact` keeps Add contact and Save off. `ContactFormFields.vue` takes `nameLooksLikeAddress`: the field gets `:error` and `:ariaInvalid`, and the sentence renders under it, wired as `ProfileNameField`'s refusal (`role="alert"`, the field's `aria-describedby`) and drawn as the signed frame draws it (a `type--body` line in `txt-danger`, testid `contact-name-address-like`). `NewContactPopup.vue` and `EditContactPopup.vue` pass it from the name field's error, ungated by "started editing", so an edit of a stored rule-breaking contact opens with the sentence and Save off. `classifyImportRow` returns kind `name` (after `invalid`) when the name the row would write breaks the rule, the file's spelling or, for a row matched by name, the saved one; not importable; `ImportContactsPopup.vue` lists it under "Can't be imported" with reason "Name looks like an address" and refusal toast "To select, change the name first"; the row's pencil and re-staging are unchanged, so a renamed row is judged again. `ContactService.addContact` refuses a stored name that breaks the rule; `updateContact` refuses the name the row would hold after the update (the new one, or the kept one), checked inside the lock on the row it read. `restore` is unchanged. The service error text never quotes the name.

**Print side.** `nameBookOf` skips a contact whose name breaks the rule; `AddressDisplay` does the same; each then falls to an own account's name exactly as for an address with no contact. That covers the approval and raised-fee windows, history detail and the developer Senders and Contracts pages. `send.vue` builds `recipientCandidates` from contacts whose names pass, so suggestions, Recent names, the committed row, Review and the fee sentence never carry one; `applyQueryContact` opens such a contact's address with no name.

**Send.** `matchRecipients` matches a term written like an address by whole address only; the test runs on the key name matching uses (`contactNameKey(term)` begins `0x` and a hex digit), so an invisible character or a compatibility form inside the term cannot reach a name. `SendPersonStep.vue` prints `send-recent-address` under the name on every Recent row. `isKnownAddress` counts own accounts and past sends, and takes no contacts.

**Address book.** `executeAztecGetAddressBook` answers a contact whose stored name breaks the rule with its own address as the alias (`item.toString()`, the `0x` + 64 hex the same row carries as `item`), every other contact with its name; same rows, order and shape. The wallet API's answer schema takes any string alias (`alias: z.string()`); no RPC, argument or schema patch changes.

**Stored shapes do not change.** No schema, migration or stamp; `stored-shapes/snapshot.test.ts` must stay green untouched, or the arc stops and reports.

## UI impact

Mockups: the signed frames, light and dark, in the PR's Frames table, named by surface below.

- **New contact, Edit contact.** A name breaking the rule turns the field red with "A name can't look like an address. Use a word, like Ana." in `txt-danger` under it; Add contact or Save stays off; an edit of a stored one opens that way. Frames: New contact.
- **Import contacts.** Such a row is listed under "Can't be imported" with "Name looks like an address"; a press toasts "To select, change the name first". Frames: Import contacts.
- **A stored name that breaks the rule.** The approval and raised-fee windows, history detail and the developer pages print the address, as for an address with no contact; Send's suggestions, Recent, committed row, Review and fee sentence print the address alone; the Contacts list shows the name, to rename it. Frames: the transfer sentence, the step's details, Authorization, history detail.
- **Send suggestions.** A term written like an address (`0x0c2b`) offers only a contact whose whole address equals it; `An` offers Ana. Frames: Send suggestions.
- **Recent.** Each named row shows the name, then its short address (`0x2f91…4a1b`). Frames: Send Recent.
- **Not-paid line.** "You have not paid this address before. Review it carefully before you send." shows for a contact never paid, as for an unsaved address. Frames: Send, the committed row.
- **The approval windows with an ordinary name:** `@Ana`, the address behind a press (pick 2), equal to the signed frames.
- **Not a wallet screen:** a granted app receives the contact's address as its name (pick 4).

## Security & Adversarial Considerations

- **Trust boundary.** A contact's name is untrusted display text from a person, a contacts file or a backup (`sanitizeContactName`'s contract). The rule holds at each writer that takes one from a person or a file; a backup is restored as it is (it carries the seed, so its holder already holds the wallet), and the print side holds for every stored row.
- **What the rule claims.** It reserves the printed shapes of an address (`0x` + hex, shortened forms joined by dots) through compatibility forms, marks and the listed look-alikes. It does not claim to know who a name means (`Exchange`, `Ana`), nor every script's look-alikes; the windows print the chosen name, by pick 2.
- **Send.** An address term never answers with a name; Enter on a hex prefix commits nothing; a contact never paid gets the not-paid line, which reads the wallet's own succeeded submissions, as for an unsaved address.
- **Address book.** An app granted it receives a contact whose name breaks the rule with the contact's own address as the name, so the rule holds wherever a stored name leaves the wallet.
- Frontend only: no dependency, permission, log line, crypto or stored-shape change. The service error carries no name (logging policy).

## Assumptions

**Facts** (read at `0aabc016d`; each holds with this change)
1. Every write path stores `sanitizeContactName`, cut to 25 (`utils/contact-name.ts`; recon table).
2. `canSubmitContact` refuses on any verdict `contactNameError` returns (`utils/contact-rules.ts`), so a verdict added there keeps Add contact and Save off.
3. `updateContact` keeps the stored name when none is passed (`service.ts`).
4. `nameBookOf` and `AddressDisplay` are the only places that build `@name`; Send names from `recipientCandidates` and `selectedContact` (recon).
5. `PayeeBlock` shows the not-paid line on `!known`, and `isKnownAddress` (`recent-sends.ts`) alone decides `known`.
6. Printed address forms carry `0x` and at least four hex digits, except the developer Notes page's `trimAddress(contract, 4, 4)` (`0x0c..4b5c`), which the dotted run with `0x` covers.

**Inferences:** no other contact name in the e2e or unit fixtures breaks the rule (confirmed by the gates).

**Asks** (OWNER-ASKS.md): OA-1, what an app granted the address book receives for a stored rule-breaking name; answered 2026-11-24, pick 4, built (D10).

## Phases

**Phase 1, build and unit tests.** As above, with the tests: `contact-name.test.ts` (one per refused class: `0x` + hex, dotted runs, a `0x` run before dots, each look-alike in the table, `ϲ` and `Ϲ` included, as one compact table, a mathematical capital, fullwidth forms, a marked `x`, the 25-character prefix; controls `Ana`, `Oxford`, `Box 0xford`, `J.R. Smith`, `A..B`, `Zoë Ångström`); `contact-rules.test.ts` (verdict, form cannot save); `service.test.ts` (add, update and the kept name of an address-only update refuse; restore keeps); `contact-import-rows.test.ts` (kind `name`, not importable, a renamed row imports); `contract-chips.test.ts`, `AddressDisplay.test.ts` (prints the address; `Ana` control); `NewContactPopup.test.ts` (sentence, `txt-danger`, button off) and `EditContactPopup.test.ts` (opens refused); `recipient-search.test.ts` (a hex term never matches a name, with an invisible character and a compatibility form inside it; its whole address still does; `An` finds Ana), `RecipientField.test.ts` (Enter on a hex prefix commits nothing; the press-and-blur test's second candidate is a contact at the account's own address, picked and asserted by identity), `recent-sends.test.ts`, `SendPersonStep.test.ts`, `send.test.ts` (an unpaid contact shows the line, a paid one not; `?contact=` of a rule-breaking name opens its address unnamed); `view-executor.test.ts` (a contact named `0x0c2b7e..4b5c` is answered with its address as the alias, `Ana` as `Ana`, through the wallet API's answer schema). Gate: `bun run lint`, `bun run typecheck:all`, those files, `stored-shapes/snapshot.test.ts` untouched and green, `copy-dash-ban`, `red-text-ban`, `bun run test:all`, the pre-PR gate (typecheck, test, lint, build), `bun run build-storybook --cwd apps/extension`. Pass: all exit 0.

**Phase 2, e2e and frames.** Smoke at `--retry=0` on Chrome: `contacts.test.ts`, `contacts-import.test.ts`, `send-keyboard.test.ts`, `type-roles.test.ts` (sweeps `send-recent-address`); `send-keyboard.test.ts` on Firefox; network on Chrome: `data-addressBook.test.ts` (the address book answer end to end). `send-keyboard`'s held-press test keeps its failure mode: a contact `Fan` at the account's own address, a press on the account row while the blur takes the contact, the payee name proving the pressed pick. No new scenario. Frames by the capture method of the options (Storybook scenes on a local, uncommitted story), light and dark, popup and window sizes; pixel diff against the signed frames, every difference listed in the lane's scratch `match.md`. Pass: specs green; no difference left unexplained.

**Phase 3, review and delivery.** Post-implementation below, then `bun run test:ci-gating`, the frames commit and its removal, the draft PR, close-out.

## Decision ledger

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | One predicate in `contact-name.ts`, on the stored form | a check per screen | every writer and reader asks the same question of the same string |
| D2 | Fold: lower, table, NFKD, drop marks, lower, table | NFKC only, as the options' probe | a marked `x` or hex letter reads as itself at 13 px; the first pass keeps `ϲ`, which NFKD turns into `ς`. Accented names join `Abe...Dad`'s accepted over-refusal (`Béa...Dédé`) |
| D3 | The dotted run may be `0x` + one to three hex | three hex only; `0x` + none | the Notes page prints `0x0c..4b5c`; `0x..4b5c` has one hex run, outside the signed rule |
| D4 | `updateContact` checks the row's resulting name under the lock | checking only a passed name (the prototype) | the pick refuses the name an address-only update keeps |
| D5 | Send filters at `recipientCandidates` | stripping names per surface | one source names every Send surface |
| D8 | Send classifies the term's name key | the raw term | a term the name key reads as `0x…` must never reach a name (`0x` + ZWNJ, fullwidth `０x`) |
| D6 | The held-press e2e and the `RecipientField` namesake move to a same-address contact | deleting the test | an address term matches only whole addresses; the hold still guards which candidate is chosen |
| D7 | The refusal carries `aria-invalid`, `aria-describedby` and `role="alert"`, and is drawn as a `type--body` line in `txt-danger` | `Text height="150"`, as `ProfileNameField` | the ARIA wiring is the house pattern (an accessibility call under the owner's 2026-10-19 delegation); `Text`'s line-height scale has no `normal`, and 1.5 drew it 3 px taller than the signed frame (build deviation) |
| D10 | A granted app receives an address-shaped name's contact with its own address as the alias, built from the row's `item` | sent as stored; the row left out | the owner's pick 4 (OA-1); the alias and the item cannot differ |
| D9 | An import row is judged on the name it would write | the file's spelling only | a row matched by name writes the saved spelling, and keys fold `ϲ` and `σ` together while the rule does not (diff review, reproduced) |

## Review verdicts

**Diff, Codex (`gpt-6.1-sol`, high, read-only; session `01a20e33`).** Round 1: changes required. F1 material, the import judged the file's spelling and could write a saved spelling of the same key that reads as an address (`0x0ϲ2b` saved, `0x0σ2b` in the file); with `isSender` the sender registration ran before the service refused the write: accepted, reproduced, fixed (D9) with its regression. F2 nit, four comments: accepted. Round 2: approve. Frames: every ordinary-name frame equals its signed frame to the pixel; the address-shaped name differs only where the picks combined say it must (Send's committed row and Recent, step details, history detail).

**Plan, Codex (`gpt-6.1-sol`, high, read-only; session `01a20e06`), round 1: changes required.** F1 material, NFKD turns `ϲ` into `ς` before the table: accepted, verified (D2, a table pass before NFKD). F2 material, the raw-term test misses `0x` + ZWNJ and fullwidth forms that the name key reads as `0x…`: accepted, verified (D8). F3 minor, the unit namesake needs identity-based selection: accepted (Phase 1). F4 minor, `0x` with no hex is beyond the signed rule: accepted (D3, `{1,3}`). F5 nit, accented over-refusal: accepted (D2). Confirmed: writer and reader coverage, D4, D5, D7, OA-1 left out, no stored shape touched, neither regex superlinear. Round 2 (resumed): F1-F5 resolved; one material regression, a mathematical capital (`𝐂`) lowercases only after NFKD: accepted, verified (a second lower-case pass after NFKD). Round 3: approve.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `0aabc016d`, bounded-work form: one Codex pass (`gpt-6.1-sol`, `high`, read-only) over this plan and the completed diff, with the standard's adversarial ask, its two verbatim rules, and the lane's targets (a writer that skips the rule; a name that passes it and still reads as an address at the screens' sizes; an ordinary name it refuses; a stored rule-breaking name printed anywhere but Contacts; a hex term that still matches a name; a lost testid; a sentence in the diff or the PR body that describes a past state instead of the rule); then targeted verification of each material fix.

## Delivery

One PR, draft, left a draft, from `contact-names-build-1-a1` off `origin/dev`: `feat(contacts): a name can't read as an address, and send matches a typed address whole` (87 characters). It closes nothing. The body quotes the four picks, shows the frames (pushed in one commit, removed in the next), states the orchestrator match line from the lane brief, the validation runs and the accessibility call (D7). Close-out rides on the PR: Outcome, `index.md` line moved, `git mv` into `archive/`. `lessons.md` is at its budget: retire a line before adding one, or add none.

Seeds (never run; the orchestrator owns delivery): `/goal contact-names-build-1: phases 1-3 green per plan.md` · `/loop 30m check the draft PR's checks; stop when green`.
