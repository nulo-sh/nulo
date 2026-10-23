# recipient-cap-1: owner asks

Surface: Send → recipient field → the suggestions that open when a person types. Pictures (popup 360 × 600, Chrome, 1,000 contacts, one letter typed, light and dark) and their `manifest.json` are in `~/.cache/nulo-backlog/recipient-cap-1/shots/`: `A-*`, `B-*`, `C-*` and `today-*`. One answer can cover all five asks ("A as recommended").

## O1. How should the suggestions handle a long contact list?

Typing one letter with 1,000 contacts takes about a quarter second today and over a second with 5,000, because every match is drawn. Each option brings that keystroke back to what it costs with 10 contacts (about 60-90 ms here).

| Option | What a person sees | One keystroke, 1,000 / 5,000 contacts (median) |
|---|---|---|
| Today | every match, in a list that scrolls | 251 ms / 1,169 ms |
| **A (recommended, with O5)** | at most 50 matches, and under the list one line: "Keep typing to narrow 951 more matches." The line shows only when more than 50 match. | 61 ms / 74 ms |
| B | exactly what today shows: the list still scrolls to every match; only the rows in view are drawn | 65 ms / 68 ms |
| C | at most 50 matches, and nothing says more exist | 69 ms / 77 ms |

The matches come in no set order today (contacts as stored, then your own accounts), so the 50 that A and C show are not the alphabetically first 50.

What A and C give up: a name that is part of 50 or more other matching names may not be reachable by typing. For example, with 50 contacts named "Ana …", the contact named just "Ana" can fall past the 50, and typing all of "Ana" still matches all 51; only pasting its address finds it. O5 fixes that. B never hides a row, so it has no such case.

Recommendation: **A, with O5**. This probe found no speed difference between A and B; A tells the person more contacts match, and with exact names first a name is reachable by typing it in full, unless 50 or more contacts share that exact name. C hides that more exist. B is the right pick if nothing on this screen should change: it keeps today's list exactly, at about three times A's code and one more test on both browsers.

What ships now: nothing. Arc 1 waits for this answer.

## O2. With A or C, how many rows at most?

Recommendation: **50**. With the cap alone, a search with 50 matches or fewer looks exactly as today (O5 changes the order at any count), and 50 rows cost what 10 do here (65 ms against 67 ms, medians). 10 or 20 would shorten more lists for no measured gain.

What ships now if unanswered: 50.

## O3. With A, the line's words

Proposed: "Keep typing to narrow 951 more matches." ("1 more match" when one is left; the number is grouped, as in "4,951"). One sentence, no em dash, no new dotted term. A screen reader hears the same sentence. Alternative: "951 more contacts match this search." (it does not say what to do).

What ships now if unanswered: the proposed sentence.

## O4. With A or C, should your own accounts come first?

Today the list shows matching contacts first, then your own accounts ("Account 1"). With a cap, a search that matches 50 or more contacts pushes your accounts out of the list. Also today, a contacts file that someone persuades you to import can hold contacts named like your account, listed above it. Listing your own accounts first removes both.

Recommendation: optional, not needed for this fix: with O5, typing an account's full name brings it to the top, below only contacts with that very name. Say yes if your own accounts should never sit below look-alike contacts.

What ships now if unanswered: today's order.

## O5. With A or C, should exact name matches come first?

A contact or account whose whole name equals what you typed would be listed first, then the other matches in today's order. This changes the order at any match count, even with two matches, and so which suggestion Enter picks when no row is highlighted. Without it, the case in O1 ("Ana" among 50 "Ana …") can stay unreachable by name.

Recommendation: **yes** (with A or C).

What ships now if unanswered: today's order, and the O1 limit stays.
