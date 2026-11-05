# chips-1 owner asks

Filed as `owner-decision` issues at close-out: OA-1 #1370, OA-2 #1371, OA-3 #1372.

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

## OA-3: below 359 px the network chip keeps today's 3 px sides

- **Surface**: the header network chip at widths under 359 px, which the Firefox sidebar reaches (its narrowest tested width is 240 px).
- **What was found**: with 8 px sides at every width, at 240 px the row leaves the chip no room for its name, and its status dot sits 3 px across the chip's right border (measured, Chrome). Today's 3 px sides and 4 px gap keep the dot inside.
- **Options**:
  - A. 8 px sides at 359 px and wider, today's 3 px below, where the row already tightens. Nothing changes below 359 px.
  - B. 8 px everywhere, and at the narrowest widths the chip hides its name and shows the dot alone. This needs a new layout rule.
- **Recommendation**: A. The popup is 360 px wide, so every popup gets the 8 px sides.
- **What ships now**: A. `appearance.test.ts` checks the dot at 240 px.
