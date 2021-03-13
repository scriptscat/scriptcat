import Vue from 'vue'
import Confirm from '@App/views/confirm.vue'
import { SystemCache } from './pkg/cache';
import { App } from './apps/app';
import Vuetify from "vuetify";
import "vuetify/dist/vuetify.min.css";

Vue.use(Vuetify);

const opts = {};
const vuetifyInstance = new Vuetify(opts);


App.Cache = new SystemCache(false);

new Vue({
    vuetify: vuetifyInstance,
    render: h => h(Confirm),
}).$mount('#app');
