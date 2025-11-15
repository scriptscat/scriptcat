import type { SystemConfig } from "@App/pkg/config/config";
import type { Callback } from "i18next";
import i18n, { t } from "i18next";
import { initReactI18next } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { SCMetadata } from "@App/app/repo/scripts";
import enUS from "./en-US/translation.json";
import viVN from "./vi-VN/translation.json";
import zhCN from "./zh-CN/translation.json";
import zhTW from "./zh-TW/translation.json";
import achUG from "./ach-UG/translation.json";
import jaJP from "./ja-JP/translation.json";
import deDE from "./de-DE/translation.json";
import ruRU from "./ru-RU/translation.json";
import "dayjs/locale/en";
import "dayjs/locale/vi";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";
import "dayjs/locale/ja";
import "dayjs/locale/de";
import "dayjs/locale/ru";

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
      "zh-CN": { title: "简体中文", translation: zhCN },
      "zh-TW": { title: "繁体中文", translation: zhTW },
      "ja-JP": { title: "日本語", translation: jaJP },
      "de-DE": { title: "Deutsch", translation: deDE },
      "vi-VN": { title: "Tiếng Việt", translation: viVN },
      "ru-RU": { title: "Русский", translation: ruRU },
      "ach-UG": { title: "伪语言", translation: achUG },
    },
  });

  systemConfig.getLanguage().then((lng) => {
    changeLanguage(lng);
    if (!lng.startsWith("zh-")) {
      localePath = "/en";
    }
  });
}

export function i18nName(script: { name: string; metadata: SCMetadata }) {
  const m = script.metadata[`name:${i18n?.language?.toLowerCase()}`];
  return m ? m[0] : script.name;
}

export function i18nDescription(script: { metadata: SCMetadata }) {
  const m = script.metadata[`description:${i18n?.language?.toLowerCase()}`];
  return m ? m[0] : script.metadata.description;
}

// 判断是否是中文用户
export function isChineseUser() {
  const language = i18n?.language?.toLowerCase();
  return language.startsWith("zh-");
}

// 匹配语言
export function matchLanguage(): Promise<string> {
  return chrome.i18n.getAcceptLanguages().then((acceptLanguages) => {
    // 遍历数组寻找匹配语言
    for (let i = 0; i < acceptLanguages.length; i += 1) {
      const lng = acceptLanguages[i];
      if (i18n.hasResourceBundle(lng, "translation")) {
        return lng;
      }
    }
    // 根据前缀去匹配
    const prefixMap = {} as Partial<Record<string, string[]>>;
    for (const lng of i18n.languages) {
      const prefix = lng.split("-")[0];
      if (!prefixMap[prefix]) {
        prefixMap[prefix] = [];
      }
      prefixMap[prefix].push(lng);
    }
    for (let i = 0; i < acceptLanguages.length; i += 1) {
      const lng = acceptLanguages[i];
      const prefix = lng.split("-")[0];
      if (prefixMap[prefix] && prefixMap[prefix].length > 0) {
        return prefixMap[prefix][0]; // 返回第一个匹配的语言
      }
    }
    return "";
  });
}

export { t };

export default i18n;
