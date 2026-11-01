# password-strength-1 owner asks

The rule is signed (#1401, page 94, P94-08, option C). The words are not. The arc builds the recommended form of each ask; its PR opens ready and the orchestrator holds the merge until the owner signs OA-1 and OA-2.

## OA-1: the hint set and its bands

**Surface**: the line under a new password field (OA-2 lists where), in its place and style today: body text, grey, one line. No colour, layout or button changes. The form accepts exactly what it accepts today: 8 characters and a matching repeat.

**Recommended set** (one sentence each, no em dash). The line resolves in this order, as today: length, then match, then strength. The strength line appears once the two fields match.

| When | Line |
|---|---|
| Under 8 characters (unchanged) | At least 8 characters |
| The two fields differ (unchanged) | Passwords don't match |
| Weak, repeats (`aaaaaaaa`, `abcabcabc`, 12 of the same emoji) | Easy to guess: repeated characters |
| Weak, a run (`abcdefghij`, `98765432`) | Easy to guess: characters in order |
| Weak, a keyboard row (`zxcvbnm,./`) | Easy to guess: a keyboard pattern |
| Weak, a common password or a variant (`12345678`, `qwertyuiop`, `Password1!`, `TestPassword123!`) | Easy to guess: a common password |
| Weak, no single cause (`longenough`, `congratulations`, `kettle-violet`) | Easy to guess: make it longer |
| Good (`blue7Kettle!`, `Nulo-wallet-7`) | Good password |
| Strong (`silver-otter-lamp`, `maple.river.42`, 12 different emoji) | Strong password |

"Long enough. Don't forget it." is retired: "Strong password" now means the estimate, and a long repeat no longer reads strong.

**Bands.** The meter is zxcvbn, which estimates how many guesses an attacker needs. Someone who steals the encrypted profile or an exported file guesses offline; at zxcvbn's rate for that case (10^4 guesses a second, about one current graphics card against this wallet's key derivation, moderate confidence):

| Estimated guesses | One card needs | A (zxcvbn's bands) | B (recommended) |
|---|---|---|---|
| under 10^8 | under 3 hours | weak | weak |
| 10^8 to 10^10 | 3 hours to 12 days | good | weak |
| 10^10 to 10^12 | 12 days to 3 years | strong | good |
| 10^12 and up | over 3 years | strong | strong |

B is a conservative product heuristic, not a measured cracking time: a stolen wallet is worth renting many cards for. Where A and B differ: `TestPassword123!` (A good, B weak, a common password), `kettle-violet` (A good, B weak), `blue7Kettle!` (A strong, B good). Both are cautious with short random strings: `q8Rt!vP3` reads "Easy to guess: make it longer".

**Known limit** (either band): the password list is ASCII, the word list English and the keyboard shapes Latin. `йцукенгшщзх` (a Russian keyboard row) and `contraseña123` read good under B and strong under A; today both read "Strong password". Filed as a closed `known-limit` issue at close-out.

**Options**:
- A1: the set above with band A.
- B1 (recommended): the set above with band B.
- B2: B1, but a strong password over 24 characters keeps "Long enough. Don't forget it." (two sentences, against the one-sentence rule).
- B3: B1 with one weak line and no reason ("Easy to guess"): 5 lines instead of 9.

**Ships now**: B1, in the open PR, held for sign-off. Captures of each line on Create profile (light, Chrome) and the longest line on Change password are in the PR body.

## OA-2: where the set shows

**Surface**: `newPasswordHint` is one function, rendered by seven fields, not the two the issue names: Create profile (first run and later profiles), Change password, Settings → Unlock method (passkey to password), Import secret and Import full backup (the new profile's password), and the file password of an account or full-backup export. The lane brief left "the import flow" out of scope.

**Options**:
- A (recommended): all seven show the new set. Each one sets a password that protects encrypted data an attacker can guess offline (a stolen profile, an exported file).
- B: only Create profile and Change password. The other five keep the length-only line, so `aaaaaaaa` still reads "Strong password" there, through a second hint function.

**Ships now**: A.

## OA-3: the English word list's data licence

**What**: without English words, one long English word reads strong (`congratulations`, `constitution2026!`). The fix is `@zxcvbn-ts/language-en`'s common-word list. The package is MIT; that list is derived from OpenSubtitles under ODC-BY (attribution). The package's `NOTICE.md` carries the attribution, and the build's third-party notices file ships it with the extension. ODC-BY is a data licence, outside the code-licence allowlist, which reads only the package's MIT.

**Options**:
- A (recommended): ship the list with its notice.
- B: leave it out. Single English words then read strong; a closed `known-limit` issue records it.

**Ships now**: A.

