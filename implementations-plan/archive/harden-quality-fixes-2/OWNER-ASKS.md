# Owner asks: harden-quality-fixes-2

None. Every item carries its owner pick from decision page 21 (2026-10-16): P21-01 B (#538), P21-02 A (#542), P21-03 A (#543), P21-04 A (#541). No screen, row, copy or format changes; each PR states `UI impact: none`.

The plan preserves two existing behaviours rather than asking about them (plan.md D10, Inference I2): a malformed encrypted backup with no profile type keeps its Decrypt section after decrypting, and a malformed profile type is read unchecked, as today. Changing either would change what a person sees, so it would come here first.
