import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { SCMetadata } from "@App/app/repo/scripts";
import enUS from "./en-US/translation.json";
import viVN from "./vi-VN/translation.json";
import zhCN from "./zh-CN/translation.json";
import zhTW from "./zh-TW/translation.json";
import deDE from "./de-DE/translation.json";
import jaJP from "./ja-JP/translation.json";
import achUG from "./ach-UG/translation.json";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";
import "dayjs/locale/vi";
import "dayjs/locale/en";
import "dayjs/locale/de";

i18n.use(initReactI18next).init({
  fallbackLng: "en-US",
  lng: localStorage.language || chrome.i18n.getUILanguage(),
  interpolation: {
    escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
  },
  resources: {
    "en-US": { title: "English", translation: enUS },
    "vi-VN": { title: "Tiếng Việt", translation: viVN },
    "zh-CN": { title: "简体中文", translation: zhCN },
    "zh-TW": { title: "繁体中文", translation: zhTW },
    "de-DE": { title: "Deutsch", translation: deDE },
    "ja-JP": { title: "日本語", translation: jaJP },
    "ach-UG": { title: "伪语言", translation: achUG },
  },
});

if (!localStorage.language) {
  chrome.i18n.getAcceptLanguages((lngs) => {
    // 遍历数组寻找匹配语言
    for (let i = 0; i < lngs.length; i += 1) {
      const lng = lngs[i];
      if (i18n.hasResourceBundle(lng, "translation")) {
        localStorage.language = lng;
        i18n.changeLanguage(lng);
        dayjs.locale(lng.toLocaleLowerCase());
        break;
      }
    }
  });
} else {
  dayjs.locale((localStorage.language as string).toLocaleLowerCase());
}
dayjs.extend(relativeTime);

export function i18nName(script: { name: string; metadata: SCMetadata }) {
  return script.metadata[`name:${i18n.language.toLowerCase()}`]
    ? script.metadata[`name:${i18n.language.toLowerCase()}`][0]
    : script.name;
}

export function i18nDescription(script: { metadata: SCMetadata }) {
  return script.metadata[`description:${i18n.language.toLowerCase()}`]
    ? script.metadata[`description:${i18n.language.toLowerCase()}`][0]
    : script.metadata.description;
}

export default i18n;
