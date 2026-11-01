# token-id-1: owner asks

None. The approach is the owner's pick (decision page 94, P94-04, option A, signed 2026-11-01): "Persist a monotonic token-id counter so an id is never reused; one lane, an additive storage stamp, a test that deletes and re-adds." No screen changes its layout, copy or format; a failed or cancelled transfer whose token was deleted renders as it does today when no token holds its id.

Out of scope, not asked: an "unknown token" placeholder for records older than the fix (a product decision the lane brief excludes).
