import type { ImportItem } from "./importHandler";

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

async function pick(types: PickerType[], inputAccept: string): Promise<ImportItem[]> {
  if ("showOpenFilePicker" in window) {
    try {
      const handles = await window.showOpenFilePicker({ multiple: true, types });
      return await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
    } catch (e) {
      // 用户取消(AbortError)等同未选择
      if ((e as DOMException)?.name === "AbortError") return [];
      throw e;
    }
  }
  // 回退:<input type=file>(无法获得 handle,不能监听本地文件)
  return new Promise<ImportItem[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = inputAccept;
    input.multiple = true;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      resolve(Array.from(input.files || []).map((file) => ({ file, handle: null })));
    };
    // 取消时多数浏览器不触发 change,靠窗口重获焦点兜底(延时让 change 先于 focus 落地)
    const onFocus = () => setTimeout(finish, 300);
    input.onchange = finish;
    window.addEventListener("focus", onFocus);
    input.click();
  });
}

export function pickScriptFiles(): Promise<ImportItem[]> {
  return pick([{ description: "JavaScript", accept: { "text/javascript": [".js"] } }], ".js");
}

export function pickSkillZip(): Promise<ImportItem[]> {
  return pick([{ description: "Skill Package", accept: { "application/zip": [".zip"] } }], ".zip");
}
