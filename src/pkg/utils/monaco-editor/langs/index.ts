import zhCN from "./zh-CN";
import enUS from "./en-US";
import zhTW from "./zh-TW";
import jaJP from "./ja-JP";
import deDE from "./de-DE";
import viVN from "./vi-VN";
import ruRU from "./ru-RU";
import trTR from "./tr-TR";
import ptBR from "./pt-BR";
import koKR from "./ko-KR";

export const editorLangs = {
  "zh-CN": zhCN,
  "en-US": enUS,
  "zh-TW": zhTW,
  "ja-JP": jaJP,
  "de-DE": deDE,
  "vi-VN": viVN,
  "ru-RU": ruRU,
  "tr-TR": trTR,
  "pt-BR": ptBR,
  "ko-KR": koKR,
} as const;

export type EditorLangCode = keyof typeof editorLangs;
export type EditorLangEntry = (typeof editorLangs)["zh-CN"];

export function asEditorLangEntry<T extends keyof typeof editorLangs>(key: T) {
  return editorLangs[key] as EditorLangEntry;
}
