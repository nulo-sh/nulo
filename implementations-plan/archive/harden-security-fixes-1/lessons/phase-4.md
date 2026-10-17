# Phase 4: key exchange bound to its discovery (C4)

- The check is a pure helper beside the wrapper (`keyExchangeFromItsDiscovery`), so `admitContentMessage` stays under its complexity budget.
- The "credited to no origin" case is reached by a discovery from a sender whose `tab.url` is absent (upstream credits `"unknown"`), approved through `handler.approveDiscovery`; no sender document can report `"unknown"` as its origin, so that clause is defense in depth with no other path.
- Red proof: with the check reduced to `return true`, the five refusal tests fail; the flagged-module subframe test then also fails in the same run (a cascade of the failed test before it; it passes alone either way, and three green repeats of the file passed).
- Firefox reports only `sender.url`; the control "from a sender with only a url" covers that shape.
