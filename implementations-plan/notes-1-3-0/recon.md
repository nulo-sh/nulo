# notes-1-3-0 recon

Range `v1.2.0..846f26379` (first-parent, 91 commits). Two Explore agents (sonnet) read every non-test, non-docs PR body; the claims a bullet rests on were then checked in the tree (plan F4-F8). PR numbers below are the evidence for each bullet; the PR body cites them, the notes never do.

## What a person notices, by bullet

| Bullet | PRs | Notes |
|---|---|---|
| Nulo's relay, failover between endpoints | #1664, #1687, #1757, #1766 | relay appended at unlock only while the primary is the seed's (plan F5); #1664 alone wires nothing |
| A default still named "Alpha V6" or "Mainnet" becomes "Alpha" | #1697 | skipped when the name is taken |
| What's new row, About's link | #1724 | first release that carries it (plan F6) |
| Send: the person first, the review, dollars on fees, payer balances, the privacy warning | #1795, #1797, #1811, #1813, #1838, #1844 | every send passes the review sheet |
| A raised fee struck through; the toast steps aside | #1803, #1870 (in flight) | |
| Approval windows: numbered steps, value tree and raw values, chips, seal, names | #1776, #1782, #1805, #1808, #1839, #1851 | |
| Approval windows: failing check, who pays, refusals without an account, balance re-read | #1696, #1706, #1727, #1729, #1817, #1819, #1837 | a single private call without an account is still sent (plan F8) |
| Token pictures; History's direction icons; one rounding rule | #1785, #1787, #1792, #1800, #1723, #1730, #1707 | #1778 and #1780 change only the list's files |
| Connect window, every-site switch, hosts, the app's permission table and legend | #1722, #1734, #1762, #1854 (in flight), #1866 (in flight) | switch off by default, per profile |
| Unlock window for a locked discovery | #1859 (in flight, conditional on decision page 191) | |
| Authwits and Contracts under Developer → Account State | #1832, #1853, #1867 (in flight), #1840, #1843 | |
| Mainnet's Fee Juice links open Shield | #1872 (in flight, conditional) | opened during the arc |
| Also: endpoint list, "more below", request logs, Receive's QR, switch names | #1741, #1768, #1822, #1823, #1824, #1739, #1709, #1857 | |
| Terms 1.2.4, Privacy 1.4 | #1757, #1765, the PRs that bumped 1.2.10 and 1.2.11, #1872 (in flight: 1.4, material, for the owner to confirm) | nothing asks to be accepted again (plan F4) |
| Fixes | the `fix` subjects in the range | 34 since `v1.2.0`, plus #1870 |

## No bullet

Tests, docs, CI and chores (#1669, #1677, #1684, #1685, #1686, #1690, #1705, #1738, #1761, #1765's docs half, #1769, #1770, #1774, #1781, #1783, #1791, #1812, #1818, #1848, #1852, #1869); internal refactors (#1674, #1726); the dApp-facing error code only (#1842); release tooling (#1694); landing-only (#1713, #1777); infra (#1689); the website newsletter's double opt-in (#1695); the token list's picture files, drawn nowhere until the token-picture PRs above (#1778, #1780).
