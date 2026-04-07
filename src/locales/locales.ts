import type { SystemConfig } from "@App/pkg/config/config";
import type { Callback } from "i18next";
import i18n, { t } from "i18next";
import { initReactI18next } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { SCMetadata } from "@App/app/repo/scripts";
import * as enUS from "./en-US";
import * as zhCN from "./zh-CN";
import * as zhTW from "./zh-TW";
import * as jaJP from "./ja-JP";
import * as deDE from "./de-DE";
import * as viVN from "./vi-VN";
import * as ruRU from "./ru-RU";
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

let initLocalesResolve: (value: string) => void;
export const initLocalesPromise = new Promise<string>((resolve) => {
  initLocalesResolve = resolve;
});

const NS = [
  "common",
  "popup",
  "script",
  "editor",
  "settings",
  "install",
  "agent",
  "logs",
  "guide",
  "tools",
  "permission",
] as const;

export function initLanguage(lng: string = "en-US"): void {
  i18n.use(initReactI18next).init({
    fallbackLng: "en-US",
    lng: lng,
    ns: [...NS],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    resources: {
      "en-US": { title: "English", ...enUS },
      "zh-CN": { title: "简体中文", ...zhCN },
      "zh-TW": { title: "繁体中文", ...zhTW },
      "ja-JP": { title: "日本語", ...jaJP },
      "de-DE": { title: "Deutsch", ...deDE },
      "vi-VN": { title: "Tiếng Việt", ...viVN },
      "ru-RU": { title: "Русский", ...ruRU },
    },
  });

  // 先根据默认语言设置路径
  if (!lng.startsWith("zh-")) {
    localePath = "/en";
  }
}

export function initLocales(systemConfig: SystemConfig) {
  const uiLanguage = chrome.i18n.getUILanguage();
  const defaultLanguage = globalThis.localStorage ? localStorage["language"] || uiLanguage : uiLanguage;

  initLanguage(defaultLanguage);

  const changeLanguageCallback = (lng: string) => {
    if (!lng.startsWith("zh-")) {
      localePath = "/en";
    } else {
      localePath = "";
    }
    changeLanguage(lng);
  };

  systemConfig.getLanguage().then((lng) => {
    initLocalesResolve(lng);
    changeLanguageCallback(lng);
  });

  systemConfig.addListener("language", changeLanguageCallback);
}

export function watchLanguageChange(callback: (lng: string) => void) {
  // 马上执行一次
  let registered = false;
  initLocalesPromise.then(() => {
    callback(i18n.language);

    // 监听变化
    i18n.on("languageChanged", callback);
    registered = true;
  });

  return () => {
    if (registered) {
      i18n.off("languageChanged", callback);
    }
  };
}

export const i18nLang = (): string => `${i18n?.language?.toLowerCase()}`;

export function i18nName(script: { name: string; metadata: SCMetadata }) {
  const lang = i18nLang();
  let m = script.metadata[`name:${lang}`];
  if (!m) {
    // 尝试只用前缀匹配
    const langPrefix = lang.split("-")[0];
    m = script.metadata[`name:${langPrefix}`];
  }
  return m ? m[0] : script.name;
}

export function i18nDescription(script: { metadata: SCMetadata }): string {
  const metadata = script.metadata;
  const lang = i18nLang();
  let m = metadata[`description:${lang}`];
  if (!m) {
    // 尝试只用前缀匹配
    const langPrefix = lang.split("-")[0];
    m = metadata[`description:${langPrefix}`];
  }
  return m ? m[0] : metadata.description?.[0] || "";
}

// 判断是否是中文用户
export function isChineseUser() {
  const language = i18nLang();
  return language.startsWith("zh-");
}

// 匹配语言
export function matchLanguage(): Promise<string> {
  return chrome.i18n.getAcceptLanguages().then((acceptLanguages) => {
    // 遍历数组寻找匹配语言
    for (let i = 0; i < acceptLanguages.length; i += 1) {
      const lng = acceptLanguages[i];
      if (i18n.hasResourceBundle(lng, "common")) {
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
