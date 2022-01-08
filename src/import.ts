import 'reflect-metadata';
import 'vuetify/dist/vuetify.min.css';
import Vue from 'vue';
import { i18n, vuetify } from '../i18n/i18n';
import App from '@App/views/pages/Import/index.vue';
import { migrate } from './model/migrate';

import { ENV_FRONTEND, InitApp } from './apps/app';
import { DBLogger } from './apps/logger/logger';
import { SystemCache } from './pkg/storage/cache/system-cache';

migrate();

InitApp({
    Log: new DBLogger(),
    Cache: new SystemCache(),
    Environment: ENV_FRONTEND,
});

new Vue({
    i18n,
    vuetify: vuetify,
    render: (h) => h(App),
}).$mount('#app');
