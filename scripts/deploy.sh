#!/usr/bin/env bash
# Pubblica regole Firestore + app web (PWA) su Firebase Hosting e ricostruisce l'APK.
# Prerequisiti: node scripts/set-config.mjs config.json  (una volta)
# Accesso: `npx firebase login` con un account membro del progetto
#          oppure export GOOGLE_APPLICATION_CREDENTIALS=/percorso/service-account.json
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT=$(node -e "console.log(require('./.firebaserc').projects.default)")
[ "$PROJECT" = "demo-natom" ] && { echo "Configura prima il progetto: node scripts/set-config.mjs config.json"; exit 1; }
npm run build
npx firebase deploy --project "$PROJECT" --only firestore:rules,hosting
echo "Web app: https://$PROJECT.web.app"
if [ "${1:-}" = "--apk" ]; then
  export JAVA_HOME=${JAVA_HOME:-/home/box/jdk} ANDROID_HOME=${ANDROID_HOME:-/home/box/android-sdk}
  npx cap sync android && (cd android && ./gradlew assembleDebug) && cp android/app/build/outputs/apk/debug/app-debug.apk NatomVisite-debug.apk
  echo "APK: $(pwd)/NatomVisite-debug.apk"
fi
