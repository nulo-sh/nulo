# list-refresh-1: owner asks

**What ships now**: the arc builds the six-hour cadence, the privacy patch and option A below with the recommended words. The PR stays open until you pick; options B and C reuse the same code and words, so a pick other than A changes only the page's template.

## OA-1. Settings → Tokens: where the manual refresh sits, and what it says

**Surface**: Settings → Tokens ("Manage Tokens"). Today it shows the TOKENS label, one row per token, and the "Import token" button.

**What the control does, in every option**: with the Terms accepted, a press starts a check of the token list host, or joins the check already running. Without them, nothing is downloaded and the line says why. While it runs the control shows a spinner and ignores more presses. Then one line says what happened, and stays until the person leaves the page or presses again. A new list adds its default tokens as a timed refresh does.

**Options**

- **A (recommended).** A row of its own below the token rows (or below "No tokens yet" when there are none), above "Import token", like the rows that act in place on a network's page. Title "Refresh token list", a refresh glyph on its left (a spinner while it runs), and a second line: "Default tokens and their prices" before a press, then the result. A line such as "Checked about every six hours" was dropped: it is untrue while the Terms are not accepted and after repeated failures, when retries slow to once a day.
  ```
  TOKENS 4
  [ token rows ]
  ( ⟳ ) Refresh token list
        Token list updated.
  [        Import token        ]
  ```
- **B.** A second full-width button under "Import token", "Refresh token list", in the quieter secondary style, with a spinner while it runs. The result is one line under it, with no line before a press.
- **C.** A refresh icon in the page header, beside the title, named "Refresh token list" for screen readers and in its tooltip, as the token page's balance refresh is. The result is one line under the header, above TOKENS, with no line before a press.

**Words** (the same in every option; any of them is yours to change):

| What happened | Line |
|---|---|
| While it runs | Checking the list |
| A newer list was taken | Token list updated. |
| The host serves the list the wallet holds | No newer token list. |
| The host could not be reached (offline, no answer in 10 s) | Could not reach the token list. Try again later. |
| The check did not complete: the host answered with an error, or with a list the wallet did not take (a bad signature, an older list), or the browser could not check it | Could not update the token list. Try again later. |
| The Terms are not accepted ("Not now" on the Terms sheet) | Accept the Terms to download the token list. |

The two "Could not" lines are in the danger text colour; the others are grey. One line, "Could not update the token list. Try again later.", can serve both failures if you prefer one. "No newer token list." is used instead of "Your token list is up to date." because the wallet only knows the host had nothing newer; a host can hold back a list.

**Recommendation**: A. You can name it to a person ("Settings, Tokens, Refresh token list"); it shows the result where the person pressed; and it does not compete with "Import token". C hides the action behind an icon, and B adds a second full-width button under the page's main one.

**Also visible, from the privacy patch you asked for on #1608**: Settings → About shows the new policy version, and "Privacy Policy updated" for an install that saw the older one, as on every policy patch.

**Privacy policy**: § 5.11 says "Once you have accepted the Terms, you can also ask for it in Settings → Tokens". It names the page, not the control, so it holds for every option.

**Captures**: added when the arc is built (Chrome, light): A as built, with tokens and with none, then B and C.
