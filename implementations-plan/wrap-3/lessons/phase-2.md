# wrap-3: arc 1 (phases 1 and 2)

## Runs

- The e2e guard was red with `.dapp_action`'s rule reverted (the identity line 146.6 px past its box, `clippedBy: cap-scroll-area`), green with it on both browsers. File wall-clock before and after: Chrome 16.1 → 17.9 s, Firefox 30.0 → 33.3 s.
- The network screenshots of a seed state differ byte for byte between runs only in the playground's port and the fresh profile's addresses; the measured heights are equal. The smoke seed screenshots are byte-identical.

## Review loop

- **Round 1, Codex (session 01a19930): findings 1**, comments only: the scope banner's comment and the e2e's paragraph narrated. Accepted.
- **Round 1, Opus diff review: findings 3.** The e2e comment's reason for keeping the switched test on the seed name was false: `IdentityStrip`'s `.identity_network` ellipsizes at `max-width: 102px` at every width, so the 240 px check sees no newly cut text there. Removed it, and the matching clause in D9. T1 now refuses `text-overflow` and `white-space`, since an ellipsis copied onto the line would pass both the scan and the e2e while shortening the name. `.reset_notice` carries a one-line "text only" comment, as D4 and D5 will.
