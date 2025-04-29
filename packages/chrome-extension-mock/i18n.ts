export default class I18n {
  getUILanguage() {
    return "zh-CN";
  }

  getAcceptLanguages(callback: (lngs: string[]) => void) {
    callback(["zh-CN"]);
  }
}
