type Callback = () => void;

const DEFAULT_LOCALE = "en";

const localeMap: Record<string, string> = {
  en: "en",
  vi: "vi",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-tw": "zh-TW",
  "zh-hant": "zh-TW",
  ja: "ja",
  de: "de",
  ru: "ru",
};

let currentLocale = DEFAULT_LOCALE;

function normalizeLocale(lng: string): string {
  const key = lng.trim().toLowerCase();
  const mapped = localeMap[key] ?? lng;

  try {
    return Intl.getCanonicalLocales(mapped)[0] ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * = dayjs.locale
 */
export function changeRelativeTimeLanguage(lng: string, callback?: Callback): void {
  currentLocale = normalizeLocale(lng);
  callback?.();
}

type RelativeUnit = "second" | "minute" | "hour" | "day" | "month" | "year";

/**
 * = dayjs().to(dayjs(time));
 */
export function semTime(time: Date): string {
  const diffMs = time.getTime() - Date.now();
  const absSeconds = Math.abs(diffMs) / 1000;

  let value: number;
  let unit: RelativeUnit;

  // Day.js-like thresholds. Output wording comes from Intl, not Day.js locale packs.
  if (absSeconds < 45) {
    value = Math.round(diffMs / 1000);
    unit = "second";
  } else if (absSeconds < 45 * 60) {
    value = Math.round(diffMs / (60 * 1000));
    unit = "minute";
  } else if (absSeconds < 22 * 60 * 60) {
    value = Math.round(diffMs / (60 * 60 * 1000));
    unit = "hour";
  } else if (absSeconds < 26 * 24 * 60 * 60) {
    value = Math.round(diffMs / (24 * 60 * 60 * 1000));
    unit = "day";
  } else if (absSeconds < 320 * 24 * 60 * 60) {
    value = Math.round(diffMs / (30 * 24 * 60 * 60 * 1000));
    unit = "month";
  } else {
    value = Math.round(diffMs / (365 * 24 * 60 * 60 * 1000));
    unit = "year";
  }

  return new Intl.RelativeTimeFormat(currentLocale, {
    numeric: "auto",
    style: "long",
  }).format(value, unit);
}
