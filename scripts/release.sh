#!/usr/bin/env bash
# Build, sign, tag and publish a Chipless release to GitHub.
# Usage: scripts/release.sh <version>      e.g. scripts/release.sh 1.0.1
# Needs: release key configured in ~/.gradle/gradle.properties (CHIPLESS_STORE_FILE etc.), gh CLI logged in.
set -euo pipefail
cd "$(dirname "$0")/.."

ver="${1:?usage: scripts/release.sh <version>}"
[[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "working tree not clean"; exit 1; }
git rev-parse "v$ver" >/dev/null 2>&1 && { echo "tag v$ver already exists"; exit 1; }

cur=$(sed -n 's/^chiplessVersion=//p' gradle.properties)
code=$(sed -n 's/^chiplessVersionCode=//p' gradle.properties)
if [[ "$ver" != "$cur" ]]; then
  code=$((code + 1))
  sed -i "s/^chiplessVersion=.*/chiplessVersion=$ver/; s/^chiplessVersionCode=.*/chiplessVersionCode=$code/" gradle.properties
fi

# Keep the website's structured data on the current version.
sed -i "s/\"softwareVersion\": \"[0-9.]*\"/\"softwareVersion\": \"$ver\"/" site/index.html
[[ -f "fastlane/metadata/android/en-US/changelogs/$code.txt" ]] || echo "note: no fastlane changelog for versionCode $code"

# Commit the version bump first so the APK is built from exactly the tagged commit (reproducible builds).
if [[ -n "$(git status --porcelain gradle.properties site/index.html)" ]]; then
  git commit -qm "chore(release): v$ver" gradle.properties site/index.html
fi

./gradlew clean :engine:test :server:test :android:assembleRelease

apk=android/build/outputs/apk/release/android-release.apk
sdk="${ANDROID_HOME:-$HOME/Android/Sdk}"
apksigner=$(ls -d "$sdk"/build-tools/*/apksigner | sort -V | tail -1)
certs=$("$apksigner" verify --print-certs "$apk")
grep -q "CN=Chipless" <<<"$certs" || { echo "APK is not signed with the Chipless release key"; exit 1; }

mkdir -p dist
cp "$apk" dist/chipless.apk
sha=$(sha256sum dist/chipless.apk | cut -d' ' -f1)
size=$(( $(stat -c %s dist/chipless.apk) / 1024 ))

git tag -a "v$ver" -m "Chipless v$ver"
git push origin HEAD "v$ver"

notes=$(mktemp)
cat > "$notes" <<NOTES
**Download:** \`chipless.apk\` below (${size} KB, Android 8.0+). Only the host needs it. Friends join from any browser.

Install: open the APK on your phone and allow installs from your browser if asked. Updates install over older versions.

SHA-256: \`$sha\`
NOTES
gh release create "v$ver" dist/chipless.apk --title "Chipless v$ver" --notes-file "$notes" --generate-notes
rm -f "$notes"
echo "Released v$ver"
scripts/indexnow.sh || true
