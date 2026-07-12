#!/usr/bin/env bash
# ScriptCat native-messaging-host installer — macOS & Linux. Never mutates anything inside the
# git checkout; never uses eval on user input; every path is quoted.
#
# Usage: install.sh --extension-id <32-char-id> [--extension-id <id> ...] [--browser chrome|edge|chromium|brave]
#
# Contract: copy versioned files -> generate manifest via `host.js --print-manifest` (typed
# generation, never string replacement) -> atomic write (temp + rename) -> register per browser
# (a manifest file in the right directory IS the registration on macOS/Linux — no separate
# registry step, unlike Windows) -> verify (re-read, parse, compare) -> write
# install-metadata.json for uninstall/upgrade.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

EXTENSION_IDS=()
BROWSERS=()
ROLLBACK=0

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
    --rollback)
      ROLLBACK=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

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

# --rollback restores the manifest(s) registered by the last install to point at the previous
# version's launcher, using the extension IDs already embedded in each manifest's allowed_origins
# — it does not require --extension-id and does not delete the newer version's install dir (that
# dir is what makes the rollback possible in the first place).
if [[ "${ROLLBACK}" -eq 1 ]]; then
  METADATA_PATH="${CONFIG_DIR}/install-metadata.json"
  if [[ ! -f "${METADATA_PATH}" ]]; then
    echo "No install-metadata.json found at ${METADATA_PATH} — nothing to roll back." >&2
    exit 1
  fi
  HAS_PREVIOUS="$(node -e "console.log(!!JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).previous)" "${METADATA_PATH}")"
  if [[ "${HAS_PREVIOUS}" != "true" ]]; then
    echo "No previous version recorded in ${METADATA_PATH} — nothing to roll back to." >&2
    exit 1
  fi

  # Rewrite each manifest install.sh registered to point at the previous version's launcher,
  # reusing the extension IDs already embedded in that manifest's allowed_origins — no
  # --extension-id required for a rollback. Does not delete the newer version's install dir.
  ROLLBACK_SUMMARY="$(node -e '
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const [metadataPath, configDir] = process.argv.slice(1);
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const previous = metadata.previous;

for (const manifestPath of metadata.manifests) {
  const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const ids = (existing.allowed_origins || []).map((origin) => origin.replace("chrome-extension://", "").replace(/\/$/, ""));
  const args = ["--print-manifest", "--host-path", previous.launcher, ...ids.flatMap((id) => ["--extension-id", id])];
  const manifestJson = execFileSync(process.execPath, [path.join(previous.installDir, "host.js"), ...args], { encoding: "utf-8" });
  const tmpPath = path.join(path.dirname(manifestPath), `.${path.basename(manifestPath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, manifestJson, { mode: 0o600 });
  fs.renameSync(tmpPath, manifestPath);
  console.error(`Restored ${manifestPath} -> ${previous.launcher}`);
}

const rolledBackMetadata = {
  version: previous.version,
  installDir: previous.installDir,
  launcher: previous.launcher,
  manifests: metadata.manifests,
  installedAt: new Date().toISOString(),
};
fs.writeFileSync(metadataPath, JSON.stringify(rolledBackMetadata, null, 2) + "\n", { mode: 0o600 });
console.log(previous.version);
' "${METADATA_PATH}" "${CONFIG_DIR}")"

  echo "Rolled back to ScriptCat native host ${ROLLBACK_SUMMARY}"
  exit 0
fi

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

VERSION="$(node -p "require('${PACKAGE_ROOT}/package.json').version")"
INSTALL_DIR="${CONFIG_DIR}/${VERSION}"

mkdir -p "${INSTALL_DIR}"
chmod 0700 "${CONFIG_DIR}"
cp -R "${PACKAGE_ROOT}/dist/." "${INSTALL_DIR}/"

# Pin the resolved node binary's absolute path in a launcher script, rather than trusting
# whatever "node" resolves to on the browser's PATH at connectNative time — this is a PATH-hijack
# guard: a malicious "node" earlier on PATH must not be able to intercept the browser's launch.
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

# Deliberately not `declare -A` (bash 4+ only): macOS ships bash 3.2 as /bin/bash (and therefore
# as whatever `#!/usr/bin/env bash` resolves to for most users) for licensing reasons and has not
# upgraded it in over a decade, so an associative array here would fail this installer on stock
# macOS — exactly the platform this script targets. A case statement is portable back to bash 3.x.
browser_dir() {
  case "${OS}:$1" in
    macos:chrome) echo "${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
    macos:edge) echo "${HOME}/Library/Application Support/Microsoft Edge/NativeMessagingHosts" ;;
    macos:chromium) echo "${HOME}/Library/Application Support/Chromium/NativeMessagingHosts" ;;
    macos:brave) echo "${HOME}/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    linux:chrome) echo "${HOME}/.config/google-chrome/NativeMessagingHosts" ;;
    linux:edge) echo "${HOME}/.config/microsoft-edge/NativeMessagingHosts" ;;
    linux:chromium) echo "${HOME}/.config/chromium/NativeMessagingHosts" ;;
    linux:brave) echo "${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    *) echo "" ;;
  esac
}

INSTALLED_MANIFESTS=()
for browser in "${BROWSERS[@]}"; do
  dir="$(browser_dir "${browser}")"
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

# The host independently re-verifies the caller origin against its OWN config at startup — this
# is defense in depth: it never trusts Chrome's manifest allowed_origins alone, so the same
# extension IDs must also land in the host's own config.json.
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
# Installing a new version over an existing install-metadata.json records the just-superseded
# version as `previous`, so a later `install.sh --rollback` has somewhere to go back to. A re-run
# of the SAME version (e.g. re-registering a browser) is not an upgrade and must not overwrite an
# already-recorded `previous`.
node -e '
const fs = require("fs");
const [metadataPath, version, installDir, launcher, manifestsJson] = process.argv.slice(1);
let previous;
try {
  const existing = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  if (existing.version !== version) {
    previous = { version: existing.version, installDir: existing.installDir, launcher: existing.launcher };
  }
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
fs.writeFileSync(metadataPath, JSON.stringify({
  version,
  installDir,
  launcher,
  manifests: JSON.parse(manifestsJson),
  installedAt: new Date().toISOString(),
  ...(previous ? { previous } : {}),
}, null, 2) + "\n", { mode: 0o600 });
' "${METADATA_PATH}" "${VERSION}" "${INSTALL_DIR}" "${LAUNCHER}" "$(node -e "console.log(JSON.stringify(process.argv.slice(1)))" "${INSTALLED_MANIFESTS[@]}")"

echo "Installed ScriptCat native host ${VERSION} to ${INSTALL_DIR}"
echo "Run 'node ${INSTALL_DIR}/host.js --doctor' to verify."
