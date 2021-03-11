import Vue from 'vue'
import Confirm from '@App/views/confirm.vue'
import { SystemCache } from './pkg/cache';
import { App } from './apps/app';
App.Cache = new SystemCache(false);

new Vue({
    render: h => h(Confirm),
}).$mount('#app');