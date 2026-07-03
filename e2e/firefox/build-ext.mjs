/* global process */
// Produce a Firefox-loadable unpacked extension at dist/firefox/ from the Chrome build at
// dist/ext/, applying the same manifest transform as scripts/pack.js: Firefox uses the
// event-page background (scripts), has no offscreen/sandbox pages, and needs
// browser_specific_settings.gecko.id for the temporary add-on install.
//
// Run standalone (`node e2e/firefox/build-ext.mjs`) or import buildFirefoxExt().
import { promises as fs } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "dist/ext");
const OUT = path.join(ROOT, "dist/firefox");

// Beta build (version 1.5.0-beta) → beta gecko id, per scripts/pack.js.
export const GECKO_ID = "{44ab8538-2642-46b0-8a57-3942dbc1a33b}";
// Pinned moz-extension UUID so options/install URLs are known up front. Firefox reads this
// from the extensions.webextensions.uuids pref set in firefoxUserPrefs at launch.
export const EXT_UUID = "44ab8538-2642-46b0-8a57-3942dbc1a33b";

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

function toFirefoxManifest(manifest) {
  const m = { ...manifest, background: { ...manifest.background } };
  // Firefox MV3 uses the event-page background; drop the Chrome service worker.
  delete m.background.service_worker;
  // Firefox has no chrome.sandbox page mechanism.
  delete m.sandbox;
  // "background" optional permission is unsupported on Firefox MV3.
  m.optional_permissions = (m.optional_permissions || []).filter((p) => p !== "background");
  m.permissions = (m.permissions || []).filter((p) => p !== "background");
  m.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: "136.0",
      data_collection_permissions: {
        required: ["none"],
        optional: ["authenticationInfo", "personallyIdentifyingInfo"],
      },
    },
  };
  m.commands = { _execute_action: {} };
  return m;
}

export async function buildFirefoxExt() {
  try {
    await fs.access(path.join(SRC, "manifest.json"));
  } catch {
    throw new Error(`dist/ext not found — run \`pnpm run build\` (or \`pnpm run dev\`) first, then re-run.`);
  }
  await fs.rm(OUT, { recursive: true, force: true });
  await copyDir(SRC, OUT);
  const manifest = JSON.parse(await fs.readFile(path.join(SRC, "manifest.json"), "utf8"));
  await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(toFirefoxManifest(manifest), null, 2));
  return OUT;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildFirefoxExt().then(
    (out) => console.log("[build-ext] wrote", out, "gecko id", GECKO_ID),
    (err) => {
      console.error(err.message);
      process.exit(1);
    }
  );
}
