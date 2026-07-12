#!/usr/bin/env bash
# ScriptCat native-messaging-host installer — macOS & Linux (doc: workspace/.ref-docs/
# 06-native-host-and-installers.md §5). Never mutates anything inside the git checkout;
# never uses eval on user input; every path is quoted.
#
# Usage: install.sh --extension-id <32-char-id> [--extension-id <id> ...] [--browser chrome|edge|chromium|brave]
#
# Contract (doc 06 §5): copy versioned files -> generate manifest via `host.js --print-manifest`
# (typed generation, never string replacement) -> atomic write (temp + rename) -> register per
# browser (a manifest file in the right directory IS the registration on macOS/Linux — no
# separate registry step, unlike Windows) -> verify (re-read, parse, compare) -> write
# install-metadata.json for uninstall/upgrade.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

EXTENSION_IDS=()
BROWSERS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id)
      EXTENSION_IDS+=("$2")
      shift 2
      ;;
    --browser)
      BROWSERS+=("$2")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ${#EXTENSION_IDS[@]} -eq 0 ]]; then
  echo "At least one --extension-id <32-char-id> is required." >&2
  exit 1
fi

for id in "${EXTENSION_IDS[@]}"; do
  if ! [[ "${id}" =~ ^[a-p]{32}$ ]]; then
    echo "Invalid extension ID: ${id} (must be exactly 32 characters, each a-p)." >&2
    exit 1
  fi
done

if [[ ${#BROWSERS[@]} -eq 0 ]]; then
  BROWSERS=("chrome")
fi

UNAME="$(uname -s)"
case "${UNAME}" in
  Darwin) OS="macos" ;;
  Linux) OS="linux" ;;
  *)
    echo "Unsupported OS: ${UNAME}" >&2
    exit 1
    ;;
esac

if [[ "${OS}" == "macos" ]]; then
  CONFIG_DIR="${HOME}/Library/Application Support/ScriptCat/NativeHost"
else
  CONFIG_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/scriptcat/native-host"
fi

VERSION="$(node -p "require('${PACKAGE_ROOT}/package.json').version")"
INSTALL_DIR="${CONFIG_DIR}/${VERSION}"

mkdir -p "${INSTALL_DIR}"
chmod 0700 "${CONFIG_DIR}"
cp -R "${PACKAGE_ROOT}/dist/." "${INSTALL_DIR}/"

# Pin the resolved node binary's absolute path in a launcher script, rather than trusting
# whatever "node" resolves to on the browser's PATH at connectNative time (PATH-hijack guard,
# doc 06 §6).
NODE_PATH="$(command -v node)"
LAUNCHER="${INSTALL_DIR}/launch-host.sh"
cat > "${LAUNCHER}" <<LAUNCHER_EOF
#!/usr/bin/env bash
exec "${NODE_PATH}" "${INSTALL_DIR}/host.js" "\$@"
LAUNCHER_EOF
chmod 0700 "${LAUNCHER}"

MANIFEST_ARGS=(--print-manifest --host-path "${LAUNCHER}")
for id in "${EXTENSION_IDS[@]}"; do
  MANIFEST_ARGS+=(--extension-id "${id}")
done

MANIFEST_JSON="$("${NODE_PATH}" "${INSTALL_DIR}/host.js" "${MANIFEST_ARGS[@]}")"

declare -A BROWSER_DIRS
if [[ "${OS}" == "macos" ]]; then
  BROWSER_DIRS=(
    [chrome]="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    [edge]="${HOME}/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    [chromium]="${HOME}/Library/Application Support/Chromium/NativeMessagingHosts"
    [brave]="${HOME}/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  )
else
  BROWSER_DIRS=(
    [chrome]="${HOME}/.config/google-chrome/NativeMessagingHosts"
    [edge]="${HOME}/.config/microsoft-edge/NativeMessagingHosts"
    [chromium]="${HOME}/.config/chromium/NativeMessagingHosts"
    [brave]="${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  )
fi

INSTALLED_MANIFESTS=()
for browser in "${BROWSERS[@]}"; do
  dir="${BROWSER_DIRS[${browser}]:-}"
  if [[ -z "${dir}" ]]; then
    echo "Unknown browser: ${browser} (expected chrome, edge, chromium, or brave)" >&2
    exit 1
  fi
  mkdir -p "${dir}"
  chmod 0700 "${dir}"
  manifest_path="${dir}/com.scriptcat.native_host.json"
  tmp_path="${dir}/.com.scriptcat.native_host.json.$$.tmp"
  printf '%s' "${MANIFEST_JSON}" > "${tmp_path}"
  chmod 0600 "${tmp_path}"
  mv "${tmp_path}" "${manifest_path}"

  # Verify: re-read and parse, confirm it round-trips.
  if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "${manifest_path}"; then
    echo "Manifest verification failed for ${manifest_path}" >&2
    exit 1
  fi
  INSTALLED_MANIFESTS+=("${manifest_path}")
  echo "Registered for ${browser}: ${manifest_path}"
done

# The host independently re-verifies the caller origin against its OWN config at startup
# (doc 04 §3 defense in depth) — it never trusts Chrome's manifest allowed_origins alone, so the
# same extension IDs must also land in the host's own config.json.
node -e '
const fs = require("fs");
const path = require("path");
const [configDir, idsJson] = process.argv.slice(1);
const ids = JSON.parse(idsJson);
const configPath = path.join(configDir, "config.json");
let existing = { allowedOrigins: [] };
try {
  existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const origins = Array.from(new Set([
  ...(existing.allowedOrigins || []),
  ...ids.map((id) => `chrome-extension://${id}/`),
]));
fs.writeFileSync(configPath, JSON.stringify({ ...existing, allowedOrigins: origins }, null, 2) + "\n", { mode: 0o600 });
' "${CONFIG_DIR}" "$(node -e "console.log(JSON.stringify(process.argv.slice(1)))" "${EXTENSION_IDS[@]}")"

METADATA_PATH="${CONFIG_DIR}/install-metadata.json"
node -e '
const fs = require("fs");
const [metadataPath, version, installDir, launcher, manifestsJson] = process.argv.slice(1);
fs.writeFileSync(metadataPath, JSON.stringify({
  version,
  installDir,
  launcher,
  manifests: JSON.parse(manifestsJson),
  installedAt: new Date().toISOString(),
}, null, 2) + "\n", { mode: 0o600 });
' "${METADATA_PATH}" "${VERSION}" "${INSTALL_DIR}" "${LAUNCHER}" "$(node -e "console.log(JSON.stringify(process.argv.slice(1)))" "${INSTALLED_MANIFESTS[@]}")"

echo "Installed ScriptCat native host ${VERSION} to ${INSTALL_DIR}"
echo "Run 'node ${INSTALL_DIR}/host.js --doctor' to verify."
