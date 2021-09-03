import "reflect-metadata";
import "vuetify/dist/vuetify.min.css";

// @ts-ignore
import dts from "@App/types/tampermonkey.d.ts";
import { languages } from "monaco-editor";
import Vue from "vue";
import Component from "vue-class-component";
import VueRouter, { RouteConfig } from "vue-router";
//@ts-ignore
import VuetifyDialogPromise from "vuetify-dialog-promise";

import { i18n, vuetify } from "../i18n/i18n";
import { migrate } from "./model/migrate";
import store from "@Option/store";
import { DBLogger } from "./apps/logger/logger";
import { MapCache } from "./pkg/storage/cache/cache";
import { InitApp } from "./apps/app";

migrate();

InitApp({
    Log: new DBLogger(),
    Cache: new MapCache(),
});

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

Vue.use(VuetifyDialogPromise);
Vue.use(VueRouter);

const routes: Array<RouteConfig> = [
    {
        path: "*",
        name: "Home",
        component: () => import("@App/views/pages/Option"),
    },
];

const router = new VueRouter({
    mode: "hash",
    base: "options.html",
    routes,
});

@Component({})
class WithRouter extends Vue {
    render() {
        return <router-view></router-view>;
    }
}

// if (process.env.NODE_ENV === "development") {
//     Vue.config.devtools = true;
//     import("@vue/devtools").then((devtools) => devtools.connect(/* host, port */));
// }

new Vue({
    router,
    store,
    i18n,
    vuetify: vuetify,
    render: (h) => h(WithRouter),
}).$mount("#app");
