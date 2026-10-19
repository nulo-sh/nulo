import { fees } from "./fees"
import { mountClips } from "./player"
import { privateBalances } from "./private-balances"
import { proofs } from "./proofs"

mountClips([privateBalances, proofs, fees])
