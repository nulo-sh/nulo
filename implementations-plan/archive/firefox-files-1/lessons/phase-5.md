# Phase 5: the contacts export, bounded and shown

## I3: what an export costs now

Measured from the Export press to its success snack, at retry 0, with a scratch timer in
`exportContactsFile` that was never committed:

| Path | Chrome | Firefox |
|---|---|---|
| `contacts-import` "export, then import": both networks refused by the harness | 218 ms | 321 ms |
| network `senders-advanced`: the local network live and bound, Testnet refused | 213 ms | 450 ms |

Before, the refused path took 12.05 s on Chrome (the shots-p74 capture's reading, three contacts):
the retrying status check spent about six seconds on each refused network, one after another. The
whole `contacts-import` "export, then import" test went from 34.1 s to 18.9 s on Chrome and from
52.5 s to 24.4 s on Firefox on this host. The silent path (a node that never answers) is the
5 s limit, proven with fake timers in `service.test.ts`, not in a browser.
