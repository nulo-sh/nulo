# scroll-cue-right-1: phase 1

- **Measured, not assumed.** The brief expected only text under the right corner at first paint. The probe found step 3's toggle row, a full-width `StepRow` button, ending about 2 px into the button's top edge with the steps open: the left corner was clear of the toggles by 1 px (x 52 against x 53), the right one cannot be. Decision D4.
- **A success control must be able to move.** Levelling an element that already sits above the button asks for a negative scroll, which clamps at 0: the first run's control read nothing. Pick a target below the fold.
