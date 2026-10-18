# Phase 3 — #653 three wraps

- Before any CSS edit, the network run was the red proof and the "before" pictures. The window check failed with `from` at 3 lines, indented 52 px; `to` indented 37; `amount` indented 294. The Send check failed with the dollar line at 2 lines and the balance beside it. The registered-token grant showed the same orphan ("60" alone under FROM).
- After the change, `type-roles-windows`, `send-amount-exact` and `authwit-lifecycle` passed at retry 0 on Chrome (645 s) and Firefox (753 s).
- Token row red proof: with base `TokenCard.vue` built, the seeded figure read `{"lines":3}`; with the 190 px cap and `anywhere`, two lines on both browsers.
- The row's `token-fiat` lands after Home's sweep: each row reads its own quote apart from the hero. The check waits for the element before reading it (a cause, not a timeout).
- `runRequest` went over the cognitive budget (17 > 15) with the new check inline. Extracting `expectFullArguments` fixed it; no suppression.
- `bun run test` caught a pinned digest of `auth-registry/service.ts` in `identifier-sites.expected.json` (`action_operations`, "re-attest, then re-pin"). Re-attested: the producer hits and evidence are unchanged, since the registry gained an event and no operation producer. Re-pinned in its own commit.
