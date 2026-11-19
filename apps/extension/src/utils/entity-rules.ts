// The entity forms' shared rules. Every check that produces a verdict returns its constant, and a
// form that compares its field's error compares to it, so the words and the check cannot drift.

/** The warning a name or address field shows for a value already saved. */
export const ALREADY_EXISTS = "Already exists"

/** The warning an FPC address field shows for an address another FPC row holds. */
export const ALREADY_ADDED = "Already added"

/** The contact form's words for an address it refuses, which other address fields reuse; each
 *  field keeps its own check. */
export const INVALID_ADDRESS = "Invalid address"

/** The shortest RPC URL a network or endpoint form submits. */
export const RPC_URL_MIN_LENGTH = 5
