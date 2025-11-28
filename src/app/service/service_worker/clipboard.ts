let textareaDOM: HTMLTextAreaElement | undefined;
let customClipboardData: { mimetype: string; data: string } | undefined;

// 抽出成独立处理。日后有需要可以改成 chrome API
export const setClipboard = (data: string, mimetype: string) => {
  if (!textareaDOM) {
    throw new Error("mightPrepareSetClipboard shall be called first.");
  }
  customClipboardData = {
    mimetype,
    data,
  };
  textareaDOM!.focus();
  document.execCommand("copy", false, <any>null);
};

// 设置 setClipboard 相关DOM
export const mightPrepareSetClipboard = () => {
  if (textareaDOM) {
    return;
  }
  if (typeof document !== "object") {
    throw new Error(
      "mightPrepareSetClipboard shall be only called in either Chrome offscreen or FF background script."
    );
  }
  textareaDOM = document.createElement("textarea") as HTMLTextAreaElement;
  textareaDOM.style.display = "none";
  document.documentElement.appendChild(textareaDOM);
  document.addEventListener("copy", (e: ClipboardEvent) => {
    if (!customClipboardData || !e?.clipboardData?.setData) {
      return;
    }
    e.preventDefault();
    const { mimetype, data } = customClipboardData;
    customClipboardData = undefined;
    e.clipboardData.setData(mimetype || "text/plain", data);
  });
};
