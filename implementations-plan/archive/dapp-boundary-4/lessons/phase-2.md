# Phase 2: registrations bind the current class to the original

- The dApp refusal test needs its artifact to hash to the instance's current class id (the mocked recompute returns the current id); with the default fixture the base already refused it as an artifact mismatch, so it would not have been red on the base.
- The lookup test tells the original id from the current one by object identity: `toHaveBeenCalledWith` compares the fakes' `equals` closures by reference.
