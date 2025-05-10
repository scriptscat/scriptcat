const compat_grant = require("eslint-plugin-userscripts/dist/data/compat-grant.js");
const compatMap = {
  CAT_userConfig: [{ type: "scriptcat", versionConstraint: ">=0.11.0-beta" }],
  CAT_fileStorage: [{ type: "scriptcat", versionConstraint: ">=0.11.0" }],
  ...compat_grant.compatMap,
};

const gmPolyfillOverride = {
  ...compat_grant.gmPolyfillOverride,
};

module.exports = { compatMap, gmPolyfillOverride };
