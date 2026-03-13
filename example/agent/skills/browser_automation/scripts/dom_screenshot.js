// ==CATTool==
// @name         dom_screenshot
// @description  对目标标签页截图并返回图片（支持 vision 模型直接查看）
// @param        tabId number 目标标签页 ID，不传则使用当前活动标签页
// @param        quality number 截图质量（1-100），默认 80
// @grant        CAT.agent.dom
// ==/CATTool==

try {
  const options = {};
  if (args.tabId != null) options.tabId = args.tabId;
  if (args.quality != null) options.quality = args.quality;

  const result = await CAT.agent.dom.screenshot(options);

  if (!result || !result.dataUrl) {
    return { content: "截图失败：未获取到图片数据", attachments: [] };
  }

  return {
    content: "截图已拍摄",
    attachments: [
      {
        type: "image",
        mediaType: result.mediaType || "image/jpeg",
        data: result.dataUrl,
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
