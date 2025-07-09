import enUS from "@arco-design/web-react/es/locale/en-US";
import zhCN from "@arco-design/web-react/es/locale/zh-CN";
import zhTW from "@arco-design/web-react/es/locale/zh-TW";
import jaJP from "@arco-design/web-react/es/locale/ja-JP";
import deDE from "@arco-design/web-react/es/locale/de-DE";
import viVN from "@arco-design/web-react/es/locale/vi-VN";
import type { Locale } from "@arco-design/web-react/es/locale/interface";

export function arcoLocale(lang: string): Locale {
  switch (lang) {
    case "en-US":
      return enUS;
    case "zh-CN":
      return zhCN;
    case "zh-TW":
      return zhTW;
    case "ja-JP":
      return jaJP;
    case "de-DE":
      // @ts-ignore
      return deDE;
    case "vi-VN":
      // @ts-ignore
      return viVN;
    default:
      return enUS;
  }
}
