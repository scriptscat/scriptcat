#!/usr/bin/env bash
# ScriptCat native-messaging-host uninstaller — macOS & Linux (doc 06 §5). Removes every
# manifest install.sh registered plus the versioned program files, leaving nothing stale.

set -euo pipefail

UNAME="$(uname -s)"
case "${UNAME}" in
  Darwin) CONFIG_DIR="${HOME}/Library/Application Support/ScriptCat/NativeHost" ;;
  Linux) CONFIG_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/scriptcat/native-host" ;;
  *)
    echo "Unsupported OS: ${UNAME}" >&2
    exit 1
    ;;
esac

METADATA_PATH="${CONFIG_DIR}/install-metadata.json"

if [[ ! -f "${METADATA_PATH}" ]]; then
  echo "No install-metadata.json found at ${METADATA_PATH} — nothing to uninstall." >&2
  exit 0
fi

MANIFESTS_JSON="$(node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).manifests || []))" "${METADATA_PATH}")"
INSTALL_DIR="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).installDir || '')" "${METADATA_PATH}")"

while IFS= read -r manifest_path; do
  [[ -z "${manifest_path}" ]] && continue
  if [[ -f "${manifest_path}" ]]; then
    rm -f "${manifest_path}"
    echo "Removed ${manifest_path}"
  fi
done < <(node -e "JSON.parse(process.argv[1]).forEach((m) => console.log(m))" "${MANIFESTS_JSON}")

if [[ -n "${INSTALL_DIR}" && -d "${INSTALL_DIR}" ]]; then
  rm -rf "${INSTALL_DIR}"
  echo "Removed ${INSTALL_DIR}"
fi

rm -f "${METADATA_PATH}"
echo "ScriptCat native host uninstalled."
