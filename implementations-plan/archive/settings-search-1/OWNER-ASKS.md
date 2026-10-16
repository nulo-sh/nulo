# Owner asks: settings-search-1

#591 is signed: decision page 28 (P28-07 A) and page 29 (P29-05 A, "build it as drawn"). Five details are outside the three mockups. Each has a "what ships now" line, which is what the arc builds if the ask is still open when its PR opens.

## OA-1. What a result for a row on the Settings list opens

**Surface:** the search results, for the 16 rows that sit on the Settings list itself (Accounts, Contacts, Tokens, Back up profile, Delete profile and the others). The mockups draw only rows from a sub-page (Display).

| Option | You type "export" and open "Back up profile" |
|---|---|
| **A. As the decision reads** | The field empties, the Settings list comes back, scrolls to "Back up profile" and outlines it for a moment, inside its box (OA-4). One more tap opens the backup page. The keyboard focus is not moved: the next Tab starts from the top of the popup. |
| **B. Open the row's page** | The backup page opens at once, as a tap on the row does. Nothing is outlined. |

A result from a sub-page (Full-height popups) works as drawn in both options: the Display page opens with the row outlined.

**Recommendation: B.** The result row shows a chevron, which promises the row's page. A teaches where the row lives but costs a tap and can read as if nothing opened.

**What ships now: A**, the decision's literal "opening the owning page with the row highlighted".

## OA-2. The words when nothing matches

**Surface:** the Settings list, below the field, when no row matches. The lane brief allows "one plain line"; its words are open.

| Option | Line |
|---|---|
| **A** | No settings found |
| **B** | No settings match "fulll" (repeats the typed text) |

**Recommendation: A.** It is shorter, and the typed text is already in the field above.

**What ships now: A.**

## OA-3. The synonym list

**Surface:** which rows a word finds. Synonyms are never shown. Your examples were "fullscreen", "side panel", "theme", "appearance", "export". The list avoids "full" everywhere except the two rows mockup b shows, so "full" finds exactly those two.

| Row (where) | Synonyms |
|---|---|
| Accounts | wallet, address, add account, import account, hide account |
| Contacts | address book, people, recipients, import contacts, export contacts |
| Tokens | assets, coins, add token, import token, balances |
| Connected Apps | dapps, sites, sessions, permissions, disconnect |
| Networks | chain, rpc, node, endpoint, testnet |
| Fee Payments | fee, gas, sponsor, fee juice, paymaster |
| Proving | presto, prover, proof, speed |
| Lock | auto-lock, timeout, session |
| Back up profile | export, backup, recovery phrase, seed phrase, save |
| Change password | password, passphrase |
| Privacy | prices, fiat, usd, explorer, coingecko |
| Display | appearance, theme, dark mode, light mode, layout |
| Developer | debug, logs, advanced |
| Glossary | help, terms, definitions, dictionary |
| About Nulo | version, contact, support, terms of use, privacy policy, licences, feedback |
| Delete profile | reset, remove, erase, wipe |
| Lock now (Lock) | lock |
| Strict security mode (Lock) | password, security |
| Auto-lock Timeout (Lock) | auto-lock, timeout, minutes, session |
| Show fiat values (Privacy) | prices, usd, dollar, coingecko |
| Block Explorer (Privacy) | explorer, links, aztecscan |
| Privacy mode (Privacy) | fee, hide fee |
| Theme (Display) | appearance, dark, light, dark mode, light mode, colour, color |
| Open as Side Panel (Display, Chrome only) | side panel, sidebar, panel, dock, fullscreen |
| Show network name (Display) | network, chain, header |
| Full-height popups (Display) | fullscreen, full screen, tall, expand, height |
| Disable animations (Display) | motion, reduce motion, animation |
| Show incoming transfers (Display) | received, receipts, incoming, activity |
| Hide dust (Display) | dust, small balances, spam, threshold |
| Developer Mode (Developer) | developer, advanced |
| Indicate Failures (Developer, developer mode on) | errors, warnings |
| Debug Mode (Developer, developer mode on) | debug, logging |
| Logs (Developer, developer mode on) | log viewer, errors |
| Account State (Developer) | notes, authwits, contracts, senders, pxe |

**Recommendation:** this list. Add or remove words in your reply; a word change is one line in one file.

**What ships now:** this list.

## OA-4. The outline on a row inside a bordered list

**Surface:** the momentary outline (mockup c) on a row that sits inside a bordered box: the 16 rows of the Settings list (under OA-1 A) and Lock now on the Lock page. Mockup c draws a free-standing Display row, with the outline 8 px outside the row. A bordered box cuts off anything drawn outside it, so mockup c's outline would show as two stray lines with no sides.

| Option | Look |
|---|---|
| **A. Inset** | The same tint and the same accent line, drawn just inside the row's edges, with no outer glow. It fades the same way. |
| **B. No outline in a box** | Only the tint shows, and it fades. |

Free-standing rows (Display, Privacy, the Developer rows and the Lock rows below Lock now) keep mockup c's look in both options.

**Recommendation: A.** It reads as the same highlight, and the keyboard focus ring of those rows is drawn the same way.

**What ships now: A.**

## OA-5. Back from an opened result

**Surface:** the Settings list, after you open a result and press the back arrow.

| Option | What you see |
|---|---|
| **A. An empty field** | The Settings list as it is when you first open it, with the field empty. |
| **B. Your search again** | The field still holds "full" and the results show. This keeps the typed text in the page's history, so it needs a place to live while you are away. |

**Recommendation: A.** It needs nothing stored, and the list is one short word away.

**What ships now: A.**

