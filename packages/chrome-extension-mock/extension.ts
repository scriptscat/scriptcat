export default class Extension {
  inIncognitoContext = false;

  // 默认已授权访问 file://；需要未授权场景的测试自行 spyOn 覆写。
  isAllowedFileSchemeAccess(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
