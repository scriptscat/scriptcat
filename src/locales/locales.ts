import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Metadata } from "@App/app/repo/scripts";
import enUS from "./en-US/translation.yaml";
import zhCN from "./zh-CN/translation.yaml";
import "dayjs/locale/zh-cn";

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

dayjs.locale(
  (
    (localStorage.language || chrome.i18n.getUILanguage()) as string
  ).toLocaleLowerCase()
);
dayjs.extend(relativeTime);

export function i18nName(script: { name: string; metadata: Metadata }) {
  return script.metadata[`name:${i18n.language.toLowerCase()}`]
    ? script.metadata[`name:${i18n.language.toLowerCase()}`][0]
    : script.name;
}

export function i18nDescription(script: { metadata: Metadata }) {
  return script.metadata[`description:${i18n.language.toLowerCase()}`]
    ? script.metadata[`description:${i18n.language.toLowerCase()}`][0]
    : script.metadata.description;
}

export default i18n;
