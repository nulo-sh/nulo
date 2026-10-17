# Owner asks: dapp-boundary-2

The arc ships without waiting on any entry here; it does not change the connect window.

## OA-1: close a connect window when its dApp tab closes (optional, not in arc 1)

- **Surface:** the dApp connect window (Allow / Deny).
- **Today, and what ships now:** when the dApp's tab closes or navigates away while its connect window is open, the window stays until the person answers. After this arc, an Allow there closes the window and leaves no connected-app row, because nothing received the connection; Deny is unchanged.
- **Option A (keep, recommended):** no change. The window already closes on the answer, and the arc removes the leftover row, the only lasting effect.
- **Option B:** close the window as soon as its tab goes, as handed-over windows already close. The person would see the window disappear with no answer asked; a new connect from the app opens a new one.
- **Recommendation:** A. #673 lists B as optional; it changes a behaviour a person notices for no lasting gain.
