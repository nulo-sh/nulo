# Phase 4: a metadata read is bound to the session

- The executor helper `nodeInstance` parses the address for the node client; the PXE client keeps the wire address, as in Phase 3.
- The "logs no address" case throws an error whose message holds the requested address and checks the logged arguments, with `logDebug` called as its control.
