# Android (TWA)

The Android app is a **Trusted Web Activity**: a thin native shell that opens
https://otakuroad.pages.dev in Chrome with no browser UI. The map, the sheet and the data are the
same code that runs on the web, so there is nothing to keep in sync — shipping a data fix to the
site ships it to the app.

- `twa-manifest.json` — the build config (package name, colours, icons, which URL to wrap).
- The generated Gradle project, the keystore and the built binaries are **not** committed. See
  `.gitignore`.

## Why TWA rather than a WebView wrapper

Capacitor or Cordova would render in a system WebView, which on Android is a different engine from
the user's Chrome and historically weaker at WebGL — and this app is a WebGL map. A TWA hands the
page to Chrome itself, so performance matches the browser exactly and the download is about 1 MB
instead of tens.

## Building

Needs JDK 17 and the Android SDK. Bubblewrap generates the Gradle project; Gradle then builds it
and the Android build tools sign it. The split matters because `bubblewrap build` prompts
interactively and cannot be scripted reliably — piping answers into it once wrote the literal
string `y` into the app's version name.

```bash
export ANDROID_HOME=~/.otakuroad-android/sdk
export JAVA_HOME=~/.otakuroad-android/jdk/Contents/Home

# 1. regenerate the Gradle project after editing twa-manifest.json (interactive, answer "y")
npx @bubblewrap/cli update

# 2. build, from android/
./gradlew --no-daemon assembleRelease bundleRelease

# 3. align and sign
BT=$ANDROID_HOME/build-tools/36.1.0
$BT/zipalign -p -f 4 app/build/outputs/apk/release/app-release-unsigned.apk otakuroad-<version>.apk
$BT/apksigner sign --ks android.keystore --ks-key-alias otakuroad \
  --ks-pass "pass:$(cat keystore-password.txt)" --key-pass "pass:$(cat keystore-password.txt)" \
  otakuroad-<version>.apk
cp app/build/outputs/bundle/release/app-release.aab otakuroad-<version>.aab
```

After `bubblewrap update`, check `app/build.gradle` still carries the `versionCode` and
`versionName` you meant — that is the file the build actually reads, not `twa-manifest.json`.

## Releasing a new version

Bump `appVersionCode` (must increase) and `appVersionName` in `twa-manifest.json`, regenerate,
rebuild, sign. Nothing else changes: the app is a window onto the live site, so shipping data or UI
fixes needs no new APK at all — only a change to the app's own shell does.

## The signing key

`android.keystore` signs the app and is **not in this repository**. Two things follow:

1. **Back it up.** If it is lost, Google Play will not accept an update to an app signed with it,
   and sideloaded users cannot upgrade in place — they must uninstall first. Keep the file and its
   passwords in a password manager.
2. **Its fingerprint is public.** `public/.well-known/assetlinks.json` on the site carries the
   SHA-256 of this key. That file is what tells Chrome the app is allowed to render the site
   without an address bar; if the fingerprint and the key disagree, the app still works but shows
   a URL bar at the top.

Re-print the fingerprint with:

```bash
keytool -list -v -keystore android/android.keystore -alias otakuroad | grep SHA256
```
