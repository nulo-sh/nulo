# Owner asks: chain-endpoints

Decision page 12 (Network, prices and privacy) carries this lane's calls, P12-01 to P12-05. The asks below are the details the page's text leaves open, plus consequences the owner should know before signing. Each ask has the planner's recommendation and a "what ships now" line: what arc 2 builds while the ask is open. Arc 2 waits on page 12 in any case.

Arc 1 (#171) changes nothing a person sees in a shipped build and has no ask.

## OA-1. #200: which characters count as "hidden"

**Surface:** Settings → Networks, the RPC URL field (add network, add endpoint, edit endpoint).

P12-04 names three classes ("a space, a non-breaking space or a control character"), and its line says "spaces or hidden characters".

| Option | Refused inside a URL |
|---|---|
| **A. The named classes** | every Unicode space (ASCII space, NBSP, U+2028, U+3000 and the rest of `White_Space`) and every control character (`Cc`: U+0000-U+001F, DEL, U+0080-U+009F) |
| **B. A, plus invisible format characters** | A, plus zero-width characters, bidirectional controls (for example U+202E, which reverses how text reads) and the byte-order mark (`Cf`, `Default_Ignorable_Code_Point`) |

What a person sees: the same line either way; B refuses a few more pasted URLs.

**Recommendation: B.** A bidi control can make a URL read differently from the URL that is dialed, which is the phishing case the lane exists to close.

**What ships now: A**, the classes the page names.

## OA-2. #200: spaces at the start or end of a pasted URL

**Surface:** the same field.

P12-04 says "anywhere in it"; its title says "inside a node URL". Today a leading or trailing space is trimmed and the URL is accepted.

| Option | A person pastes `https://rpc.example/ ` (trailing space) |
|---|---|
| **A. Trim the edges, refuse inside** | accepted, saved as `https://rpc.example/` |
| **B. Refuse anywhere** | refused: "RPC URL can't contain spaces or hidden characters." |

**Recommendation: A.** A trailing space or newline is the common paste accident and carries no risk once trimmed. The arc also stops a trailing NBSP from being saved as `%C2%A0`, which happens today.

**What ships now: A.**

## OA-3. #200: where the line appears

**Surface:** the three network forms.

Today the add-endpoint and edit-endpoint forms show errors as a warning line under the RPC URL field; the add-network form shows inline warnings ("Already exists", "Failed to fetch network info") and a "Something went wrong" toast for other errors.

| Option | Where "RPC URL can't contain spaces or hidden characters." shows |
|---|---|
| **A. Under the field, in all three forms** | the add-network form uses its inline warning, like "Already exists" |
| **B. Under the field in the endpoint forms; the toast in the add-network form** | the add-network form shows the line in its toast |

**Recommendation: A.** The page says the field refuses the URL "with its own line".

**What ships now: A.**

## OA-4. #101: what a person reads when the form refuses `[::1]`

**Surface:** the same field, for `http://[::1]:<port>`.

P12-02 says the message "drops "/ http://[::1]"". That message is never shown: a refused URL reads "Something went wrong." today (`apps/extension/src/popup/components/popups/endpoint-error-text.ts:12`).

| Option | A person types `http://[::1]:8080` |
|---|---|
| **A. As the page states** | "Something went wrong." (the internal message changes; no new words) |
| **B. A dedicated line** | for example "Use http://localhost instead of http://[::1]." (new copy) |

**Recommendation: B**, if the owner wants the switch the page asks for to be discoverable; the wording is the owner's.

**What ships now: A.**

## OA-5. #101: a saved `[::1]` node URL, and saved URLs with hidden characters

**Surface:** Settings → Networks.

Consequences of P12-02 and P12-04 for URLs a person already saved, stated so the owner signs them knowingly. Backups carry no network rows (a restore re-adds the built-in networks), so a backup cannot bring either kind back.

- A saved `[::1]` endpoint still lists in Settings → Networks and can be edited or deleted. The wallet no longer dials it, so that network reads as not responding until the person switches it to `localhost`. Arc 2a keeps the popup starting and the list loading; without that, one such row would stop both.
- One exception: a custom network on a `[::1]` endpoint that has no account yet stops the popup from starting, because the wallet checks a custom network's identity with its node before it creates the first account. Any custom network whose node is offline does the same today. Arc 2a keeps that check and files the dead end as its own issue.
- A saved URL with a hidden character inside it keeps working as it does today (the browser dials its encoded form). Only new input is refused.

| Option | A person opens Settings → Networks with a saved `http://[::1]:8080` |
|---|---|
| **A. List it as it is** | the row lists; its network reads not responding |
| **B. Explain it on the row** | the row also says, for example, "Plain HTTP to [::1] is no longer allowed. Use localhost." (new copy) |

**Recommendation: A** before launch: no released build ever saved `[::1]` for a user.

**What ships now: A.**

## OA-6. #116: when "Prices unavailable" shows

**Surface:** the Home hero.

P12-01 covers "a funded wallet whose first price fetch failed". The wallet fetches when the popup opens and every three minutes; cached prices expire.

| Option | The popup stays open, prices expire, and the next fetch fails |
|---|---|
| **A. The page's case only** | only the fetch the popup makes when it opens can switch the hero to "—" / "Prices unavailable"; in this case the hero reads $0.00 with "priced assets only", as today |
| **B. Any failed fetch with no usable price** | the hero switches to "—" / "Prices unavailable" here too |

**Recommendation: B.** Both cases show a made-up $0.00, which charter C9 A rules out.

**What ships now: A.**

## OA-7. #116: the hero's edge cases page 12 does not name

**Surface:** the Home hero.

P12-01 names one case: a funded wallet whose first price fetch failed and nothing it holds has a price. These neighbours are open:

| Case | Today | What ships now |
|---|---|---|
| The fetch failed but cached prices are still usable | the cached amount | the cached amount (the page's case needs "no price") |
| The fetch failed and some holdings have a usable price, others not | the priced amount with "priced assets only" | today's rendering |
| The wallet holds only tokens the wallet has no price source for | $0.00 with "priced assets only" | today's rendering (no fetch could price them) |
| The price request itself errors (the background did not answer) | $0.00 with "priced assets only" | today's rendering |
| The popup reconnects to the background after it restarted, and the fetch fails | $0.00 with "priced assets only" | today's rendering (only the fetch when the popup opens counts, OA-6) |

**Recommendation:** the first three as shipped now; the last two show "—" and "Prices unavailable" as well, since each shows a $0.00 the person did not earn (charter C9 A).

**What ships now:** the third column.
