import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enUS from "./en-US/translation.json";
import zhCN from "./zh-CN/translation.json";

i18n.use(initReactI18next).init({
  fallbackLng: chrome.i18n.getUILanguage(),
  lng: localStorage.i18n || chrome.i18n.getUILanguage(),
  interpolation: {
    escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
  },
  resources: {
    "en-US": { translation: enUS },
    "zh-CN": { translation: zhCN },
  },
});

export default i18n;
