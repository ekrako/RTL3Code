# RTL3Code releases

RTL3Code publishes desktop installers, standalone server archives, checksums and
update manifests in `ekrako/RTL3Code` through **RTL3Code Release**
(`.github/workflows/rtl3code-release.yml`). It uses standard GitHub-hosted runners
and the repository's workflow token. No npm, Vercel, AUR, Blacksmith or upstream
relay credentials are required. The inherited upstream release workflow remains
restricted to its original repository.

## Publish

Run **Actions → RTL3Code Release → Run workflow** on `main`. Choose `stable`
and optionally enter a plain version such as `0.1.11`; leaving it blank increments
the last published stable patch (or the desktop package version before the first
release). A pushed `vX.Y.Z` tag releases that exact commit. Existing published
versions cannot be overwritten.

Choose `nightly` for a manual prerelease. Automatic nightly checks run every half
hour and publish only when `main` changed and at least six hours have passed since
the last nightly. Repository variable `PAUSE_NIGHTLY=true` pauses scheduled runs.
Nightly versions preview the patch after the latest stable. Builds are serialized.

CI for the exact source commit must pass, every platform must build, and
the Linux x64/macOS arm64 packaged launch checks must pass before publication.
The release stays a draft while assets upload; updater clients only see it after
publication. Failed runs can leave a draft, which a rerun can complete. After a
release is published, use a new version for any correction.

## Install and update

Linux installations that should update in place must run the release's AppImage,
not an unpacked `dir` build. `scripts/install-rtl3code-appimage.sh` installs the
current stable AppImage and a separate desktop entry without touching T3 Code.
Run it again to migrate an older local development install. Existing
`~/.rtl3code` server data stays in place; Electron uses `rtl3code-v2` as its own
profile. Do not copy or migrate T3 Code's Chromium profiles into it.

Desktop checks run after 15 seconds, every four hours, and on a manual check.
The repository baked into `app-update.yml` is `ekrako/RTL3Code`. Stable reads the
`latest*.yml` feeds; nightly also uses the `update-feed` release's `nightly.json`
pointer. Keep that release public and never mark it latest. `release.json` in
each release supplies the version and database migration compatibility used by
web, desktop and mobile clients when inspecting a server or switching tracks.
The standalone server updater downloads its archives from the same repository.

Stable and nightly releases require a Developer ID Application certificate and
Apple notarization for both Mac architectures. Add the GitHub Actions secrets
`CSC_LINK` (base64-encoded Developer ID Application .p12), `CSC_KEY_PASSWORD`,
`APPLE_API_KEY` (the .p8 file contents), `APPLE_API_KEY_ID`, and
`APPLE_API_ISSUER`. The Mac jobs check the app in both the installer DMG and
the updater ZIP with macOS before uploading either artifact. Keep the same
Developer ID team for automatic updates.

Windows builds without signing credentials may show SmartScreen warnings.
Mobile App Store/Google Play builds and Expo OTA require separate application
identities and store credentials and are not published by this desktop workflow.
