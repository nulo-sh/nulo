# dynamic-token-list-2: questions for the owner

One ask. The arc ships without it; the warning ships in its own PR once this is signed, and that PR closes #383.

## W1. The warning on a flagged token

**What ships now.** Nothing renders. The signed list can flag a token, the wallet verifies the flagged set with the rest of the list, and on a wallet built after the flag a replayed older list cannot drop it. A flagged token is never seeded, never named in the connect window's "Nulo knows" list and never priced from the list. A person who already holds one sees an ordinary row until W1 ships.

**Surfaces.** Each place a flagged token shows:
- Home (`TokenCard` rows);
- Holdings;
- the token page;
- the Send token picker;
- the Send form (`SelectTokenCard`).

A flagged token is matched on its network and contract address, whoever added it: the list, the person, or a dApp.

A static mockup of both themes (Option A's rows and banner, Option B's badge), drawn over the real design tokens and type roles, goes with the planner's report to the orchestrator. It is not a build of the extension.

### Option A (recommended): a red line on each row, and a banner where you act on the token

- **Rows** (Home, Holdings, Send picker). The second line, which today shows the fiat value or the name, reads "Flagged as a scam" in the danger text colour, as the "Couldn't refresh" and "Couldn't set up" lines do now.
- **Token page and Send form.** An error `Banner` above the content. Title: "Nulo flagged this token as a scam". Text: "Its name and balance can be fake. Do not buy it or follow links that promote it."

```
Home row, dark theme                         Home row, light theme
┌───────────────────────────────────────┐    ┌───────────────────────────────────────┐
│ (U)  USDC                    1,000.00 │    │ (U)  USDC                    1,000.00 │
│      Flagged as a scam                │    │      Flagged as a scam                │
└───────────────────────────────────────┘    └───────────────────────────────────────┘
 line 2: --txt-danger #ff534b on #141312      line 2: --txt-danger #b3261e on #ffffff

Send form, either theme
┌───────────────────────────────────────┐
│ (!) Nulo flagged this token as a scam │   icon: --red #f03c3c; surface: --nulo-surface-low
│     Its name and balance can be fake. │   text: the Banner's own text colours
│     Do not buy it or follow links     │
│     that promote it.                  │
├───────────────────────────────────────┤
│ USDC                               ▾  │   SelectTokenCard, unchanged
└───────────────────────────────────────┘
```

Both colours already pass AA in their theme: the theme contrast test enforces `--txt-danger`. No new colour or type role is needed.

### Option B: a filled "Scam" badge beside the symbol

- **Rows.** A `Badge variant="error"` reads "Scam". The second line keeps the fiat value or the name.
- **Token page and Send form.** The same banner as A.
- **Cost.** The badge is white text on `--red` in the light theme, which measures about 3.4:1, under AA for text this small. It would need a new, darker fill token, and that is a design-system change.

### Option C: banners only

- **Rows.** No change.
- **Token page and Send form.** The banner as in A.
- **Cost.** The smallest change, but it does not meet "a warning on the flagged token's rows" from decision P17-08.

### Sub-questions (recommendation first)

1. **Order.** Flagged rows keep their place: pinned first, then by value. The alternative sinks them to the bottom.
2. **Holdings fold.** A flagged token with a zero balance stays behind the fold, as other empty rows do. The alternative always shows it.
3. **Send.** Sending a flagged token stays allowed, with the banner: moving it out is harmless. The alternative blocks Send.
4. **Words.** "Flagged as a scam" for the row line. The alternatives are "Reported scam" or "Nulo flags this token".

### Recommendation

Option A, with sub-questions 1 to 4 as first listed. It reuses the red second line a person already reads on Home ("Couldn't refresh"). It passes AA in both themes with existing tokens. It puts the warning wherever the token can be acted on.
