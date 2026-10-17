# storage-privacy-1: owner asks

The plan changes no screen and no copy (plan § UI impact). One behaviour on installs that predate the change needs the owner's confirmation.

## OA-1 — received rows on an install upgraded from an earlier build

**Surface:** Activity and Home's recent activity, on an install that already holds received private transfers from a build before this change, and is updated rather than reinstalled.

**What happens:** the new build stores received rows under a new key and does not rewrite old rows (CLAUDE.md § Persisted-storage shape changes: pre-production, no migrations). Old rows not yet final are removed by the next scans. Old final rows stay. A transfer whose note is still unspent then shows twice in Activity: its old row and the new one. A transfer whose note was already spent shows once (its old row). A reinstall clears both.

**Options:**
- **A — the standing rule (recommended).** No migration. The PR body tells testers to reinstall. Store listings exist (Chrome unlisted, AMO experimental), but the rule still says there are no users. Activity on an upgraded install: one duplicate row per unspent received transfer, until reinstall.
- **B — a one-off purge of old-form received rows at start.** This is a numbered migration, and the rule forbids it before launch. Activity on an upgraded install: no duplicates, but the history of received transfers whose notes were already spent disappears, since discovery only re-creates unspent ones.
- **C — flip the pre-production rule now.** Every later storage change then needs a migration. For this change it means B, or a rewrite that needs the node to recover each old row's new key.

**What ships now:** A. The arc is the same under A. B would be added on top in its own change. Open as #689.
