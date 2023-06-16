import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enUS from "./en-US/translation.yaml";
import zhCN from "./zh-CN/translation.yaml";

i18n.use(initReactI18next).init({
  fallbackLng: "zh-CN",
  lng: localStorage.language || chrome.i18n.getUILanguage(),
  interpolation: {
    escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
  },
  resources: {
    "en-US": { title: "English", translation: enUS },
    "zh-CN": { title: "简体中文", translation: zhCN },
  },
});

export default i18n;
