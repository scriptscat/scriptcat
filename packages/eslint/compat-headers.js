/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const compat_headers = require("eslint-plugin-userscripts/dist/data/compat-headers.js");

const compatMap = {
  ...compat_headers.compatMap,
  nonFunctional: {
    ...compat_headers.compatMap.nonFunctional,
    // 覆盖或新增新的属性
    background: [],
    crontab: [],
    cloudCat: [],
    cloudServer: [],
    exportValue: [],
    exportCookie: [],
    scriptUrl: [],
    storageName: [],
  },
};

module.exports = { compatMap };
