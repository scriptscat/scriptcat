import "reflect-metadata";
import Vue from "vue";

import "vuetify/dist/vuetify.min.css";
import App from "@App/views/pages/Popup/index.vue";
import { migrate } from "./model/migrate";
import { i18n, vuetify } from "../i18n/i18n";

migrate();

new Vue({
    i18n,
    vuetify: vuetify,
    render: (h) => h(App),
}).$mount("#app");
