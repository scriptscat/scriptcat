// ==CATTool==
// @name         screenshot
// @description  Capture a screenshot of the target tab. Returns an image attachment that vision models can view directly.
// @param        tabId number Target tab ID (defaults to the active tab)
// @param        quality number Image quality 1-100 (default: 80)
// @grant        CAT.agent.dom
// ==/CATTool==

try {
  const options = {};
  if (args.tabId != null) options.tabId = args.tabId;
  if (args.quality != null) options.quality = args.quality;

  const dataUrl = await CAT.agent.dom.screenshot(options);

  if (!dataUrl) {
    return { content: "截图失败：未获取到图片数据", attachments: [] };
  }

  return {
    content: "截图已拍摄",
    attachments: [
      {
        type: "image",
        mediaType: "image/jpeg",
        data: dataUrl,
      },
    ],
  };
} catch (e) {
  const msg = e.message || String(e);
  if (/tab/i.test(msg) && /not found|no such/i.test(msg)) {
    return { content: `截图失败：标签页不存在（tabId=${args.tabId}）`, attachments: [] };
  }
  if (/chrome:\/\/|edge:\/\/|about:/i.test(msg)) {
    return { content: "截图失败：无法对浏览器内部页面截图", attachments: [] };
  }
  return { content: `截图失败: ${msg}`, attachments: [] };
}
