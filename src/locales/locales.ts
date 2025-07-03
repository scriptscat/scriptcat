import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Metadata } from "@App/app/repo/scripts";
import enUS from "./en/translation.json";
import viVN from "./vi/translation.json";
import zhCN from "./zh-CN/translation.json";
import zhTW from "./zh-TW/translation.json";
import achUG from "./ach-UG/translation.json";
import jaJP from "./ja/translation.json";
import deDE from "./de/translation.json";
import "dayjs/locale/en";
import "dayjs/locale/vi";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";
import "dayjs/locale/ja";
import "dayjs/locale/de";
import { systemConfig } from "@App/pages/store/global";

const uiLanguage = chrome.i18n.getUILanguage();

i18n.use(initReactI18next).init({
  fallbackLng: "en-US",
  lng: globalThis.localStorage ? localStorage["language"] || uiLanguage : uiLanguage, // 优先使用localStorage中的语言设置
  interpolation: {
    escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
  },
  resources: {
    "en-US": { title: "English", translation: enUS },
    "vi-VN": { title: "Tiếng Việt", translation: viVN },
    "zh-CN": { title: "简体中文", translation: zhCN },
    "zh-TW": { title: "繁体中文", translation: zhTW },
    "ach-UG": { title: "伪语言", translation: achUG },
    "ja-JP": { title: "日本語", translation: jaJP },
    "de-DE": { title: "Deutsch", translation: deDE },
  },
});

export let localePath = "";

async function initLanguage() {
  const lng = await systemConfig.getLanguage();
  i18n.changeLanguage(lng);
  dayjs.locale(lng.toLocaleLowerCase());
  if (lng !== "zh-CN") {
    localePath = "en";
  }
}

setTimeout(() => {
  initLanguage();
}, 0);

dayjs.extend(relativeTime);

export function i18nName(script: { name: string; metadata: Metadata }) {
  return script.metadata[`name:${i18n.language.toLowerCase()}`]
    ? script.metadata[`name:${i18n.language.toLowerCase()}`]![0]
    : script.name;
}

export function i18nDescription(script: { metadata: Metadata }) {
  return script.metadata[`description:${i18n.language.toLowerCase()}`]
    ? script.metadata[`description:${i18n.language.toLowerCase()}`]![0]
    : script.metadata.description;
}

// 匹配语言
export async function matchLanguage() {
  const acceptLanguages = await chrome.i18n.getAcceptLanguages();
  // 遍历数组寻找匹配语言
  for (let i = 0; i < acceptLanguages.length; i += 1) {
    const lng = acceptLanguages[i];
    if (i18n.hasResourceBundle(lng, "translation")) {
      return lng;
    }
  }
  return "";
}

export default i18n;
