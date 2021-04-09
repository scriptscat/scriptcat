import "reflect-metadata";
import Vue from "vue";
import { languages } from "monaco-editor";
import Vuetify from "vuetify";

import "vuetify/dist/vuetify.min.css";

import App from "@App/views/pages/Install/index.vue";
// @ts-ignore
import dts from "@App/types/tampermonkey.d.ts";
import { migrate } from "./model/migrate";
import { InitApp } from "./apps/app";
import { DBLogger } from "./apps/logger/logger";
import { SystemCache } from "./pkg/storage/cache/system-cache";

import { InitApp } from "./apps/app";
import { DBLogger } from "./apps/logger/logger";
import { SystemCache } from "./pkg/storage/cache/system-cache";

migrate();

InitApp({
    Log: new DBLogger(),
    Cache: new SystemCache(),
});

Vue.use(Vuetify);

const opts = {};
const vuetifyInstance = new Vuetify(opts);

InitApp({
    Log: new DBLogger(),
    Cache: new SystemCache(),
});

// @ts-ignore
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId: any, label: any) {
        if (label === "typescript" || label === "javascript") {
            return "./src/ts.worker.js";
        }
        return "./src/editor.worker.js";
    },
};

languages.typescript.javascriptDefaults.addExtraLib(dts, "tampermonkey.d.ts");

new Vue({
    vuetify: vuetifyInstance,
    render: (h) => h(App),
}).$mount("#app");
