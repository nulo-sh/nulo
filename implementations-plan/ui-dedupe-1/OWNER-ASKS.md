# ui-dedupe-1: owner asks

The lane brief's no-ask records cover every arc ("UI impact: none"; #517 pixel-identical). Each ask names its surface, the options, what ships now (the arc builds that and does not wait) and a recommendation. Neither ask touches a surface A1 changes.

## OA-1 (arcs A5 and A6, #548): converge the balance lists on Home's rules?

- **Surface**:
  - Holdings;
  - the Select token sheet over Send;
  - Send's amount for the selected token.
- **Background**: page 37 asked for one balance mirror per family, with the deliberate differences (delete unfiltered, replace on Added) as options. The views also differ in ways nobody chose. Each of these shows only after a worker restart, a refused read, or an event that arrives in an unusual order:

| View | Today | Home's rule |
|---|---|---|
| Holdings | Shows "LOADING HOLDINGS" in place of the list on every refresh, a reconnect included | Keeps the list while it refreshes |
| Holdings | A refused read shows "Couldn't load holdings", also over a list already shown, until the next reconnect | Retries after 2 s; keeps a loaded list |
| Holdings | A balance update for a row it never saw adds the row at once | Waits for the next read |
| Select token | A refused read shows "Couldn't load tokens" until the sheet reopens | Retries after 2 s |
| Select token | A reconnect blanks the list and reloads it, pins included | Reloads in place |
| Send | After a worker restart, the amount is not re-read until Send reads its account again | Re-reads after a reconnect |
| Holdings, Select token | A balance read still out when a token is added or changes lands over it, so the token can drop out of the list until the next read | Reads again and keeps the change |
| Send | A deleted balance row is ignored. Every deletion also removes the token or changes the account, which Send handles, unless the row's id is reused while Send stays open (below) | Drops the row |
| Send | Every added balance row for the account is listed as it comes, from any chain and again for an id already listed. Ids are reused: a token id after the highest token is deleted, a balance id after a worker restart. A reused token id can show a deleted token's amount; a reused balance id shows the new token's amount | Lists the active chain's rows, once per id; with its Delete, both reuses show the right amount |

- **A6, the journal lists** (History's cancelled and failed rows, Home's Recent activity, Home's import rows). Found at A6's release, each in an order the worker can deliver when another profile operation holds its lock:

| View | Today | Home's Recent activity rule |
|---|---|---|
| Home, import rows | A read can list an import whose "added" event is still on its way; the event then lists it again. A token you add yourself shows twice, and once the import ends the second copy stays as in progress until the popup reopens or the worker restarts | Lists each operation once |
| History | An earlier "in progress" update arriving after a read that saw the operation end removes the row, and the next update puts it back | Keeps the row |
| History, Home import rows | Every read lands as it answers and none is retried: a reconnect read that fails keeps what the first read listed | Lands only its newest read, and retries a refused one after 2 s |

- **What A6 ships**: A, every row above unchanged, each kept as an option of the journal mirror. Under B, History and Home's import rows take Home's newest-read rule together with its retry, never the newest-read rule alone: alone, a refused second read would lose the first read's rows. Home's Recent activity keeps a card whose send moves to another account or network until its next read, under both options.
- **Options**:
  - A. Keep each view's rule as an option of the shared mirror.
  - B. Converge every row above onto Home's rule. The two deliberate differences stay options either way.
- **What ships now**: A. Every behaviour above is unchanged; arc A5 keeps each as an option of `useTokenBalanceSnapshot` (the in-flight read row and Send's add row joined at A5's release, after a Codex consult).
- **Recommendation**: B. Each row is a rule nobody chose, and B keeps the mirror to its deliberate options, where A adds about five more. Send's failure card (Retry when its token read is refused) stays as it is under both options.

## OA-2 (arc A1, #541): close the open-run hop in the full-backup export

- **What happens**: the export's first stage checks that the run is still current, then returns. The caller resumes one step later without checking again (`export/full.vue:317-342`).
  - If the page is left or the profile switched in that step, the dropped run still builds its service clients and asks the account service for the backup keys.
  - After a profile switch the service refuses the request (its run fence).
  - After leaving the page, a passkey profile's sealed keys come back and are thrown away. The run's own cleanup disconnects its clients.
  - Nothing is published, saved or shown.
- **Surface**: none a person can see.
- **Options**:
  - A. Keep it as today; the new tests pin it.
  - B. Add the one missing check, so a dropped run stops before it builds clients or calls the service.
- **What ships now**: A. The owner's rule for #541: a behaviour change is an ask, never a quiet fix.
- **Recommendation**: B. It is one line, and it is the class of slip #541 was opened for.

## Conditional (no entry yet)

- **A4 (#517)**: if the pixel proof finds any difference between the countdown Close today and on the design `Button`, in any state, theme or browser, the difference becomes an entry here with both captures, and A4 ships nothing visible.
