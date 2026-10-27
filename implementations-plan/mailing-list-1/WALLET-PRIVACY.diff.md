# Wallet Privacy Policy: the diff for the owner's sign-off (A2)

Base: `legal/privacy.md` 1.2.6, effective 27 October 2026, as `origin/dev` carries it at `9e88a3c71`
and the 1.1.0 promote brings to `main`. The change moves the website and its mailing list to the Website Privacy Notice
and removes "There are no web forms". § 5.5 keeps `passkey.nulo.sh` and `tokens.nulo.sh`: the
wallet's own functions involve them, and § 5.11 says the Developer sees "what § 5.5 describes for
its hosts". §§ 1, 12 and the store appendix need no change: the Developer stays controller for the
website, and Resend is no wallet provider.

**Where it lands.** Directly on `main`, in the notice arc, not through a promote: `nulo.sh/privacy` is
built from `main`, and the policy must stop saying "There are no web forms" before the form is live.
The extension picks the new version up at its next release.

**Version.** Recommended: **1.2.7, a patch**. The wallet's processing does not change, so nothing
asks again and it takes effect on publication. A minor (1.3) would show the non-blocking "privacy
policy updated" notice in Settings → About; it blocks nothing either way, since status derives from
the Terms alone. If 1.2.6 is no longer the head when the arc starts, the number moves up and the
text stays.

**Manifest entry** (`packages/legal/src/manifest.ts`, appended to `privacy`):

```ts
{
	version: "1.2.7",
	effective: "«the publication date»",
	material: false,
	changes: ["The website nulo.sh and its mailing list are now described in a separate Website Privacy Notice (§ 5.5)."],
},
```

Before editing, copy 1.2.6 to `legal/archive/privacy-1.2.6.md` (the manifest test requires it).
The effective date is the day the arc's PR merges into `main`; the `«FILL»` below is replaced then.

```diff
--- a/legal/privacy.md (1.2.6)
+++ b/legal/privacy.md (1.2.7)
@@ -1,6 +1,6 @@
 # Privacy Policy
 
-**Version 1.2.6 — effective 27 October 2026**
+**Version 1.2.7 — effective «FILL: effective date»**
 
 This policy explains what happens to information when you use Nulo. The published source shows the
 extension's implemented data handling. Hosting, correspondence, authenticator and store processing
@@ -53,7 +53,8 @@
 
 I do not sell personal information or share it for cross-context behavioural advertising. I and the
 providers identified below process the limited website, correspondence and service data described in
-this policy.
+this policy. The website `nulo.sh` and its mailing list are described in the separate
+[Website Privacy Notice](website-privacy.md).
 
 ## 3. What Nulo stores on your device
 
@@ -180,12 +181,15 @@
 **Legal basis (GDPR):** legitimate interests — keeping the domain available and secure — under
 Article 6(1)(f).
 
-### 5.5 `nulo.sh`, contacting me, and the uninstall page
+### 5.5 `passkey.nulo.sh` and `tokens.nulo.sh` hosting, contacting me, and the uninstall page
 
-The website is static and carries no analytics or tracking of mine.
-
-Hosting for `nulo.sh`, `passkey.nulo.sh` and `tokens.nulo.sh` is provided by Cloudflare, Inc.
-([privacy policy](https://www.cloudflare.com/privacypolicy/)). Website requests expose IP addresses,
+The website `nulo.sh`, including its mailing list, is described in the
+[Website Privacy Notice](website-privacy.md). The extension opens it only on uninstall (below) and
+when you follow a link to it.
+
+Hosting for `passkey.nulo.sh` and `tokens.nulo.sh`, the hosts the wallet's functions involve, is
+provided by Cloudflare, Inc. ([privacy policy](https://www.cloudflare.com/privacypolicy/)), which
+also hosts `nulo.sh`. Requests to them expose IP addresses,
 requested URLs and ordinary browser headers to the hosting provider. Information available to the
 Developer through hosting tools is aggregate traffic statistics (requests, bandwidth, unique visitors
 and countries) and, for up to the past 30 days, a sample of individual requests showing the time, IP
@@ -193,12 +197,12 @@
 request was cached or filtered. Request logging on the `passkey.nulo.sh` and `tokens.nulo.sh` applications is
 turned off, and the hosting provider's browser analytics are not enabled. This processing supports delivery and
 security of the
-sites, relying on legitimate interests where applicable. The retention information below and the
+hosts, relying on legitimate interests where applicable. The retention information below and the
 international-processing information in § 12 cover these hosting records.
 
-**There are no web forms.** The Feedback, Report Issue and Report Scam items in the wallet open your
-own email client addressed to `hello@nulo.sh`; nothing is submitted to a form service, and no
-third-party form provider receives anything.
+The Feedback, Report Issue and Report Scam items in the wallet open your own email client addressed
+to `hello@nulo.sh`; nothing is submitted to a form service, and no third-party form provider
+receives anything.
 
 If you email me, I receive what you send — your message, your email address, and any attachments —
 through the email provider Google LLC (Google Workspace;
@@ -207,7 +211,7 @@
 where that basis is available and appropriate. Writing to me is entirely optional. **Do not attach
 wallet secrets, recovery phrases or unencrypted backups.**
 
-**Retention.** Website and security records are kept only for as long as the hosting provider makes
+**Retention.** Hosting and security records are kept only for as long as the hosting provider makes
 them available in its dashboard (currently up to 30 days); I do not export or copy them.
 Correspondence and attachments are retained until the matter is resolved and then for no more than
 two years. Provider retention is set by each provider's data processing terms:
@@ -219,7 +223,8 @@
 **Uninstall page.** If you remove the extension, your browser opens the site root, `nulo.sh`. There is
 no uninstall survey. The URL the extension configures contains no wallet address and no
 per-installation identifier. Opening it still exposes ordinary website request metadata, including IP
-address, browser headers and any cookies applicable to that site.
+address, browser headers and any cookies applicable to that site, as the Website Privacy Notice
+describes.
 
 ### 5.6 The extension stores
 
@@ -461,3 +466,4 @@
 | 1.2.4 | 25 October 2026 | Pinned tokens, fee-payer choices and the last-selected account are now stored encrypted too. |
 | 1.2.5 | 25 October 2026 | Only the default Testnet endpoint uses the Developer's provider account (§ 5.1). |
 | 1.2.6 | 27 October 2026 | Passkey profiles have a recovery phrase, and a passkey-profile backup restores with its file password alone (§§ 3, 5.4, 9). |
+| 1.2.7 | «FILL: effective date» | The website and its mailing list are described in a separate Website Privacy Notice; § 5.5 keeps the hosts the wallet's functions involve. |
```
