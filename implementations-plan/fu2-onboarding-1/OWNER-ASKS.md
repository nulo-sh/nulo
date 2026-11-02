# fu2-onboarding-1: owner asks

Four asks. None concerns Ready (`#/onboarding/done`), the one surface arc 1 changes: arc 1 ships P93-17 and P93-49 word for word. OA-2 concerns arc 2 (the check); OA-1, OA-3 and OA-4 concern arc 3. Each arc builds its "what ships now" form and opens its PR; it merges on your answer.

## OA-1 (arc 3): the two "wallet" words left on Create and Import

- **Surface**: the onboarding Create page's submit button with a password (`CREATE WALLET`), and the onboarding Import page's title (`IMPORT WALLET`).
- **Why it is asked**: P93-30 B changes Create's title to `CREATE PROFILE` "so button and page agree", meaning Welcome's `CREATE PROFILE` button. Its text names only the title. Once it ships, Create's title reads `CREATE PROFILE` over a `CREATE WALLET` button, and Welcome's `IMPORT PROFILE` still opens a page titled `IMPORT WALLET` (its own button already reads `IMPORT PROFILE`).
- **Options**
  - **A (recommended)**: Create's password submit reads `CREATE PROFILE` (`CREATE WITH PASSKEY` stays), and Import's title reads `IMPORT PROFILE`. One word for the thing made, on every button and title.
  - **B**: Create's submit only; Import's title stays.
  - **C**: leave both as they are.
- **What ships now**: C. Arc 3 changes Create's title only, as P93-30 B says.

## OA-2 (arc 2): the words on the phrase check

- **Surface**: the new check in the onboarding tab, after "I saved it" on the recovery phrase step and before "You're in". P93-16 B fixes its shape (3 words by position, shuffled choices, "Do it later" kept) but not its words.
- **What it looks like**: the step row stays on Phrase. Under the title, one line. Then three groups, each labelled with a position and holding four word chips in a row (one is the word at that position, three are other words of the same phrase). Then a full-width button, disabled until each group has a pick. Then "Do it later" under it, as on the phrase step. A wrong set of picks shows one red line above the button and marks nothing; a right set goes to "You're in" and Home's Get started ticks "Save your recovery phrase". "Do it later" goes to "You're in" with its "not saved yet" line.
- **Options**
  - **A (recommended)**: title `CHECK YOUR` / `PHRASE`; line `Pick 3 words by their position.` (your own words from the pick); group labels `Word 3`, `Word 11`, `Word 20` (numbers as the phrase grid shows them); button `Confirm`; refusal `Words don't match. Try again.` (as the password fields say `Passwords don't match`).
  - **B**: A, with the phrase step's title kept (`YOUR RECOVERY` / `PHRASE`), so the title does not change between the two screens.
  - **C**: your own wording for any of the five.
- **What ships now**: A, on arc 2's branch. The PR carries its captures.

## OA-3 (arc 3): the popup's button, and the case with no tab to bring forward

- **Surface**: the toolbar popup opened before setup is finished (no profile yet, onboarding not completed). P93-64 B gives the sentence `Finish setting up Nulo in its tab` and "a button that brings that tab forward", but not the button's words. The popup finds its tab by the id it saved when the tab opened; if that tab was closed, today's redirect opens a new one.
- **Options for the button**
  - **A (recommended)**: `Go to the tab`.
  - **B**: `Open setup`.
- **Options for no tab found**
  - **A (recommended)**: the same sentence; the button opens a new setup tab, as the redirect does today. One screen for both cases.
  - **B**: when the saved tab is gone, the popup checks first and shows a second sentence, for example `Its tab is closed. Open it again to finish.`, with the same button opening a new tab.
- **What ships now**: A and A.

## OA-4 (arc 3): the passkey link on the two import pages

- **Surface**: the link `USE A PASSKEY I ALREADY HAVE`. It is one component under the passkey button on four pages: onboarding Create, the popup's new profile, onboarding Import and the popup's Import. P93-31 B names "both places" (Create and the popup's new profile) and says "the link reads “Use a Nulo passkey I already have”".
- **Options**
  - **A (recommended)**: the link reads `USE A NULO PASSKEY I ALREADY HAVE` on all four pages. It does the same thing on each, and stays one text.
  - **B**: only on Create and the popup's new profile; the import pages keep today's text. The component then takes its text from each page.
- **What ships now**: A.
