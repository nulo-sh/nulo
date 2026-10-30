# chips-1 owner asks

## OA-1: two texts name the wallet's label for the default as "Alpha V6"

- **Surface**: the Terms summary box (`legal/terms.md:13`: "it connects to Aztec Mainnet, shown in Nulo as Alpha V6, by default") and the store reviewer note (`apps/extension/store/listing.md:241-242`: "the wallet shows Alpha V6 as unavailable"). After this lane the wallet shows "Alpha".
- **Options**:
  - A. Leave both. "Alpha V6" still names the protocol generation, as the README and the listing prose do by the owner's decision on #1363.
  - B. Change the Terms box to "shown in Nulo as Alpha" in a patch version (no re-acceptance; the box is not part of the agreement), and the reviewer note to "the wallet shows Alpha as unavailable" in the store-images lane.
- **Recommendation**: B, so no text describes a label the wallet no longer shows; the Terms change in its own small PR, the note with the store lane.
- **What ships now**: neither text changes. Arc 1 touches no legal or store file.

## OA-2: the takeovers keep their own Lock chip with the word LOCK

- **Surface**: the top bar of the network-arrival and stale-network takeovers (`apps/extension/src/components/composite/TakeoverLayout.vue:42-43`), a separate component from the Home header.
- **Options**:
  - A. Leave it: padlock and LOCK, as today.
  - B. Make it the padlock alone, named "Lock wallet", as the header's after this lane.
- **Recommendation**: B in a later small change, so the two Lock chips read the same; the takeover bar has room, so nothing forces it.
- **What ships now**: A. Arc 1 does not touch `TakeoverLayout.vue`.
