import { zh_cn } from './cn';
import { en } from './en';
import VueI18n from 'vue-i18n';
import Vuetify from "vuetify";
import Vue from "vue";

Vue.use(VueI18n);
Vue.use(Vuetify);

export const messages = {
    "zh-CN": zh_cn,
    "en": en,
};

export const i18n = new VueI18n({
    locale: 'zh-CN',
    messages: messages,
});

export const vuetify = new Vuetify({
    // lang: {
    //     t: (key, ...params) => <string>i18n.t(key, params),
    // }
});
