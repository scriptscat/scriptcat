export default class I18n {
  getUILanguage() {
    return "zh-CN";
  }

  getAcceptLanguages(callback: (lngs: string[]) => void) {
    callback && callback(["zh-CN"]);
    return Promise.resolve(["zh-CN"]);
  }
}
