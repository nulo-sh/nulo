# backup-restore-1 — owner asks

Each ask names a surface, its options and what ships now. The arcs ship the "what ships now" form and do not wait.

## OA-1: the restore warning names the network by chain ID (P38-04 B, arc 2)

- **Why:** the drawing names the network ("Add the network Devnet to restore it"). The backup carries no network rows, so the only name the restore knows is the account row's chain ID.
- **Options:** (1) the chain ID: "The imported account “Savings” was not restored. Add the network with chain ID 1337 to restore it." The network page already shows each network's chain ID. (2) Carry each added network's name, never its endpoint, in the backup so the warning can say "Devnet". That changes the backup format, close to P38-04's option D, and needs its own plan.
- **Recommendation:** 1 now; 2 only if custom networks leave Developer Mode.
- **What ships now:** option 1.

## OA-2: an imported account on an old Testnet chain (arc 2)

- **Why:** Testnet's chain ID changes at every testnet reset. A backup made before a reset and restored after it holds its Testnet imported accounts on the old chain ID, which no node serves again. The warning then asks the person to add a network they cannot add. The account stays held, hidden, and travels in later backups. The restore cannot tell an old Testnet chain from a custom devnet on the same L1.
- **Options:** (1) the same sentence as OA-1. (2) Add a clause: "…to restore it, or import it again from its account file." (3) A separate sentence for accounts whose L1 is Testnet's: "If this was Testnet before a reset, import it again from its account file."
- **Recommendation:** 2: true in both cases, one clause.
- **What ships now:** option 1. Known limit K1 records the held rows.

## OA-3: Developer Mode (arc 2)

- **Why:** adding a network shows only in Developer Mode, and a restore does not carry that setting. A person told to add a network may not find the button.
- **Options:** (1) say nothing; (2) add "Turn on Developer Mode in Settings to add a network." to the warning.
- **Recommendation:** 1. The person who added a custom network before knows where it was.
- **What ships now:** option 1.

## OA-4: how many held accounts the restore warning lists (arc 2)

- **Why:** a backup can hold many imported accounts, and a crafted one thousands. Each name is cleaned and cut to 32 characters, but a list needs a cap.
- **Options:** (1) list three names, then "and N more imported accounts"; (2) list none past one: "3 imported accounts were not restored."
- **Recommendation:** 1.
- **What ships now:** option 1.

## OA-5: say on screen when a restore drops an imported account or key (arc 2)

- **Why:** two cases end silently today, on screen. (a) A backup carries an imported account but not its key, for example one made after the profile's imported-keys key was replaced, which the export page warns about. The restore drops the account. (b) A backup carries a key whose account row is not in it, for example when an account import landed while the backup was being read. The key is never kept. Recording either would make the import stop at the existing warning, with one View Errors row each.
- **Options:** (1) as today, nothing on screen; (2) record (a) as "Not restored: its key is not in this backup" and (b) as "Skipped: no account in this backup uses this key".
- **Recommendation:** 2.
- **What ships now:** option 1.

## OA-6: the export warning (arc 3)

- **Why:** two details of P38-04 A that the drawing does not settle. When the export page already shows "Imported keys are not in this backup" (the profile's imported-keys key was replaced), a second warning about networks adds nothing. And "a network you added" is not quite true for an account a restore held from an old Testnet chain.
- **Options:** (a) hide the network warning while the keys-lost warning shows, or show both; (b) keep "a network you added", or say "a network a restore does not re-create".
- **Recommendation:** hide it; keep "a network you added", since an old-Testnet hold is rare and K1 records it.
- **What ships now:** hidden, and "a network you added".
