# rpc-fallback-1 owner asks

**Answers, 2026-11-05** (the owner's whole message: "OA-1: B. OA-8: A. OA-2: ok, perfect."): OA-1 B; OA-8 A, the hold-down cap left at 30 minutes; OA-2 the proposed text, as privacy 1.2.10 and Terms 1.2.2 (1.2.0 ships privacy 1.2.9 and Terms 1.2.1, so option A no longer exists). OA-3 to OA-7 stay open for arcs 4 and 5.

**Answer, 2026-11-06** (decision page 117, P117-11, signed 18:13 UTC, no note; issue #1624): "A: Numbered rows with a drag handle and a status dot each, replacing today's checkbox; while a row is lifted every number shows the place a drop would give it; the edit sheet opens with the dot, the state word and, for a failing endpoint, a red error line ('No answer since 1 min ago. The connection failed.'). A tap still makes a row primary." It supersedes OA-3 below; arc 4 builds it (plan Phase 9). OA-4 stays open: arc 4 ships its "ships now" (nothing on Home), and it goes on the next decision page.

**Answers, 2026-11-06** (decision page 112, signed 14:18 UTC; issue #1624):

- **OA-5 (P112-03): D.** "A, but the append happens only on a row whose primary is still the default endpoint the wallet seeded. A person who replaced it with their own node never gets the relay, so the Developer never becomes a recipient they did not choose." The owner's note: "It's not the first time (We did this with Alpha V6 renaming to Alpha) that we need to work on this type of migrations: I understand we used to have a migrations architecture / scaffolding. Why does this not apply to that? What other parts of our stack can't have "one-time" migrations? I'm scared we end up scattered with randoms "ifs" and conditions just because of this types of changes of behaviors." Arc 5's PR answers it.
- **OA-6 (P112-04):** marked read, with the note "Just "Nulo"?". Built as the label "Nulo", second on a new profile and after the row's other endpoints on a converted one; the PR shows it.
- **OA-7 (P112-05): A.** The full legal diff is in arc 5's PR.

Arc 5 builds them (plan Phase 10).

**OA-4, 2026-11-07:** on decision page 121 as P121-07, open; arc 4 shipped A (nothing on Home).

Nine asks. Arcs 1 and 2 touch no surface and wait on none. Arc 3 needs OA-1, OA-2 and OA-8; arc 4 needs OA-3 and OA-4; arc 5 needs OA-5, OA-6 and OA-7 and `rpc-proxy-1`'s Worker. "Ships now" is what an arc builds if the ask is still open when it reaches it; an arc that changes a surface stops for the answer instead (§ UI changes need explicit owner sign-off).

## OA-1. What the network status means once a network has several endpoints (arc 3)

- **Surfaces:** the header's network dot and its screen-reader word; Manage Networks' active row (Settings → Networks); and, through the same status, which networks a full backup export includes.
- **Today:** the status asks only the primary endpoint. When the primary fails and a second endpoint would serve, the dot is red and reads "Cannot reach the network"; a full backup skips that network's account state.
- **After arc 3,** calls keep working through the second endpoint, so today's rule would show red while balances refresh and sends go out.
- **Options:**
  - **A.** Keep today's rule: the status is the primary's.
  - **B.** "Connected" (green) while any endpoint of the network answers for the right chain; "Cannot reach the network" only when none does. No new words.
  - **C.** B, and the screen-reader word adds "using a backup endpoint" while the primary is down.
  - **D.** A third state with its own word and colour (for example amber, "Using a backup endpoint").
- **Ships now:** nothing; arc 3 stops at Phase 6 step 2 for the answer.
- **Recommendation: B.** The dot answers "can I use the wallet", which B keeps true; which endpoint serves is OA-3's question, on the screen where endpoints live.

## OA-2. The privacy policy and Terms sentence about failover (arc 3)

- **Surfaces:** privacy policy § 5.1, Terms § 7.1, and Settings → About's existing non-blocking notice of a new privacy version.
- **Today:** both say the wallet "sends requests to the configured Aztec node", and that "pending transactions may continue to be checked through the endpoint used to submit them, including after you change or remove that endpoint".
- **After arc 3:** when an endpoint fails, reads (balances, sync, scans) go to the network's next endpoint, and a transaction is submitted to one endpoint that serves at that moment; every later check of that pending transaction, the wallet's own and its account engine's, goes to that endpoint only, as the sentence already says. One exception: after a browser restart before the transaction is in a block, the account engine may check it through the endpoint then in use until it is in a block.
- **Proposed addition**, after "Your control:" in § 5.1, and the same clause in § 7.1: "When a network has more than one endpoint, Nulo uses the primary first and, while it fails, the others in the order Settings → Networks lists them. Each endpoint you add can receive the requests described above."
- **Options:**
  - **A.** The proposed text, folded into privacy 1.2.8 (unpublished today) and a Terms patch.
  - **B.** The proposed text as privacy 1.2.9 and a Terms patch, separate from whatever 1.2.8 carries.
  - **C.** Your own words.
- **Ships now:** nothing; arc 3 stops at Phase 8 step 2.
- **Recommendation: A** if 1.2.8 is still unpublished when arc 3 lands, else B. A patch, not a minor: it describes the endpoints the person configured, so it asks no one to accept again.

## OA-3. Settings → Networks → a network: which endpoint is in use (arc 4, closes #1624): answered by P117-11 A

- **Surface:** the Endpoints list on a network's page.
- **Today:** each row shows its label (or URL), the URL under a label, and a filled checkbox on the primary; a tap makes a row primary. Nothing shows whether an endpoint answers.
- **What "in use" can mean:** the wallet has two parts that each choose an endpoint on their own: the account engine (balances, sync, proving, and where a send goes) and the background (the status dot, the tip the send checks, and the recorded transfers it re-reads). Each moves when it meets a failure, so after an outage they can sit on different endpoints until the next return to the primary. The page reads the state once when it opens; it does not update while open.
- **Options:**
  - **A.** Nothing changes; failover stays invisible.
  - **B.** The endpoint the account engine uses carries a small "In use" marker, read when the page opens; nothing else.
  - **C.** Each row carries one word, read when the page opens: "In use", "Standing by", "Not answering", "Behind" or "Wrong network".
- **Ships now:** A.
- **Recommendation: B.** It answers "why is my primary not used" with the part that sends and shows balances; C's words describe one part's view at one moment and ask people to learn five states.

## OA-4. Home while the wallet runs on a backup endpoint (arc 4): open as P121-07; arc 4 ships A

- **Surface:** Home.
- **Today:** nothing about endpoints.
- **Options:**
  - **A.** Nothing.
  - **B.** One line under the balance while the primary is down: "Using a backup endpoint".
- **Ships now:** A.
- **Recommendation: A.** Nothing on Home is actionable about it; the dot and OA-3 cover the question. If OA-3 and OA-4 both pick A, arc 4 is empty and arc 3 closes #1624.

## OA-5. Existing profiles and Nulo's relay (arc 5): answered D (P112-03)

- **Surface:** Settings → Networks → Alpha and Testnet, on a profile created before arc 5.
- **Today (after `rpc-proxy-1` arc 1):** each default network has one endpoint, the free provider's.
- **Options:**
  - **A.** New profiles get the relay as the second endpoint; existing profiles get it appended once, after the row's other endpoints, at their next unlock. If the person deletes it, it never comes back.
  - **B.** New profiles only. An existing profile stays on one endpoint until the person adds the relay by hand.
  - **C.** Existing profiles are offered the relay with a one-time prompt.
  - **D.** A, but the append happens only on a row whose primary is still the default endpoint the wallet seeded. A person who replaced it with their own node never gets the relay, so the Developer never becomes a recipient they did not choose.
- **Ships now:** B.
- **Note:** the append rebuilds each touched profile's account engine for that network once (a short resync at the next unlock).
- **Recommendation: D.** People who installed in early November are the ones the free endpoint fails; D reaches them without a prompt, leaves alone anyone who chose their own node, and a deleted relay stays deleted.

## OA-6. The relay row's label and place (arc 5): read (P112-04), built as "Nulo"

- **Surface:** the relay's endpoint row on Alpha and Testnet.
- **Options:** label **A.** "Nulo relay"; **B.** "Nulo backup"; **C.** no label (the URL shows, `rpc.nulo.sh` or `testnet.rpc.nulo.sh`). Place: second on a new profile; on an existing one (OA-5), after the row's other endpoints.
- **Ships now:** C.
- **Recommendation: A.** It says who runs it, which matters for privacy; "backup" is already true from its place.

## OA-7. The privacy policy for the relay (arc 5): answered A (P112-05)

- **Surface:** privacy policy §§ 1, 2, 5.1, 5.5 and 12, a new section for `rpc.nulo.sh`, and Terms § 7.1.
- **What changes:** with the relay, the Developer becomes a recipient of node requests (IP address, timing, request shapes) whenever the free endpoint fails, and of every request on a profile whose primary is the relay. `rpc-proxy-1`'s plan records what the Worker logs and keeps (its OA-1 deferred this text to this lane).
- **Options:** **A.** a new § 5.12 modelled on § 5.11 (`tokens.nulo.sh`) plus one line in each listed section, a minor privacy version since a new recipient is a material change; **B.** your own text.
- **Ships now:** nothing; arc 5 waits.
- **Recommendation: A,** drafted from what the Worker actually logs, shown to you before it lands.

## OA-8. Failover for second endpoints people already added (arc 3)

- **Surface:** none directly; behaviour behind every screen.
- **Today:** a second endpoint on a network is stored and shown but never used unless made primary.
- **After arc 3:** it starts receiving calls whenever the primary fails, for every profile that already has one, with no notice. A primary that hangs, rather than refusing, costs each part of the wallet one wait of up to 60 s before it moves; a primary that refuses moves at once. A primary that keeps failing again soon after each return is retried less and less often, at most every 30 minutes, so while it flaps the second endpoint (the relay, after arc 5) carries the traffic for up to 30 minutes at a time: that cap is yours to change.
- **Options:** **A.** yes, every network's endpoints fail over from arc 3 on; **B.** only networks whose endpoints the wallet seeded, until a surface (OA-3) shows the behaviour.
- **Ships now:** nothing; arc 3 stops at Phase 6.
- **Recommendation: A.** A person adds a second endpoint to have one to fall back to; OA-2's sentence says so.

## OA-9. Terms §§ 2 and 7.5 and the relay (arc 5): open; arc 5 ships A

- **Surfaces:** Terms § 2 and § 7.5. Both are outside OA-7's list, so arc 5 leaves them as they are.
- **Today:** § 2 reads "**Nulo does not intermediate your transactions.** Transactions submitted by the extension go directly to the configured node." § 7.5 lists the supporting services: a price feed, explorer links, the proving parameters' downloads, and edge hosting for the passkey domain and the token list.
- **After arc 5:** on Alpha and Testnet the configured endpoints include Nulo's relay, which passes requests, a transaction's submission included when the wallet sends through it, to dRPC. § 7.1 now says the Developer operates it.
- **Options:**
  - **A.** Leave both as they are. § 2's point, that the Developer screens and approves nothing and cannot reverse a transaction, still holds, and § 7.1 names the relay.
  - **B.** § 2 reads "go to the configured node; on Nulo's relay, through it to its provider", and § 7.5 adds "and edge hosting for Nulo's relay". A Terms patch.
  - **C.** Your own words.
- **Ships now:** A.
- **Also yours, in the same answer:** privacy § 5.1's failover sentence, your OA-2 text, says the other endpoints are used "while it fails". They are also used until the primary wins the role back: two passing checks 30 s to 30 min apart. § 5.12 now says so for the relay; whether § 5.1 says it for every endpoint is your call. Arc 5 leaves it as you approved it.
- **Recommendation: B, as a patch.** "Directly" stops being literally true on the relay's path, and a statement the Developer's own service contradicts reads worse than one that names it. Neither change alters an obligation, so nobody is asked to accept again.
