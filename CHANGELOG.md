# Changelog

## [0.31.0](https://github.com/nulo-sh/nulo/compare/v0.30.2...v0.31.0) (2026-10-15)


### Features

* **activity:** expired send state and the pruned-block re-check ([#343](https://github.com/nulo-sh/nulo/issues/343)) ([39b50d8](https://github.com/nulo-sh/nulo/commit/39b50d82e59b409f99243353d743dd87e710db07))
* **aztec:** move to 6.0.0-rc.3 and the reset testnet, re-pin the account artifact ([#431](https://github.com/nulo-sh/nulo/issues/431)) ([479ba56](https://github.com/nulo-sh/nulo/commit/479ba56db4febb2c70170aa8d30304bcb20f0dd1))
* **backup:** password autocomplete on the backup forms; close account-session-life ([#467](https://github.com/nulo-sh/nulo/issues/467)) ([116974d](https://github.com/nulo-sh/nulo/commit/116974dcbfb33028176925fa59b34d0c2efdc131))
* **backup:** remind of unrestored networks, restore them again, protect account files ([#454](https://github.com/nulo-sh/nulo/issues/454)) ([0266d1b](https://github.com/nulo-sh/nulo/commit/0266d1b2446fa9f6ef874f4fada3206537fee1ab))
* **backup:** slim the account-state slice, back up an edited local network ([#418](https://github.com/nulo-sh/nulo/issues/418)) ([1ba770c](https://github.com/nulo-sh/nulo/commit/1ba770cfbb6747ca9df35e53b1dda9691ec258f5))
* **contacts:** fence the import's sender, hold lock while it runs; honour reduced motion ([#435](https://github.com/nulo-sh/nulo/issues/435)) ([21d806e](https://github.com/nulo-sh/nulo/commit/21d806e3111512f4f009c2794e13714505b2b755))
* **contacts:** import progress snack, refuse a second import; capped-name queue, darker red ([#452](https://github.com/nulo-sh/nulo/issues/452)) ([5dc3a63](https://github.com/nulo-sh/nulo/commit/5dc3a63c017eb895ce349c66e212e2a016ef0efc))
* **dapp:** ask again when an app widens its contract-classes grant ([527b369](https://github.com/nulo-sh/nulo/commit/527b369f40d03026820e5713346b471ad531a2f4))
* **dapp:** hold an app's calls until the person confirms the emoji check ([#347](https://github.com/nulo-sh/nulo/issues/347)) ([e900f71](https://github.com/nulo-sh/nulo/commit/e900f710808a95263f7d18f75a1b59f5297d0edb))
* **dapp:** ratify the app contract: class widening, address checks, `chainInfo`, -32005 ([#335](https://github.com/nulo-sh/nulo/issues/335)) ([527b369](https://github.com/nulo-sh/nulo/commit/527b369f40d03026820e5713346b471ad531a2f4)), closes [#84](https://github.com/nulo-sh/nulo/issues/84) [#87](https://github.com/nulo-sh/nulo/issues/87) [#89](https://github.com/nulo-sh/nulo/issues/89) [#125](https://github.com/nulo-sh/nulo/issues/125) [#199](https://github.com/nulo-sh/nulo/issues/199) [#201](https://github.com/nulo-sh/nulo/issues/201)
* **dapp:** refuse a `chainInfo` that does not decode instead of folding ([527b369](https://github.com/nulo-sh/nulo/commit/527b369f40d03026820e5713346b471ad531a2f4))
* **dapp:** refuse a `grantPublicAuthwit` caller or contract that is not ([527b369](https://github.com/nulo-sh/nulo/commit/527b369f40d03026820e5713346b471ad531a2f4))
* **design:** add type roles generated from the token contract ([#357](https://github.com/nulo-sh/nulo/issues/357)) ([cbaa544](https://github.com/nulo-sh/nulo/commit/cbaa544a3a21d109d6225ea703103b194bc1621a))
* **design:** set the design primitives and shared styles in type roles ([#358](https://github.com/nulo-sh/nulo/issues/358)) ([684b62a](https://github.com/nulo-sh/nulo/commit/684b62ad480af8f0da25b88959984848a7fde0f6))
* **fees:** an app's cap on every payer, its priority fee on app-paid rows ([#415](https://github.com/nulo-sh/nulo/issues/415)) ([a4e148b](https://github.com/nulo-sh/nulo/commit/a4e148b2cb970c540150103c938469358ed3e75c))
* **fees:** define the priority fee in the glossary and dot the term on the app-paid row ([#423](https://github.com/nulo-sh/nulo/issues/423)) ([93fa97e](https://github.com/nulo-sh/nulo/commit/93fa97e7be237a521c64a74a96d9c1380730fcfc))
* **history:** filter from a token page; onboarding theme, account state route, own windows ([#348](https://github.com/nulo-sh/nulo/issues/348)) ([19629fd](https://github.com/nulo-sh/nulo/commit/19629fdbb0740e8ffc1973529ebec7a37cb9b437))
* **holdings:** add a token from a pasted address, readable store refusals ([#333](https://github.com/nulo-sh/nulo/issues/333)) ([7287048](https://github.com/nulo-sh/nulo/commit/7287048cedcd8058ccc79b13b5221a89f8faaa65))
* **incoming:** explorer links on the receipt pages and the trust prompt ([#426](https://github.com/nulo-sh/nulo/issues/426)) ([b886fda](https://github.com/nulo-sh/nulo/commit/b886fda66573efbec95c95b029a8aafc7b22552a))
* **incoming:** receipt fee on a tap under privacy mode, updates on re-mine, settled notes ([#436](https://github.com/nulo-sh/nulo/issues/436)) ([0e451c3](https://github.com/nulo-sh/nulo/commit/0e451c3aa4929957d3f599e7af39bfc8cb518026))
* **incoming:** receipt fee on a tap under privacy mode, updates on re-mine, settled notes ([#436](https://github.com/nulo-sh/nulo/issues/436)) ([7844fdb](https://github.com/nulo-sh/nulo/commit/7844fdb1b4822083f9a68e2a02fffe988c2f925c))
* **landing:** send install buttons to the browser's store ([17b5271](https://github.com/nulo-sh/nulo/commit/17b5271980438aef46791fd6200ca75e9a638932))
* **landing:** send install buttons to the browser's store ([#49](https://github.com/nulo-sh/nulo/issues/49)) ([0fa075c](https://github.com/nulo-sh/nulo/commit/0fa075c36f9e8b54809f58e515433f4892dbabb6))
* **network:** classify stale networks per chain and reset them in place ([#485](https://github.com/nulo-sh/nulo/issues/485)) ([633b569](https://github.com/nulo-sh/nulo/commit/633b5695f2d698649f7fc11c80add59d91a296ce))
* **popup:** stale network takeover with in-place reset ([#486](https://github.com/nulo-sh/nulo/issues/486)) ([63297e0](https://github.com/nulo-sh/nulo/commit/63297e04637e05aa9e496266421903cfc49cbe58))
* **profile:** create skips a taken address; a new profile that does not open says so ([#453](https://github.com/nulo-sh/nulo/issues/453)) ([2aecbbb](https://github.com/nulo-sh/nulo/commit/2aecbbbfe8b5206d312503cf4e375254e652999b))
* **send:** queue a send behind an earlier one against a fee cap, ask again above it ([#402](https://github.com/nulo-sh/nulo/issues/402)) ([3133fb0](https://github.com/nulo-sh/nulo/commit/3133fb072b76cf2fcb8ad68cf22448b72f809a71))
* **settings:** group settings by task ([#56](https://github.com/nulo-sh/nulo/issues/56)) ([f557e20](https://github.com/nulo-sh/nulo/commit/f557e2001eacdad3c37244bdb73b4237e79c1338))
* **token-list:** seed and price the default tokens from the signed list ([#389](https://github.com/nulo-sh/nulo/issues/389)) ([a05831f](https://github.com/nulo-sh/nulo/commit/a05831f213862ce9ffa5e99c1a05854e454fbdc6))
* **token-list:** sign the token list in ci and host it at tokens.nulo.sh ([#388](https://github.com/nulo-sh/nulo/issues/388)) ([41715b7](https://github.com/nulo-sh/nulo/commit/41715b7301268c11e4f2b50bb9bff56cc24d2c0d))
* **ui:** set settings and approval windows in type roles ([#360](https://github.com/nulo-sh/nulo/issues/360)) ([cd9fac0](https://github.com/nulo-sh/nulo/commit/cd9fac0f3e37ef7437c4c9cf1c01792a92ae32b1))
* **ui:** set wallet, send and onboarding surfaces in type roles ([#359](https://github.com/nulo-sh/nulo/issues/359)) ([a207d08](https://github.com/nulo-sh/nulo/commit/a207d0809e86e5548fdf2d14bb1a5971815079ad))
* **verify:** let the emoji check refuse a mismatch and end the app's session ([#58](https://github.com/nulo-sh/nulo/issues/58)) ([6bb47c5](https://github.com/nulo-sh/nulo/commit/6bb47c5d8dd24f3256740eab578cf95d0e8db409))


### Bug Fixes

* **a11y:** keyboard reach on send's fee card and suggestions ([#393](https://github.com/nulo-sh/nulo/issues/393)) ([4c69cc6](https://github.com/nulo-sh/nulo/commit/4c69cc641ec6a7b9e6396ddaf4d465bceebf2532))
* **a11y:** reach home's view links, show two focus rings, fix connect and status contrast ([#76](https://github.com/nulo-sh/nulo/issues/76)) ([b55d88f](https://github.com/nulo-sh/nulo/commit/b55d88f7157a0b546dd8c2cbf62bf7119af82233))
* **a11y:** read history and settings titles once, announce the emoji check ([#241](https://github.com/nulo-sh/nulo/issues/241)) ([f15a9b5](https://github.com/nulo-sh/nulo/commit/f15a9b50f82df1e5d22adf1a3e3c38f972bc0948))
* account name checks, logs window trim, settings reread on reconnect, fuzz oracle ([#287](https://github.com/nulo-sh/nulo/issues/287)) ([f6e22a0](https://github.com/nulo-sh/nulo/commit/f6e22a04681c6cef9081cf45aaeb3b501434f97e))
* **account:** lock per address, identity-checked profile activation, passkey retry confirms ([#253](https://github.com/nulo-sh/nulo/issues/253)) ([fd47407](https://github.com/nulo-sh/nulo/commit/fd474075e24e9029a9144721d3e789fc9af44a61))
* **activity:** one scope rule, known decimals, failed-send surfaces, status contrast ([#344](https://github.com/nulo-sh/nulo/issues/344)) ([36c4315](https://github.com/nulo-sh/nulo/commit/36c43155256c0ce33cde069e50e656b7259cf765))
* **activity:** read a mint figure only from a pinned token class ([#334](https://github.com/nulo-sh/nulo/issues/334)) ([2b01f8e](https://github.com/nulo-sh/nulo/commit/2b01f8e06216d976433bccd3e26f6160c29330f9))
* **auth:** say when an unlock fails, reveal the current password on its own ([#422](https://github.com/nulo-sh/nulo/issues/422)) ([15881c7](https://github.com/nulo-sh/nulo/commit/15881c7db9398e102eaf5e3b0ebac5b0a7627d33))
* **backup:** encrypt a password profile's full backup before it downloads ([#55](https://github.com/nulo-sh/nulo/issues/55)) ([01f52f2](https://github.com/nulo-sh/nulo/commit/01f52f2cfee22d2120aa50bf281ffdf0c7bbec18))
* **backup:** guard restore enter, strict hex decode, migration watchdog, one key unseal ([#246](https://github.com/nulo-sh/nulo/issues/246)) ([ed59711](https://github.com/nulo-sh/nulo/commit/ed5971140aa6e8d73e2704f6c041333e3bdd2899))
* **backup:** per-backup key for imported keys, purpose-tagged encrypted files ([#51](https://github.com/nulo-sh/nulo/issues/51)) ([f5ca160](https://github.com/nulo-sh/nulo/commit/f5ca16064a4a68a8f1a542b538624ba8c0723cb3))
* **ci:** stop the geckodriver version check from failing on a closed pipe ([#3](https://github.com/nulo-sh/nulo/issues/3)) ([a132b4c](https://github.com/nulo-sh/nulo/commit/a132b4cb91471d553b423a4bed2046521f781dbe))
* **contacts:** make import changes to saved contacts an explicit choice ([#36](https://github.com/nulo-sh/nulo/issues/36)) ([90f4fb3](https://github.com/nulo-sh/nulo/commit/90f4fb3b3e882d8401b92c76ff17eeb97524a34a))
* **contacts:** settle a closed file chooser and pin an import to its profile ([#74](https://github.com/nulo-sh/nulo/issues/74)) ([70f5af1](https://github.com/nulo-sh/nulo/commit/70f5af11eba47fc84ec719d7c921e07db729fd8b))
* **contacts:** treat case, spacing and invisible characters as one name in import ([#41](https://github.com/nulo-sh/nulo/issues/41)) ([3b80761](https://github.com/nulo-sh/nulo/commit/3b807618841de5afffaf151f2e3287b3104b6ac3))
* **dapp:** answer -32005 for too many pending sends on every path ([527b369](https://github.com/nulo-sh/nulo/commit/527b369f40d03026820e5713346b471ad531a2f4))
* **dapp:** name refused app sends, title them by their call, name the app's network ([#307](https://github.com/nulo-sh/nulo/issues/307)) ([2a41b1d](https://github.com/nulo-sh/nulo/commit/2a41b1d5c6560f93d76f922a5a9dd62ae80d2b8a)), closes [#83](https://github.com/nulo-sh/nulo/issues/83) [#86](https://github.com/nulo-sh/nulo/issues/86) [#123](https://github.com/nulo-sh/nulo/issues/123) [#124](https://github.com/nulo-sh/nulo/issues/124) [#126](https://github.com/nulo-sh/nulo/issues/126)
* **dapp:** parse every dapp call against the wallet schema at dispatch ([#71](https://github.com/nulo-sh/nulo/issues/71)) ([8dd6691](https://github.com/nulo-sh/nulo/commit/8dd669104cb62203bd711a3b3705bdb024f2b50e))
* **dapp:** refuse `executeUtility` on a non-utility function with ([2a41b1d](https://github.com/nulo-sh/nulo/commit/2a41b1d5c6560f93d76f922a5a9dd62ae80d2b8a))
* **dapp:** refuse argument objects whose own `toString` would throw ([527b369](https://github.com/nulo-sh/nulo/commit/527b369f40d03026820e5713346b471ad531a2f4))
* **dapp:** refuse grantPublicAuthwit in batch, project stored grants, redact binding error ([#48](https://github.com/nulo-sh/nulo/issues/48)) ([b56d5e3](https://github.com/nulo-sh/nulo/commit/b56d5e3d87a5081296fc5614fb5275e9bd767454))
* **dapp:** size-bound ingress, canonical addresses, typed method refusal ([#353](https://github.com/nulo-sh/nulo/issues/353)) ([d01569a](https://github.com/nulo-sh/nulo/commit/d01569a200ccdf010a1f7cbcf38ffa37948ee3c6))
* **dapp:** validate stored grants at every reader, keep other profiles' handshakes ([#254](https://github.com/nulo-sh/nulo/issues/254)) ([28d4ffe](https://github.com/nulo-sh/nulo/commit/28d4ffeed800fc22c8c3dfae00675825a91410f6))
* **e2e:** claim run ports in the host registry, stop leaderless groups by marker ([#267](https://github.com/nulo-sh/nulo/issues/267)) ([6201f8b](https://github.com/nulo-sh/nulo/commit/6201f8b7475b7d07d6d324112c5542be29b50a43))
* **e2e:** load the lock page after a restart, drop the anchor sleep, watch for stalls ([#273](https://github.com/nulo-sh/nulo/issues/273)) ([8c3c671](https://github.com/nulo-sh/nulo/commit/8c3c671f3f2aa4c0f9bde15b0aa98f3aa7ae79e2))
* **execution:** register the account contract before no_from authorization discovery ([#285](https://github.com/nulo-sh/nulo/issues/285)) ([a4410df](https://github.com/nulo-sh/nulo/commit/a4410df8a25509e0f9e7a3ea38b18c847b230f87))
* **export:** remove the dead backups help link from both export screens ([#6](https://github.com/nulo-sh/nulo/issues/6)) ([0f5e433](https://github.com/nulo-sh/nulo/commit/0f5e433aab5ee882110021138d26279212d3a4ff))
* **extension:** add a default-src floor to the extension pages' csp ([#70](https://github.com/nulo-sh/nulo/issues/70)) ([f83703f](https://github.com/nulo-sh/nulo/commit/f83703fefc2b699bc753ec4dc424fbbcc052522a))
* **extension:** latch the secret pages, route only vue pages, reap e2e groups ([#234](https://github.com/nulo-sh/nulo/issues/234)) ([629c367](https://github.com/nulo-sh/nulo/commit/629c3671f2188e21141a4b29e01ca764da406cfb))
* **fee:** draw fee rows as loading until the read that answers them lands ([#39](https://github.com/nulo-sh/nulo/issues/39)) ([d3b3bde](https://github.com/nulo-sh/nulo/commit/d3b3bde2f5b8bce9e0abaeacb3a9e326563ac5b7))
* **fees:** refuse unknown priorities, hold timed-out estimate slots, pin fee-cap precedence ([#270](https://github.com/nulo-sh/nulo/issues/270)) ([236a2cd](https://github.com/nulo-sh/nulo/commit/236a2cddde7baa030deb821fb5041aefb93f4e21))
* **fees:** sponsor checks, long authwit proofs, the fee-juice nudge, per-profile fee picks ([#409](https://github.com/nulo-sh/nulo/issues/409)) ([d3dc441](https://github.com/nulo-sh/nulo/commit/d3dc44152180e0a426d8eb214fef3805f00e95c3))
* **incoming:** one receipt dedupe order, fence the trust write, all-or-nothing allow ([#248](https://github.com/nulo-sh/nulo/issues/248)) ([9574a9d](https://github.com/nulo-sh/nulo/commit/9574a9de1e51f8e022801c9ae9f3fb375f07c3b6))
* land the lock after a password change; find firefox add-on windows that never load ([#328](https://github.com/nulo-sh/nulo/issues/328)) ([6fa45c0](https://github.com/nulo-sh/nulo/commit/6fa45c0352d7b95676aa6cb2be591796d98373d7))
* **landing:** import the headers config with its extension ([1b17c16](https://github.com/nulo-sh/nulo/commit/1b17c168c63dc3bf81075886698a2066ccc827db))
* **logs:** trim trailing punctuation from scrubbed urls in linear time ([#4](https://github.com/nulo-sh/nulo/issues/4)) ([3bb6dad](https://github.com/nulo-sh/nulo/commit/3bb6dad0a7752284ae0dbe570155a0128dae516b))
* **messaging:** calls wait for the background's ready, the popup opens on the unlock screen ([#445](https://github.com/nulo-sh/nulo/issues/445)) ([1a8b2b6](https://github.com/nulo-sh/nulo/commit/1a8b2b6d2942a76417168ef06b1bdfed2c124f62))
* **popup:** form popup depth, trimmed name checks, config persist order, logger level gate ([#255](https://github.com/nulo-sh/nulo/issues/255)) ([868c82f](https://github.com/nulo-sh/nulo/commit/868c82f07812ac79c16a476dda836d960f6f35c9))
* **profile:** deletion waits for its coordinator, the pxe fence keeps dead generations ([#266](https://github.com/nulo-sh/nulo/issues/266)) ([45075a3](https://github.com/nulo-sh/nulo/commit/45075a312551a20d0a1b57a571ff6a92b1d96784))
* **profile:** wipe restore stash, project profile rpcs, check class id on backup restore ([#52](https://github.com/nulo-sh/nulo/issues/52)) ([6d6be06](https://github.com/nulo-sh/nulo/commit/6d6be06345d5c9691795ac1f6f1f0f522b665568))
* **pxe:** heal an account whose keys were stored without its address ([#247](https://github.com/nulo-sh/nulo/issues/247)) ([643c0c9](https://github.com/nulo-sh/nulo/commit/643c0c9ec42ea740d222b59a70f039999d28e755))
* **receipt:** accent focus ring on the Details links ([#439](https://github.com/nulo-sh/nulo/issues/439)) ([1e9507d](https://github.com/nulo-sh/nulo/commit/1e9507da0254db219739846c885faaf788e69ec9))
* **release:** keep a draft's tag through its edits; refuse a malformed chaos seed ([#311](https://github.com/nulo-sh/nulo/issues/311)) ([04137a0](https://github.com/nulo-sh/nulo/commit/04137a0633428d18ba9ec21de99181bf8f77f2ed))
* run the artifact smoke hermetic with one live spec; log a fixed pxe stamp category ([#320](https://github.com/nulo-sh/nulo/issues/320)) ([32b7bf4](https://github.com/nulo-sh/nulo/commit/32b7bf43e4d6140c7b626a46a2a7054b98304785))
* save a firefox fee pick as plain data, log integrity errors as objects ([#300](https://github.com/nulo-sh/nulo/issues/300)) ([27af8d7](https://github.com/nulo-sh/nulo/commit/27af8d72997d3355138b80d38ea48f088e7539b0))
* send token delete, logs window sources and clear, fee card gas retry ([#296](https://github.com/nulo-sh/nulo/issues/296)) ([0643a14](https://github.com/nulo-sh/nulo/commit/0643a1459210b5d392d793aea331ae1e6dce062d))
* **send:** announce the recipient field as a combo box named by its label ([#424](https://github.com/nulo-sh/nulo/issues/424)) ([b3c98ac](https://github.com/nulo-sh/nulo/commit/b3c98acb896cfc3a33ff50a37447ccf6336d2b2d))
* **send:** fit long usd figures, review-line gap, price-moved notice ([#373](https://github.com/nulo-sh/nulo/issues/373)) ([fa2b595](https://github.com/nulo-sh/nulo/commit/fa2b59581ffccbce3820759a2df1b1eb77dedffe))
* **send:** key the queued fee cap on the send's shape, give a long usd line its own row ([#417](https://github.com/nulo-sh/nulo/issues/417)) ([1c88360](https://github.com/nulo-sh/nulo/commit/1c8836046dae1f75c0dce70852c15b946f785090))
* **send:** keyboard reach and focus rings on send, keep the first press, announce sponsor ([#235](https://github.com/nulo-sh/nulo/issues/235)) ([83a6c22](https://github.com/nulo-sh/nulo/commit/83a6c2271bc626ac973ffc9ebac6e662a554dfb5))
* **send:** match recipient names with the shared contact-name rule ([#47](https://github.com/nulo-sh/nulo/issues/47)) ([e49e4ce](https://github.com/nulo-sh/nulo/commit/e49e4cebfe4b972751178171f8f2c1d18ffa6684))
* **send:** order dapp sends behind earlier sends, wait out node lag ([#392](https://github.com/nulo-sh/nulo/issues/392)) ([56f4250](https://github.com/nulo-sh/nulo/commit/56f42502e3d794a8aaa8163e9e2b0c1cb4004c57))
* **send:** persist the fee spender, scope journal events, check the dapp reuse epoch ([#264](https://github.com/nulo-sh/nulo/issues/264)) ([36f7aa1](https://github.com/nulo-sh/nulo/commit/36f7aa1c9143e183eec978e8c4603f01d7d6115e))
* **send:** show the select asset label again, without a network name ([#40](https://github.com/nulo-sh/nulo/issues/40)) ([0e76a05](https://github.com/nulo-sh/nulo/commit/0e76a05a4c44cf6a07beb54895fff1533e7e8922))
* ship the content script as one file and pin the aztec toolchain install ([#54](https://github.com/nulo-sh/nulo/issues/54)) ([3345189](https://github.com/nulo-sh/nulo/commit/33451896fa269cdb993a52185a9d5389cc424727))
* **storage:** check migration resume, keep tombstone ids, fence balance writes ([#72](https://github.com/nulo-sh/nulo/issues/72)) ([b3828a8](https://github.com/nulo-sh/nulo/commit/b3828a8d66a4392e0d09e024997285b7d0a035e9))
* **tokens:** one balance reducer, resumable token adds, adopted profile ids start clean ([#271](https://github.com/nulo-sh/nulo/issues/271)) ([8d01f9b](https://github.com/nulo-sh/nulo/commit/8d01f9b10b1b1a9a9572f0cdf2e24fd330ea8702))
* **wallet:** bind transfer reuse to sponsor, fence account writes, note epochs, rpc userinfo ([#60](https://github.com/nulo-sh/nulo/issues/60)) ([a6c2fb5](https://github.com/nulo-sh/nulo/commit/a6c2fb5b0558289c0c35dbcfa5ca6e084ab7dbea))
* **wallet:** one token contract spelling; bound a dApp session's pending calls ([#379](https://github.com/nulo-sh/nulo/issues/379)) ([7e2688a](https://github.com/nulo-sh/nulo/commit/7e2688aff2ceebd90405912e750cceb12691e5fb))
* **wallet:** scope-refuse a selector mismatch, purge broken account rows, redact log lines ([#237](https://github.com/nulo-sh/nulo/issues/237)) ([fb01d29](https://github.com/nulo-sh/nulo/commit/fb01d2991d695ac24967dc796f692c3debdf7038))


### Performance

* **incoming:** scan on new blocks with a 2-minute fallback, scan new public receipts first ([#420](https://github.com/nulo-sh/nulo/issues/420)) ([264a4b3](https://github.com/nulo-sh/nulo/commit/264a4b30f5ee41a8e2b1f74acd481289cf414452))


### Refactoring

* **design:** drop hand-picked type utilities and text props ([#361](https://github.com/nulo-sh/nulo/issues/361)) ([b545f4c](https://github.com/nulo-sh/nulo/commit/b545f4c7afece6bd8db899ad9bf11abb4456862d))
* drop a dead popup and unread fields, keep the crs cache on the legacy boot sweep ([#67](https://github.com/nulo-sh/nulo/issues/67)) ([320ef46](https://github.com/nulo-sh/nulo/commit/320ef465e321e01a824dca47881558e4570a5058))
* **popup:** pin list reducers under held reads, share the loader scrim and the shake ([#282](https://github.com/nulo-sh/nulo/issues/282)) ([2fef16a](https://github.com/nulo-sh/nulo/commit/2fef16ab86649cd48b279c20360ce63d064b2877))


### Tests

* **e2e:** assert both error arrays in the window-driving files ([#356](https://github.com/nulo-sh/nulo/issues/356)) ([dd92282](https://github.com/nulo-sh/nulo/commit/dd9228237a5115c2d39f7def1e79a3ab69119580))
* **e2e:** click fee rows once enabled and run the pr smoke lanes as three shards ([#9](https://github.com/nulo-sh/nulo/issues/9)) ([4cf8049](https://github.com/nulo-sh/nulo/commit/4cf80494a70152a01cc18c5df5637cff00594eda))
* **e2e:** fail reverted txs in waitForTxMined, reap zombie owners ([#298](https://github.com/nulo-sh/nulo/issues/298)) ([ca79036](https://github.com/nulo-sh/nulo/commit/ca790365b1613fa0426b5574bf137373f9d2d68f))
* **e2e:** hold the testnet node in the fee picker spec so artifact runs seed alone ([#318](https://github.com/nulo-sh/nulo/issues/318)) ([58d6cbc](https://github.com/nulo-sh/nulo/commit/58d6cbc6458f25c85fdb81e38082d7b9c5bd971e))
* **e2e:** prove multicall and no_from sends land, cover private transfer rows ([#293](https://github.com/nulo-sh/nulo/issues/293)) ([827e027](https://github.com/nulo-sh/nulo/commit/827e027644869d706c35129941c579b7e06e2c21))
* **e2e:** re-stage the store send frame clear of the footer ([#351](https://github.com/nulo-sh/nulo/issues/351)) ([1cb8d8b](https://github.com/nulo-sh/nulo/commit/1cb8d8b4e17b6586283cc6930bc183818a397913))
* **e2e:** read the awaiting card once it has its stage; explain the aztec boot bind line ([#65](https://github.com/nulo-sh/nulo/issues/65)) ([ab54194](https://github.com/nulo-sh/nulo/commit/ab54194e0e5e7ff706b63d70701fb1bacc345e1f))
* **e2e:** record each window a test asserts on; keep the zombie test's zombie ([#337](https://github.com/nulo-sh/nulo/issues/337)) ([af0e7f4](https://github.com/nulo-sh/nulo/commit/af0e7f41e4e1494144e8225bc155e8521084ad22))
* **e2e:** record extension-page errors on firefox through the driver's relay ([#313](https://github.com/nulo-sh/nulo/issues/313)) ([6488b1b](https://github.com/nulo-sh/nulo/commit/6488b1b11f04a740c609874d4daef225bfd3ae3d))
* **e2e:** run smoke behind a loopback guard that refuses and records every outside host ([#276](https://github.com/nulo-sh/nulo/issues/276)) ([f60125e](https://github.com/nulo-sh/nulo/commit/f60125ec542435c9c87af52515d58c0760aac2a5))
* **e2e:** stale network reset on a live sandbox, chaos and resume ([#487](https://github.com/nulo-sh/nulo/issues/487)) ([ef66313](https://github.com/nulo-sh/nulo/commit/ef663130817aca7840c0c43b85b8484dbada35fd))
* **e2e:** vitest-listed proverless guard, page-error normaliser, menu waits, firefox stall ([#292](https://github.com/nulo-sh/nulo/issues/292)) ([29d9e49](https://github.com/nulo-sh/nulo/commit/29d9e49fa5b53e583c70b560ebaff8a4d8698014))
* **e2e:** wait for the grant's final balance write before the drain ([#404](https://github.com/nulo-sh/nulo/issues/404)) ([d1e9355](https://github.com/nulo-sh/nulo/commit/d1e9355b7d67fe769eae0ffec49086afe1d36f7b))
* **soak:** run the node reference on every suite it can, list the bun-only ones ([#369](https://github.com/nulo-sh/nulo/issues/369)) ([1823144](https://github.com/nulo-sh/nulo/commit/1823144fc99ef6e1b91e64f5ebc6dae7cf5d8d4a))
* wait on load signals not sleeps, add the real decoder test, fix timeouts and configs ([#66](https://github.com/nulo-sh/nulo/issues/66)) ([833170d](https://github.com/nulo-sh/nulo/commit/833170de095e5dd3d799abba54235ab2ba1d57b2))


### Build

* **deps:** declare first-party deps, e2e the raw call field, retire stale lessons ([#437](https://github.com/nulo-sh/nulo/issues/437)) ([338bfc1](https://github.com/nulo-sh/nulo/commit/338bfc1b75b60f99eb8a92ab92a1f69fafd70b67))
* **extension:** type-check the e2e tree in typecheck ([#278](https://github.com/nulo-sh/nulo/issues/278)) ([af4afcc](https://github.com/nulo-sh/nulo/commit/af4afcc282dff67cf6ddbc4a7904978b311aaff9))
* gate launch on blank terms, verify store copies, bump presto-banners ([#261](https://github.com/nulo-sh/nulo/issues/261)) ([69eab05](https://github.com/nulo-sh/nulo/commit/69eab05c5df43de646fb38a6a86218d62b03d424))


### CI

* build storybook, read live e2e labels, cancel superseded heads, settle the shard fold ([#252](https://github.com/nulo-sh/nulo/issues/252)) ([c0e1e69](https://github.com/nulo-sh/nulo/commit/c0e1e696ab8e35123b7bcba1cfbfbdce40a92631))
* **deps:** clear the audit backlog and block unacknowledged advisories ([#62](https://github.com/nulo-sh/nulo/issues/62)) ([8b88e0c](https://github.com/nulo-sh/nulo/commit/8b88e0c8c43565b665be47784df289629dc48075))
* drop the dead fpc salt, pin docker bootstrap, escape workflow commands, guard comments ([#238](https://github.com/nulo-sh/nulo/issues/238)) ([8099368](https://github.com/nulo-sh/nulo/commit/8099368a172366c5b8a38cd1b877db5f5b999752))
* **e2e:** move the longest shard-4 network files into a dedicated heavy job ([#433](https://github.com/nulo-sh/nulo/issues/433)) ([2a518c3](https://github.com/nulo-sh/nulo/commit/2a518c37f6cf5f3d936c8b6a7238052c25655f3a))
* fail closed in the pr and release aggregators and queue same-head pr runs ([#10](https://github.com/nulo-sh/nulo/issues/10)) ([c64ca3b](https://github.com/nulo-sh/nulo/commit/c64ca3b2c78a549047b120ae0803ec7dd3de39e3))
* gate the nightly on firefox and send-chaos, and network prs on two chaos seeds ([#304](https://github.com/nulo-sh/nulo/issues/304)) ([73c000e](https://github.com/nulo-sh/nulo/commit/73c000ed97f888a12d428c3f2cfb59963cfaa1a4))
* group pr workflow runs by pull request number ([#1](https://github.com/nulo-sh/nulo/issues/1)) ([964f9ba](https://github.com/nulo-sh/nulo/commit/964f9ba97d4a5066aff0c05107542c3685ffdb1a))
* lint and typecheck scripts/, staged-preflight refusal, auto-unstick on by default ([#57](https://github.com/nulo-sh/nulo/issues/57)) ([86a89c5](https://github.com/nulo-sh/nulo/commit/86a89c54f78048e3bdc9501495d17ab43702bedc))
* **publish:** wait for the registry to serve every version before verifying ([#8](https://github.com/nulo-sh/nulo/issues/8)) ([37919c4](https://github.com/nulo-sh/nulo/commit/37919c4d40c7eecc21407d5f284ad1b0c86c7bf7))
* re-run the e2e lanes when a pull request's base changes ([#484](https://github.com/nulo-sh/nulo/issues/484)) ([0ac9e06](https://github.com/nulo-sh/nulo/commit/0ac9e0626d9e46cec43457bc90e97055e63e88e6))
* refuse bun auto-install, read the baseline move label live, name docker bun pins ([#286](https://github.com/nulo-sh/nulo/issues/286)) ([38f23bc](https://github.com/nulo-sh/nulo/commit/38f23bc2cfe214f178f115d6653aea2aa5b97489))
* **release:** attest release zips, publish via draft, narrow app tokens ([#50](https://github.com/nulo-sh/nulo/issues/50)) ([ce7b646](https://github.com/nulo-sh/nulo/commit/ce7b646626785bd86c66c260b2b314eb69add84e))
* **release:** prune nightly tags and releases to the newest fourteen ([#378](https://github.com/nulo-sh/nulo/issues/378)) ([e029d10](https://github.com/nulo-sh/nulo/commit/e029d10f16cd7b8455ef60649fc9bbbb793cef80))
* rename the network e2e jobs from aztec agent to network suite ([#46](https://github.com/nulo-sh/nulo/issues/46)) ([50540c8](https://github.com/nulo-sh/nulo/commit/50540c8ecabbdd7ac90b3b3611b222112f347351))
* run the firefox e2e lanes on draft pull requests ([#38](https://github.com/nulo-sh/nulo/issues/38)) ([153175e](https://github.com/nulo-sh/nulo/commit/153175e421764a74ca3285ed22cc0c0b8babd91c))
* shard release's opt-in network run, align nightly's lanes, correct the lane docs ([#42](https://github.com/nulo-sh/nulo/issues/42)) ([74d4e34](https://github.com/nulo-sh/nulo/commit/74d4e34bb03a453d54abdcdc65537f856039b6f1))
* show presto's blocked-access title, add the wasm nightly leg, close the launch-gate ask ([#370](https://github.com/nulo-sh/nulo/issues/370)) ([8931c8d](https://github.com/nulo-sh/nulo/commit/8931c8d93482a867592450613214479646b1155f))


### Misc

* **deps:** bump reviewdog/action-actionlint from 1.77.0 to 1.79.1 ([#327](https://github.com/nulo-sh/nulo/issues/327)) ([3da6412](https://github.com/nulo-sh/nulo/commit/3da6412de0996303879447eae15f6fb8806398a4))
* **deps:** bump the actions group across 1 directory with 2 updates ([#5](https://github.com/nulo-sh/nulo/issues/5)) ([d56bcc0](https://github.com/nulo-sh/nulo/commit/d56bcc071e17b1d5075071a9de9c54d6226cc871))
* **deps:** let dependabot update github actions weekly ([#2](https://github.com/nulo-sh/nulo/issues/2)) ([d9aeb66](https://github.com/nulo-sh/nulo/commit/d9aeb66fa5c5b77f1702c8ac525996e185833272))
* merge main into the 0.31.0 promote branch ([3b5897e](https://github.com/nulo-sh/nulo/commit/3b5897e9cf6601c82dd3d4ace10fbd6d5ec678f1))
* **plans:** ignore draft, outline, leg and eli5 transcript shapes and assert them ([#265](https://github.com/nulo-sh/nulo/issues/265)) ([4f34f56](https://github.com/nulo-sh/nulo/commit/4f34f563affc01f9bc288d7535b0811b77be7940))
* **publish:** prepare the [@nulo-sh](https://github.com/nulo-sh) packages 0.2.0 on aztec 6.0.0-rc.3 ([#481](https://github.com/nulo-sh/nulo/issues/481)) ([c1919e2](https://github.com/nulo-sh/nulo/commit/c1919e22cfe834c87adb5faf06f31f7c0c5210ec))
* **token-list:** empty the testnet list, its tokens went with the reset ([#429](https://github.com/nulo-sh/nulo/issues/429)) ([1610ff7](https://github.com/nulo-sh/nulo/commit/1610ff73013cdb260b32730321f044b8078cb299))
* **token-list:** publish sequence 1792005490 ([#425](https://github.com/nulo-sh/nulo/issues/425)) ([7e9eb0f](https://github.com/nulo-sh/nulo/commit/7e9eb0fc2ea450e36bbcef6472cb94e2a352f7dc))
* **token-list:** publish sequence 1792014908 ([#434](https://github.com/nulo-sh/nulo/issues/434)) ([ab9f5fa](https://github.com/nulo-sh/nulo/commit/ab9f5fa512e2aee7bd884a11c06e3582d5ab963a))


### Docs

* **ci:** correct stale facts in the ci docs ([#37](https://github.com/nulo-sh/nulo/issues/37)) ([1c6ecdd](https://github.com/nulo-sh/nulo/commit/1c6ecddb123eadffabf2ab9940af75cb9803e02f))
* **claude:** move complexity budgets and logging to skills; point plans and ci at standards ([#374](https://github.com/nulo-sh/nulo/issues/374)) ([175d826](https://github.com/nulo-sh/nulo/commit/175d826863bd11bff60c46b26277817982c66ac0))
* **claude:** record the landing domain rule in the release runbook ([#263](https://github.com/nulo-sh/nulo/issues/263)) ([e3b7bf5](https://github.com/nulo-sh/nulo/commit/e3b7bf54647f109414188c485b2d3b9d84ab51f9))
* correct stale references in docs, comments and test fixtures ([#7](https://github.com/nulo-sh/nulo/issues/7)) ([d10f7b0](https://github.com/nulo-sh/nulo/commit/d10f7b097a655e2afcd8319bc298492f9413d196))
* **launch:** record the owner's two v1.0.0 prerequisites ([#303](https://github.com/nulo-sh/nulo/issues/303)) ([79838db](https://github.com/nulo-sh/nulo/commit/79838db1cacf35f108cc318b5d8d157f7e02590b))
* **legal:** privacy 1.2.1, the explorer switch lives in "Settings → Privacy" ([6e4115a](https://github.com/nulo-sh/nulo/commit/6e4115a6549c72e44ef4e475e70b367294cc1204))
* **plans:** close accessibility-1 ([#245](https://github.com/nulo-sh/nulo/issues/245)) ([ac259a7](https://github.com/nulo-sh/nulo/commit/ac259a76946a22da76cc7a5427911b91ae9207bc))
* **plans:** close code-followups-1 ([#68](https://github.com/nulo-sh/nulo/issues/68)) ([c42033e](https://github.com/nulo-sh/nulo/commit/c42033e402bc9c24670bc385a6b1efcdde322868))
* **plans:** close code-followups-2 ([#240](https://github.com/nulo-sh/nulo/issues/240)) ([4a357b7](https://github.com/nulo-sh/nulo/commit/4a357b7fedbd9dc193974df4064679c90b0ea8eb))
* **plans:** close dapp-ingress-grants ([#342](https://github.com/nulo-sh/nulo/issues/342)) ([517aedf](https://github.com/nulo-sh/nulo/commit/517aedf1d8e5334fb542c2346905b65541294692))
* **plans:** close hardening-2 ([#73](https://github.com/nulo-sh/nulo/issues/73)) ([61060c0](https://github.com/nulo-sh/nulo/commit/61060c0ab16254a6e3d73ece124efe1c4834f683))
* **plans:** close incoming-transfers ([#446](https://github.com/nulo-sh/nulo/issues/446)) ([26a0936](https://github.com/nulo-sh/nulo/commit/26a09365cf2f890cfddc8db8dbeb0a80989bc91c))
* **plans:** close out and archive the dynamic token list ([#391](https://github.com/nulo-sh/nulo/issues/391)) ([83daa30](https://github.com/nulo-sh/nulo/commit/83daa30aff8de5296b7da8958849c8501c1c9e7a))
* **plans:** close security-fixes-1 ([#61](https://github.com/nulo-sh/nulo/issues/61)) ([cd20b86](https://github.com/nulo-sh/nulo/commit/cd20b86804a16af5eb85a30899e90738e33afd11))
* **plans:** close security-ui-1 ([#75](https://github.com/nulo-sh/nulo/issues/75)) ([79bbd7b](https://github.com/nulo-sh/nulo/commit/79bbd7bd2ee3f3723892852c294a8b3753ccf412))
* **plans:** close stale-network-reset ([#494](https://github.com/nulo-sh/nulo/issues/494)) ([234648c](https://github.com/nulo-sh/nulo/commit/234648ce4e6bec8dfe8eb46816618fa22a2f2dc3))
* **plans:** close supply-chain-release ([#63](https://github.com/nulo-sh/nulo/issues/63)) ([4b7718f](https://github.com/nulo-sh/nulo/commit/4b7718f9178a33b38c2b0520309ef9265a53b83d))
* **plans:** close the type-roles plan ([#368](https://github.com/nulo-sh/nulo/issues/368)) ([1c13b27](https://github.com/nulo-sh/nulo/commit/1c13b2765599dc7bff601fe087ad3b1fd476c471))
* **release:** point the release notes at the store listings ([#11](https://github.com/nulo-sh/nulo/issues/11)) ([6af019f](https://github.com/nulo-sh/nulo/commit/6af019fa661fbb0072a0bd1ce93efa6e00786c75))
* track open work in github issues and advisories, retire follow-ups.md ([#236](https://github.com/nulo-sh/nulo/issues/236)) ([be4d044](https://github.com/nulo-sh/nulo/commit/be4d0445b94aa6551a9b284642df6b284f9eeb91))

## 0.30.2 (2026-10-06)

Initial release.
