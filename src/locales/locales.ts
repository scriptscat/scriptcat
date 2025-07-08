import { SystemConfig } from "@App/pkg/config/config";
import i18n, { Callback, t } from "i18next";
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

// 为了发挥 ESM 的 Tree-Shaking 等功能，日后应转用 data-fns 之类的 ESM 库

dayjs.extend(relativeTime);

export let localePath = "";

export function changeLanguage(lng: string, callback?: Callback): void {
  i18n.changeLanguage(lng, callback);
  dayjs.locale(lng.toLocaleLowerCase());
}

// let cachedSystemConfig: SystemConfig;

export function initLocales(systemConfig: SystemConfig) {
  // cachedSystemConfig = systemConfig;
  const uiLanguage = chrome.i18n.getUILanguage();
  const defaultLanguage = globalThis.localStorage ? localStorage["language"] || uiLanguage : uiLanguage;
  i18n.use(initReactI18next).init({
    fallbackLng: "en-US",
    lng: defaultLanguage, // 优先使用localStorage中的语言设置
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

  systemConfig.getLanguage().then(lng => {
    changeLanguage(lng);
    if (lng !== "zh-CN") {
      localePath = "en";
    }
  });
}

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
  // 根据前缀去匹配
  const prefixMap = i18n.languages.reduce(
    (acc, lng) => {
      const prefix = lng.split("-")[0];
      if (!acc[prefix]) {
        acc[prefix] = [];
      }
      acc[prefix].push(lng);
      return acc;
    },
    {} as Record<string, string[]>
  );
  for (let i = 0; i < acceptLanguages.length; i += 1) {
    const lng = acceptLanguages[i];
    const prefix = lng.split("-")[0];
    if (prefixMap[prefix] && prefixMap[prefix].length > 0) {
      return prefixMap[prefix][0]; // 返回第一个匹配的语言
    }
  }
  return "";
}

export { t };

export default i18n;
