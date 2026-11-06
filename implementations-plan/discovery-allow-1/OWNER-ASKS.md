# discovery-allow-1: owner asks

## OA-3. Settings → Glossary: the "where" line of the two new entries (arc 1; blocks it)

**Surface:** Settings → Glossary, Apps group. Every row shows the term, its definition and a small "where" line naming the screen where the term appears dotted (today: Authorization "Permission window · Connected apps", Name for this app "Permission window", Interface "Approval window"). Your P117-06 D pick gives the two new terms and their definitions, not this line.

**Options:**
- **A. Both "Connect window"**, the one screen that dots them, the two rows last under Apps (after Interface, where Interface itself went last). Recommended.
- **B. Discover "Connect window"; Connection check "Connect window · Connection check window"**, naming also the window the check happens in, though the term is not dotted there.
- **C. Your words.**

**What ships now:** nothing of arc 1; it waits for this answer (the two dotted terms need their glossary rows).

## OA-1. Privacy Policy § 5.7: one sentence for the switch, and its version kind (arc 2)

**Surface:** `legal/privacy.md` § 5.7 "Applications you connect to", published on nulo.sh and linked from the wallet. Today: "When you connect Nulo to an application, that application learns what you approve: …". With the switch on, a site learns that Nulo is installed, and its version, before any per-site approval.

**Options:**
- **A. One sentence, a patch version (1.2.x; no notice).** Appended to the first paragraph of § 5.7: "If you turn on Let every site see that Nulo is installed in Settings → Connected Apps, any site you open, and the scripts it runs, learns that Nulo is installed and its version without asking; connecting and sharing an account still ask you." History line: "With Let every site see that Nulo is installed on, any site learns that Nulo is installed and its version (§ 5.7)." Precedent: 1.2.8 and 1.2.9, both about what leaves the device, were patches.
- **B. The same sentence as a material minor version (1.3.0).** `legal/README.md` calls a change to what leaves the device material. Settings → About then shows the non-blocking privacy notice with the history line above; nothing is blocked (status follows the Terms alone).
- **C. No change.** "Learns what you approve" is read as covering a switch the person turns on with a confirm that states the same facts.

**Recommendation: A.** The switch is off by default and its confirm already says the same words before anything leaves the device; a notice to every user for a feature they have not turned on adds noise. B if you read the README's rule strictly.

**What ships now:** arc 2 may be built without any change to `legal/`; its PR stays draft and merges only once you pick, with your pick applied. Arc 1 does not touch this.

## OA-2. With the switch on, Connected Apps lists every site that discovered Nulo (arc 2; for your awareness)

**Surface:** Settings → Connected Apps. A site the switch lets through gets the same 7-day entry a manual Allow writes ("Allowed. Not connected yet." until it connects), because the connection check and the app's later requests need it. With the switch on, the list therefore grows with the sites you visit that look for a wallet, and each can be disconnected there as today.

**Options:**
- **A. As stated** (no cap; each entry expires after 7 days or on Disconnect). The list doubles as the record of which sites learned Nulo is installed.
- **B. A cap** on entries the switch writes, past which a site gets the connect window. Adds a rule and a count to the switch.

**Recommendation: A.** **What ships now:** arc 2 may be built as A; its PR stays draft until you answer. Arc 1 does not touch this.

## Answered

- **Where the "every site" row sits** (asked as P117-07's note): P118-02 C, first on Settings → Connected Apps, above Sessions, with 32 px under it. The plan quotes it.
