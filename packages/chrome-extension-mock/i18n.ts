export default class I18n {
  getUILanguage() {
    return "zh-CN";
  }

  getAcceptLanguages(callback?: (lngs: string[]) => void) {
    const languages = ["zh-CN", "en"];
    if (callback) {
      callback(languages);
    }
    return Promise.resolve(languages);
  }

  getMessage(key: string, _substitutions?: string | string[]) {
    // 简单返回key作为测试值
    return key;
  }
}
