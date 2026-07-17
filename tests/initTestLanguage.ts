import i18n from "@App/locales/locales";
import { changeLanguage, initLanguage } from "@App/locales/locales";

const initializedLanguages = new Set<string>();

export function initTestLanguage(lng: string = "en-US"): void {
  if (!i18n.isInitialized || !initializedLanguages.has(lng)) {
    initLanguage(lng);
    initializedLanguages.add(lng);
    return;
  }

  changeLanguage(lng);
}
