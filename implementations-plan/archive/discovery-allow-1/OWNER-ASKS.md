# discovery-allow-1: owner asks

## Open

- **OA-4, what a Connected Apps row names** (arc 2, does not gate the merge; tracked as #1732): with the switch on, every site that discovers Nulo gets a row with no tap (P119-03 A), and the list row shows only the name the site sent (sanitized, at most 64 characters), not its origin. A site can so place a line of its own words in Settings → Connected Apps, such as "Nulo support: restore your wallet at …". Without the switch, a row needs an Allow in a window that shows the origin. Options: **A** keep the row as it is (the row's own page shows the origin); **B** show the site's host under the name in the list row. Either is a UI change only the owner makes; the lane ships A, today's row.

## Answered

- **Where the "every site" row sits** (asked as P117-07's note): P118-02 C, first on Settings → Connected Apps, above Sessions, with 32 px under it. The plan quotes it.
- **OA-3, the glossary "where" lines** (arc 1): page 119, pick **P119-01 A**, signed 2026-11-06 at 20:31 UTC: both new rows' where-line reads "Connect window"; the two rows (Discover, Connection check) go last under Apps, after Interface.
- **OA-1, Privacy Policy § 5.7** (arc 2's merge gate): page 119, pick **P119-02 A**, signed 2026-11-06 at 20:31 UTC: the sentence ships as a patch version (1.2.x), no notice.
- **OA-2, Connected Apps with the switch on** (arc 2): page 119, pick **P119-03 A**, signed 2026-11-06 at 20:31 UTC: Connected Apps lists every site the switch lets through, no cap; each entry expires after 7 days or on Disconnect.
