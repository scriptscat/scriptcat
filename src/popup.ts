/*
 * @Author: ScriptCat
 * @Date: 2021-09-02 18:15:33
 * @LastEditTime: 2021-09-04 15:18:15
 * @LastEditors: Przeblysk
 * @Description: 
 * @FilePath: /scriptcat/src/popup.ts
 * 
 */
import "reflect-metadata";
import Vue from "vue";

import "vuetify/dist/vuetify.min.css";

import App from "@App/views/pages/Popup/index.vue";
import { migrate } from "./model/migrate";
import { i18n } from "../i18n/i18n";
// import Qui from '@qvant/qui';
import '@qvant/qui/dist/qui.css';
import Qui from '@qvant/qui/src/onDemand';
import QButton from '@qvant/qui/src/qComponents/QButton';
import QCheckbox from '@qvant/qui/src/qComponents/QCheckbox';
import QPopover from '@qvant/qui/src/qComponents/QPopover';
import QScrollbar from '@qvant/qui/src/qComponents/QScrollbar';
Vue.use(Qui);
Vue.use(QButton);
Vue.use(QCheckbox);
Vue.use(QPopover);
Vue.use(QScrollbar);

migrate();

new Vue({
    i18n,
    render: (h) => h(App),
}).$mount("#app");
