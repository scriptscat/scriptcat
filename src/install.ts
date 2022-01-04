import 'reflect-metadata';
import 'vuetify/dist/vuetify.min.css';
import Vue from 'vue';
import Vuetify from 'vuetify';

import App from '@App/views/pages/Install/index.vue';
import { migrate } from './model/migrate';

import { ENV_FRONTEND, InitApp } from './apps/app';
import { DBLogger } from './apps/logger/logger';
import { SystemCache } from './pkg/storage/cache/system-cache';
import { registerEditorPrompt } from './pkg/utils/editor';

migrate();

InitApp({
    Log: new DBLogger(),
    Cache: new SystemCache(),
    Environment: ENV_FRONTEND,
});

Vue.use(Vuetify);

const opts = {};
const vuetifyInstance = new Vuetify(opts);

registerEditorPrompt();

new Vue({
    vuetify: vuetifyInstance,
    render: (h) => h(App),
}).$mount('#app');
