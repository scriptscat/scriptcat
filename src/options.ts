import "reflect-metadata";
import Vue from "vue";
import { languages } from "monaco-editor";

import "vuetify/dist/vuetify.min.css";

import App from "@App/views/pages/Option";
// @ts-ignore
import dts from "@App/types/tampermonkey.d.ts";
import { migrate } from "./model/migrate";
import { i18n, vuetify } from "../i18n/i18n";

migrate();

// @ts-ignore
self.MonacoEnvironment = {
    getWorkerUrl: function(moduleId: any, label: any) {
        if (label === "typescript" || label === "javascript") {
            return "./src/ts.worker.js";
        }
        return "./src/editor.worker.js";
    },
};

languages.typescript.javascriptDefaults.addExtraLib(dts, "tampermonkey.d.ts");

new Vue({
    i18n,
    vuetify: vuetify,
    render: (h) => h(App),
}).$mount("#app");

if (process.env.NODE_ENV === "development") {
    import("@vue/devtools").then((devtools) => devtools.connect(/* host, port */));
}
