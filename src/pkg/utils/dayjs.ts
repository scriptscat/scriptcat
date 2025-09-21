import { formatDistanceStrict } from "date-fns";
import { ja, enUS, vi, zhCN, zhTW, de, ru, type Locale } from "date-fns/locale";
import { type Dayjs } from "dayjs";

const dateSettings = {
  locale: null,
} as { locale: Locale | null };

export function setDateLocale(lng: string) {
  switch (lng) {
    case "de-DE":
    case "de":
      dateSettings.locale = de;
      break;

    case "en-US":
    case "en":
      dateSettings.locale = enUS;
      break;

    case "ja-JP":
    case "ja":
      dateSettings.locale = ja;
      break;

    case "ru-RU":
    case "ru":
      dateSettings.locale = ru;
      break;

    case "vi-VN":
    case "vi":
      dateSettings.locale = vi;
      break;

    case "zh-CN":
    case "zhCN":
      dateSettings.locale = zhCN;
      break;

    case "zh-TW":
    case "zhTW":
      dateSettings.locale = zhTW;
      break;
  }
}

export function semTime(time: Date, locale?: Locale | null) {
  // return dayjs().to(dayjs(time));
  const now = new Date();
  //@ts-ignore
  const dist = now - time;
  locale = locale || dateSettings.locale || enUS;
  if (dist < 1000) {
    return formatDistanceStrict(time, now, {
      addSuffix: true,
      locale,
      roundingMethod: "ceil",
      unit: "second",
    });
  } else if (dist <= 55 * 1000) {
    return formatDistanceStrict(time, now, {
      addSuffix: true,
      locale,
      roundingMethod: "round",
      unit: "second",
    });
  } else if (dist <= 55 * 60 * 1000) {
    return formatDistanceStrict(time, now, {
      addSuffix: true,
      locale,
      roundingMethod: "round",
      unit: "minute",
    });
  } else if (dist <= 22 * 60 * 60 * 1000) {
    return formatDistanceStrict(time, now, {
      addSuffix: true,
      locale,
      roundingMethod: "round",
      unit: "hour",
    });
  } else if (dist <= 25 * 24 * 60 * 60 * 1000) {
    return formatDistanceStrict(time, now, {
      addSuffix: true,
      locale,
      roundingMethod: "round",
      unit: "day",
    });
  } else if (dist <= 335 * 24 * 60 * 60 * 1000) {
    return formatDistanceStrict(time, now, {
      addSuffix: true,
      locale,
      roundingMethod: "round",
      unit: "month",
    });
  } else {
    return formatDistanceStrict(time, now, {
      addSuffix: true,
      locale,
      roundingMethod: "round",
      unit: "year",
    });
  }
}

// 针对某些参数，Acro Design 不能直接传Date。
// 需要使用 plainDayjs 来转换成类似 Dayjs 的简化结构
export const plainDayjs = (value: Date | Date[]) => {
  const conv = (date: Date) => {
    // return dayjs(date);
    const x = {
      $D: date.getDate(),
      $H: date.getHours(),
      // $L: "en",
      $M: date.getMonth(),
      $W: date.getDay(),
      $d: date,
      $m: date.getMinutes(),
      $ms: date.getMilliseconds(),
      $s: date.getSeconds(),
      $y: date.getFullYear(),
      valueOf() {
        return this.$d.getTime();
      },
      toString() {
        return this.$d.toString();
      },
    };
    //@ts-ignore
    return x as Dayjs;
  };
  if (value instanceof Date) return conv(value);
  return value.map(conv);
};
