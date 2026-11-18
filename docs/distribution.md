# Distribution and launch checklist

How Chipless reaches people, in order of payoff. Research date: 2026-11-17.

## Facts every channel needs
| | |
|---|---|
| Package | `io.github.sambuaneesh.chipless` |
| Signing cert SHA-256 | `a562dd57a4542e6eee37b12877825b42129813aa48efb8832d5a5d755c0a762f` |
| Release asset | `https://github.com/sambuaneesh/chipless/releases/download/v<version>/chipless.apk` |
| Store metadata | `fastlane/metadata/android/en-US/` (title, descriptions, changelogs per versionCode, icon, feature graphic, screenshots) |
| License | GPL-3.0-only. No proprietary libraries, no trackers, no Google services. Anti-features: none. |
| Reproducible | Yes. `vcsInfo` off, web assets gzipped with pinned pure-JS `fflate`, release built from the tagged commit. Two clean checkouts build byte-identical APKs. |

## 1. IzzyOnDroid (do first, ~1–2 weeks)
Open an issue at <https://codeberg.org/IzzyOnDroid/repodata/issues> with the **AppRequest** template:

> **App:** Chipless, https://github.com/sambuaneesh/chipless
> **License:** GPL-3.0-only
> **Description:** Poker chips app for real-card Texas Hold'em home games. One phone tracks chips, blinds, pots and side pots, coaches beginners, and can host the table over Wi-Fi/hotspot so friends join from a browser (LAN only, no internet).
> **APK:** attached to every GitHub release as `chipless.apk` (~125 KB), signed with our own key (cert SHA-256 above). Fastlane metadata in the repo.
> **Build:** `./gradlew :android:assembleRelease` (JDK 21, Node 22+ for the web UI, which Gradle builds with `npm ci` + esbuild). Builds are reproducible.
> **Trackers / non-free deps:** none. No AndroidX either.
> **AI use:** parts of the code were written with an AI coding assistant and reviewed and tested by the author.

## 2. F-Droid (wait until ~Feb 2027, when the repo is 3 months old)
Fork <https://gitlab.com/fdroid/fdroiddata>, add `metadata/io.github.sambuaneesh.chipless.yml`, open an MR titled "New App: Chipless".

```yaml
Categories:
  - Games
License: GPL-3.0-only
AuthorName: Aneesh Sambu
WebSite: https://sambuaneesh.github.io/chipless/
SourceCode: https://github.com/sambuaneesh/chipless
IssueTracker: https://github.com/sambuaneesh/chipless/issues
Changelog: https://github.com/sambuaneesh/chipless/releases

AutoName: Chipless

RepoType: git
Repo: https://github.com/sambuaneesh/chipless.git
Binaries: https://github.com/sambuaneesh/chipless/releases/download/v%v/chipless.apk

Builds:
  - versionName: 1.0.2
    versionCode: 3
    commit: v1.0.2
    subdir: android
    sudo:
      - apt-get update
      - apt-get install -y npm
    gradle:
      - yes

AllowedAPKSigningKeys: a562dd57a4542e6eee37b12877825b42129813aa48efb8832d5a5d755c0a762f

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 1.0.2
CurrentVersionCode: 3
```

Before submitting:
- Check that F-Droid's buildserver knows Gradle 9.8.1 (the gradlew-fdroid checksum list) and that its Node/npm can run esbuild 0.28. Mention in the MR that esbuild ships a prebuilt binary through npm.
- Run `fdroid lint` and `fdroid build -v -l io.github.sambuaneesh.chipless` locally or in the fork's CI.
- New apps get a line in F-Droid's weekly TWIF post. You can also post in the TWIF submission thread on forum.f-droid.org.

## 3. Obtainium (works today)
Users add `https://github.com/sambuaneesh/chipless`. One-tap link (already on the site and in the README):
`https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/sambuaneesh/chipless`.
The crowdsourced app list needs at least 35 stars and a 4-month-old project, so submit later.

## 4. Google's developer verification (decide before 2027)
Since 30 Sept 2026, Android requires apps from Play and partner stores to be registered, but only in Brazil, Indonesia, Singapore and Thailand. Global enforcement for sideloaded APKs is planned for 2027. Registering means an Android Developer Console account ($25 plus ID), then registering the package plus the cert SHA-256 above. F-Droid opposes the scheme. Because F-Droid and Izzy ship our own signature (reproducible builds), one registration would cover every channel.

