import "reflect-metadata";
import Vue from "vue";
import VueRouter, { RouteConfig } from "vue-router";
import { languages } from "monaco-editor";

import "vuetify/dist/vuetify.min.css";

// @ts-ignore
import dts from "@App/types/tampermonkey.d.ts";
import { migrate } from "./model/migrate";
import { i18n, vuetify } from "../i18n/i18n";
import Component from "vue-class-component";

//@ts-ignore
import VuetifyDialogPromise from "vuetify-dialog-promise";

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

new Vue({
    router,
    i18n,
    vuetify: vuetify,
    render: (h) => h(WithRouter),
}).$mount("#app");

if (process.env.NODE_ENV === "development") {
    import("@vue/devtools").then((devtools) => devtools.connect(/* host, port */));
}
