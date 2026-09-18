export default class WebNavigation {
  // 默认无框架资料；需要框架的测试自行 spyOn 覆写返回值。
  getAllFrames(
    _details: chrome.webNavigation.GetAllFrameDetails
  ): Promise<chrome.webNavigation.GetAllFrameResultDetails[] | null> {
    return Promise.resolve([]);
  }
}
