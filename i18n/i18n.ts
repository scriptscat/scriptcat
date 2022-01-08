import { zh_CN } from './cn';
import { en } from './en';
import VueI18n from 'vue-i18n';
import Vuetify from 'vuetify';
import Vue from 'vue';
// import '@mdi/font/css/materialdesignicons.css' 

Vue.use(VueI18n);
Vue.use(Vuetify);

export const messages: { [key: string]: any } = {
    'zh_CN': zh_CN,
    'en': en,
};

let defaultLocale = chrome.i18n.getUILanguage().replace(/-/g, '_');

if (!messages[defaultLocale]) {
    defaultLocale = 'en';
}

export const i18n = new VueI18n({
    locale: defaultLocale,
    messages: messages,
});

export const vuetify = new Vuetify({
    icons: {
        iconfont: 'mdiSvg',
    }
});