## 5. Google Play (optional, biggest reach)
Costs $25 plus ID. New personal accounts must first run a closed test with at least 12 testers for 14 days. Play needs an AAB (`bundleRelease`) and Play App Signing with our existing key, a privacy policy URL (we collect nothing), a Data safety form (no data collected), a justification for the `specialUse` foreground service ("hosting a local game server for other phones in the room"), and the IARC questionnaire. Answer it honestly: the app has no gambling, it only tracks scores for a real card game.

## Not worth it now
- **Accrescent:** closed to new submissions.
- **Amazon Appstore:** gone from Android.
- **Samsung Galaxy Store:** needs business seller status.
- **Huawei AppGallery:** needs ID and a bank card, and has a small audience.
- **APKMirror:** mirrors only.

## Web search
- **Google Search Console:** add a URL-prefix property for `https://sambuaneesh.github.io/chipless/` and submit `sitemap.xml`. Verify with the HTML-file method by putting the file in `site/`.
- **Bing Webmaster Tools:** import from Search Console. Bing's index also feeds ChatGPT search, Copilot and DuckDuckGo.
- **IndexNow:** the key file is `site/<key>.txt`. After big site changes, run `scripts/indexnow.sh`.
- **robots.txt:** crawlers only read `robots.txt` at the host root, which is the separate `sambuaneesh.github.io` repo. Adding one there with `Sitemap: https://sambuaneesh.github.io/chipless/sitemap.xml` helps. A custom domain would fix this for good.
- **Rich results:** Google no longer shows FAQ rich results, and app stars need real reviews. Never add a self-written `aggregateRating`.

## Launch sequence (one post per community, rewritten for each, spaced out)
**Rules that apply everywhere:**
- Disclose that you're the developer.
- Reply to every comment.
- Never ask anyone for upvotes.
- Keep self-promotion to about 10% of what you post.

**Name clash: another "Chipless" exists.** playchipless.com is a free browser app with the same name and a similar idea, online since July 2025. Their pitch is "Poker set in your pocket" and "Phones replace the chips"; their site is light and minimal. Keep ours unmistakably different:
- Lead with the referee: **"You deal the cards. Chipless deals with the rest."** and the "every home game needs a floor" idea. Quote the app's real sentences rather than describing them.
- Never use "pocket", "phones replace the chips" or "poker set" in our copy.
- Say "Chipless for Android", and link the GitHub repo or our site, so readers can tell the two apart. Mention what only we do: runs with no internet, open source, explains every ruling.
- Visual identity: dark felt, brass, Fraunces display type, cream "ruling slips".

**Position against TableChips** (GPL, on F-Droid, also uses browser join). Credit it, and lead with what's different: the rules coach, the showdown referee that explains "who wins and why", fewest-transfer settle-up, pass-and-play, and the ~125 KB size.

1. **AlternativeTo:** add Chipless and mark it as an alternative to HG Poker and EasyPoker.
2. **Show HN**, Tuesday 8–10 am US Eastern:
   - **Title:** "Show HN: A 125 KB Android app that hosts a poker table over Wi-Fi with a hand-written WebSocket server"
   - **Body:** what it is, why it exists (a friends' game with no chips), and the technical story (no AndroidX, an event-sourced rules engine, a 45 KB Preact client, reproducible builds). Link the repo and the site.
3. **r/fossdroid** ("Application Release" flair, state the license), **c/fdroid@lemmy.ml** and **c/androidapps@lemmy.world**:
   - **Title:** "Chipless for Android: a 125 KB GPL poker referee. You deal real cards, it runs the chips and explains every showdown; friends join over hotspot, no internet"
4. **dev.to / Hashnode** write-up, then link it from **r/opensource** ("Promotional" flair) and **r/coolgithubprojects**.
5. **r/droidappshowcase** and **r/SideProject:** "Chipless for Android: you deal the cards, it deals with the rest (chips, turns, who won and why, fewest-payment settle-up)".
6. **Poker players** (message the r/poker mods first; r/pokerhomegames):
   - **Title:** "Played at a friend's with no chips, so I made a free app: everyone joins from their browser by QR, it handles blinds/side pots and tells beginners who won and why"
7. **15-second vertical demo:** a YouTube Short titled "How to play poker without chips using your phone", plus Reels and TikTok.
8. **Ongoing:** search monthly for people asking for a "poker chips app" or how to "settle up poker" and answer helpfully, with disclosure. Submit to offa/android-foss after 6 months of development, about May 2027.
