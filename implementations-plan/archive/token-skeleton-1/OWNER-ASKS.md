# token-skeleton-1 owner asks

## OA-1: a token whose contract returns an empty or blank-looking name or symbol

- **Surface:** the approval window's Register token card, once the token's details are read.
- **Why it comes up:** under P66-02 B the Name row always shows. A token contract can return an empty name, or one of only spaces, which the wallet's sanitizer keeps (a hostile or careless deploy). Today's card hides an empty name and shows an empty or blank symbol as blank.
- **Options:**
  - A. Blank: "NAME:" with nothing beside it, as today's symbol shows an empty value.
  - B. The empty-value dash: "NAME: —", the dash the wallet already uses for an empty value, for a value that is empty or only spaces after the sanitizer.
- **Recommendation:** B. A blank value reads as a screen that failed to draw; the dash says the contract gave no name.
- **What ships now:** A. The row shows the sanitized value the contract returned, with no new mark. The Contract address row stays below it, as for every token.
- **Blocks arc 1:** no. Arc 1 ships B as signed: the Name row stays and shows its value, empty included; the dash would be a new mark for a later change.
