# authwits-2, phase 2: the popups' run fence

- Both popups reuse `createRunFence`: `begin()` in the handler, `invalidate()` first in `onHide`. The revoke loop checks the run before each chunk; the summary, the toasts, `error`, the close, the latch and the stage line are left alone by a stale run.
- The test mock holds every send and its `disconnect` rejects the held ones, as `ServiceClient.disconnect` does; nine rows are two chunks under the mock's `MAX_REVOKES_PER_TX: 8`.
- Against the base popups: the three hide cases fail for the named reason (revoke: a second `revokeAuthwits`, then a success toast; reopen: the new run's stage line cleared by the stale run's `finally`; switch: a failure toast and a close); both controls pass. At the arc: 51 of 51 in the two files.
