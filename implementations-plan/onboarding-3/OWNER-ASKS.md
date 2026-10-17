# Owner asks: onboarding-3

The arc builds every signed pick in full (decision pages 28, 29, 30, 33 and 35; see plan.md § Signed scope). Each ask below is a visible choice the picks do not settle. Each has a "what ships now" line: the arc builds that line, and an answer that lands before the PR opens ships with the arc. The PR stays a draft until the owner tests the build (the owner's note on P33-01). The PR's light and dark screenshots show every "what ships now" as built.

## OA-1. Where Copy sits on the phrase grid (the owner's note on P33-02)

**Surface:** the onboarding phrase step and Settings › Backup › Recovery Phrase.

| Option | Looks like |
|---|---|
| **A. A Copy button under the grid** | the grid, then a full-width outline button "Copy"; on the tab, then "I saved it" and "Do it later" |
| B. A small "Copy" link at the grid's top right | the grid card carries a text link in its corner, in the accent |
| C. Copy beside "I saved it" | two buttons on one row: "Copy" (outline) and "I saved it" |

Copying puts the whole phrase on the clipboard in one tap, shows the toast "Recovery phrase copied", and clears the clipboard after 60 seconds, as the wallet's other secret copies do.

**Recommendation: A.** It is the plainest form, and it is separate from the action that clears the reminder. **What ships now: A.**

## OA-2. The welcome lines: tagline pairs for the next page (the owner's note on P33-04)

**Surface:** the onboarding Welcome screen. It ships unchanged: "Access the internet-native coordination layer." and "Private by default. Sovereign by design." These are copy proposals only, and nothing is built.

1. "A wallet for Aztec. Everything is recorded." / "What can be read is up to you." (the landing's own words)
2. "Your money on a public network, read only by you." / "Private by default. Sovereign by design."
3. "The private wallet for Aztec." / "You decide who sees what."
4. "Hold and pay on Aztec, out of public view." / "Private by default. Public when you choose."
5. "A wallet that keeps your balance to yourself." / "Private by default. Sovereign by design."

**Recommendation: 1.** It matches nulo.sh word for word, and its second line is a promise, not a slogan. **What ships now: today's two lines.**

## OA-3. "Hide" on a password wallet before its phrase is saved

**Surface:** Home, the Get started card. The record says the password item "cannot be hidden". Drawing D shows "Hide" on the card but does not show what Hide does while the phrase item is still on it.

| Option | After Hide |
|---|---|
| **A. The card stays with one row** | "Get started" with only "Save your recovery phrase"; the Hide link is gone |
| B. The row becomes a calm banner | the card goes; a quiet one-line banner above the balance ("Save your recovery phrase", "Save phrase"), which turns urgent once the wallet holds funds |
| C. No Hide until the phrase is saved | the card shows no Hide link while the phrase item is on it |

**Recommendation: A.** It keeps the one place the reminder lives, and Hide still removes everything that can go. **What ships now: A.**

## OA-4. When each item counts as done, and what "holds funds" means

**Surface:** Home, the Get started card and the urgent banner. The picks say "items disappear when done", and give a rule only for the two backup items.

What ships now:
- **How Aztec works** is done once it has been opened.
- **Get Fee Juice** is done while the selected account holds Fee Juice, public or private. The item comes back if both reach zero.
- **Make proofs faster** is done once the wallet has reached Presto on this computer. Settings › Proving already keeps that flag.
- **Back up this wallet** (passkey) is done when the wallet shows "Backup downloaded successfully" for a Full Backup. That message means the browser accepted the file, and any Full Backup the page offers counts.
- **Hide** is for good, per profile. Nothing brings the card back.
- **Holds funds**, which raises the urgent banner, means any token on Home or any Fee Juice above zero, for the selected account on the selected network.
  - While balances load, the card and the banner wait.
  - A failed balance read shows the calm row.

Other answers could be "Get Fee Juice is done once tapped", "funds means tokens only", or "funds counts every account".

**Recommendation: as shipped.**

## OA-5. Where "How Aztec works" opens until nulo.sh has the page

**Surface:** Home, the "How Aztec works" item. P33-03 A is a nulo.sh page with the clips. That page does not exist, and the arc files an issue for the landing.

| Option | Until the page ships |
|---|---|
| **A. The landing's "How it works" section** | opens `https://nulo.sh/#see` ("The blockchain records that something happened. You decide who can read what."), with no clips |
| B. Hold the item back | the card has three items until the page ships |
| C. The future address | opens the planned page's address, which shows "not found" until it ships |

With A, a person who opened the item does not see it again when the page ships. **Recommendation: A.** **What ships now: A.**

## OA-6. The step row on paths without the phrase step, and on Import

**Surface:** the onboarding tab's step row (01 Terms, 02 Create, 03 Phrase, 04 Ready, as drawn).

- **Ships now:** the four drawn cells on every path. A passkey wallet and an import go from 02 to 04: Ready shows 03 as passed. On Import, cell 02 reads "Create".
- **Other option:** three cells on those paths (Terms, Create or Import, Ready), and cell 02 reads "Import" on Import. The row would then show a different count before and after the method is chosen.

**Recommendation: as shipped.** The row stays the same on every screen.

## OA-7. The popup's "New profile" page

**Surface:** Settings › Profiles › New profile, in the popup. It shares the method switch with onboarding. P30-03 B (Passkey first) was signed on the onboarding page.

- **Ships now:** the popup keeps Password first and selected.
- **Other option:** the popup also shows Passkey first and selects it.

**Recommendation:** match onboarding (Passkey first), so both places offer the same default. It ships as is until the owner says so.

## OA-8. The Settings phrase grid: columns, and words in the clear

**Surface:** Settings › Backup › Recovery Phrase. Today, after the password, the phrase sits in a one-line field that hides the words until "Show".

- **Ships now:** the numbered grid in three columns (the popup is 360 px wide; the tab's grid has four). The words show as soon as the password is accepted, as on the tab step. The agreement screen and the password stay. The five-minute auto-close stays.
- **Other options:** two columns (larger words); keep a "Show" step over the grid.

**Recommendation: as shipped.**

## OA-9. The store listing's Home capture

**Surface:** the Chrome Web Store and Firefox Add-ons screenshots, which a network test stages from an imported, funded wallet. With this arc, that Home would show the urgent banner ("Your funds have no backup") and the card.

- **Ships now:** the capture test stages an established wallet through the wallet's own screens. It reveals the phrase, then taps Hide, so the Home frame stays as today.
- **Other option:** capture Home with the Get started card, to show it to new users.

**Recommendation: as shipped.**

## OA-10. Imported password wallets

**Surface:** Home, after importing a wallet from its recovery phrase or a backup file.

- **Ships now (the record as written):** "Save your recovery phrase" shows until the phrase is revealed in Settings, and the banner shows once the wallet holds funds. A wallet restored with funds therefore opens on "Your funds have no backup".
- **Other option:** a wallet imported from its recovery phrase starts with the item done, since the person just typed the words.

**Recommendation: the other option** (moderate confidence). The banner would otherwise tell someone who just typed their phrase that they have no backup. **What ships now: the record as written.**

## OA-11. When the phrase cannot be shown after Create

**Surface:** the onboarding tab, right after "Create wallet" on a password wallet. The wallet reads the 24 words back from the new profile. That read is not expected to fail. If it does (an internal error, or the password was edited while "Creating…" ran), the phrase step cannot show.

| Option | After a failed read |
|---|---|
| **A. Go on to Ready** | Ready as usual. Home's "Save your recovery phrase" stays, and Settings shows the phrase after the password. |
| B. A message on the step | "We could not show your phrase. You can save it later from Home." with Continue. These are new words. |

**Recommendation: A.** The case should not happen, and the reminder already covers it. **What ships now: A.**

## OA-12. A clipboard warning on the tab's phrase step

**Surface:** the onboarding phrase step, under Copy. Settings' Recovery Phrase screen carries three "Keep in mind" warnings. One of them is "Some applications on your PC can have access to your clipboard and read a recovery phrase". The drawn tab step has none.

The wallet clears the clipboard 60 seconds after a copy, but only while the page stays open. "Open wallet" closes the tab, so words copied there can stay on the clipboard. Today the same is true when the popup closes on Settings' screen.

| Option | Looks like |
|---|---|
| **A. As drawn** | no warning on the tab step |
| B. One line under Copy | "Apps on this computer can read the clipboard. Paste it into your password manager, then copy something else." |
| C. Settings' three warnings | the "Keep in mind" block under the grid |

**Recommendation: B.** Copy exists for a password manager (the owner's note), and the one place the copy outlives its page should say so. **What ships now: A.**
