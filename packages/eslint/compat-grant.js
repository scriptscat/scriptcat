/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const compat_grant = require("eslint-plugin-userscripts/dist/data/compat-grant.js");
const compatMap = {
  CAT_userConfig: [{ type: "scriptcat", versionConstraint: ">=0.11.0-beta" }],
  CAT_fileStorage: [{ type: "scriptcat", versionConstraint: ">=0.11.0" }],
  CAT_registerMenuInput: [{ type: "scriptcat", versionConstraint: ">=0.17.0-beta.2" }],
  CAT_unregisterMenuInput: [{ type: "scriptcat", versionConstraint: ">=0.17.0-beta.2" }],
  ...compat_grant.compatMap,
};

const gmPolyfillOverride = {
  ...compat_grant.gmPolyfillOverride,
};

module.exports = { compatMap, gmPolyfillOverride };
