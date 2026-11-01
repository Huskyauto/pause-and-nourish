#!/usr/bin/env bash
# Reproducible native project; Gradle's cache/SDK live outside this source tree.
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?Set ANDROID_HOME to an Android SDK with platform 36 and build tools 35.0.0}"
if [[ -n "${GRADLE_BIN:-}" ]]; then
  exec "$GRADLE_BIN" --no-daemon testDebugUnitTest lintDebug assembleDebug "$@"
fi
if command -v gradle >/dev/null 2>&1; then
  exec gradle --no-daemon testDebugUnitTest lintDebug assembleDebug "$@"
fi
printf '%s\n' 'Set GRADLE_BIN to Gradle 8.13+ (tested with 9.3.1), then run bash build.sh.' >&2
exit 1
