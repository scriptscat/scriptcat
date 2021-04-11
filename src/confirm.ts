import "reflect-metadata";
import Vue from "vue";
import Vuetify from "vuetify";

import "vuetify/dist/vuetify.min.css";

import Confirm from "@App/views/pages/Confirm/index.vue";
import { App, InitApp } from "./apps/app";
import { SystemCache } from "./pkg/cache/system-cache";
import { DBLogger } from "./apps/logger/logger";
import { migrate } from "./model/migrate";

migrate();

Vue.use(Vuetify);

const opts = {};
const vuetifyInstance = new Vuetify(opts);

InitApp({
    Log: new DBLogger(),
    Cache: new SystemCache(false),
});

new Vue({
    vuetify: vuetifyInstance,
    render: (h) => h(Confirm),
}).$mount("#app");
