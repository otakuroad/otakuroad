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

Needs JDK 17 and the Android SDK. `npm run android:build` at the repo root wraps the steps.

```bash
npx @bubblewrap/cli build          # from android/, produces app-release-signed.apk and app-release-bundle.aab
```

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
