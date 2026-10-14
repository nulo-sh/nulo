// 120 s, owner-set: the retention bound on signed tx requests held in SW memory.
// Staleness itself is guarded by the consume ladder, not this TTL — past ~2 min
// entries mostly miss on base-fee drift anyway, so the shorter window costs
// almost no hit rate.
export const ESTIMATE_REUSE_TTL_MS = 120_000
