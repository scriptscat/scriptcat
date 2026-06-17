import type { ImportItem } from "./importHandler";

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

async function pick(types: PickerType[], inputAccept: string): Promise<ImportItem[]> {
  if ("showOpenFilePicker" in window) {
    try {
      const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({ multiple: true, types });
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
    input.onchange = () => {
      const files = Array.from(input.files || []);
      resolve(files.map((file) => ({ file, handle: null })));
    };
    input.click();
  });
}

export function pickScriptFiles(): Promise<ImportItem[]> {
  return pick([{ description: "JavaScript", accept: { "text/javascript": [".js"] } }], ".js");
}

export function pickSkillZip(): Promise<ImportItem[]> {
  return pick([{ description: "Skill Package", accept: { "application/zip": [".zip"] } }], ".zip");
}
