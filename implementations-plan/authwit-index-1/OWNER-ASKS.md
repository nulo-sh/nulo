# authwit-index-1: owner asks

## OA-1: when an app transaction's public authorizations are listed (revisits P65-06)

- **Surface**: Settings → Developer → Account state → Authwits, for the public authorizations an app transaction grants.
- **Your earlier pick (P65-06, 2026-10-19)**: "Keep today's order: list them after History records the send." Note: "Seems very fickiny to do it before, and also... the chances of a user looking for that authorization are really really low. Also: it's not confirmed, so it wouldn't be real. I think confirm => then adding it's the correct order."
- **Why it comes back**: the orchestrator brings the reason.
- **Ships now (arc 1)**: your order, with one difference: the wallet lists the authorizations once it has attempted the History write, even when that write fails. When no History row exists, such a row stays `Pending` until revoked.
- **Options**:
  - **A**: list them just before the wallet sends, as `Pending`. The row shows while the send is in flight (seconds; longer on a slow network). If the send fails, the wallet attempts to remove the row at once, also when the network did take the transaction but its answer never arrived. If the wallet stops between listing and sending, the row stays: Revoke answers that the grant is not in a block yet, nothing removes it, and it counts toward the 256 tracked authorizations. No new stored data.
  - **B**: keep your order. The wallet also keeps the send's authorizations with its activity record. When the wallet later reads that the send went through, it lists them, also after a restart, or when the network's answer never arrived. Such a row can appear minutes after the send. It adds one stored field to the activity record, and one step that writes the list from it after a start or an unlock and survives a stop halfway.
  - **C**: arc 1 only.
- **Recommendation**: B. It lists every authorization the network took, and it keeps "confirm, then add". C is the smaller choice if your view that few people look for these rows still stands.
- **Your answer**: the option. A or B is arc 2 of this plan; C closes the plan after arc 1.
