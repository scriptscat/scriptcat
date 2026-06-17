import { useEffect, useRef, useState } from "react";
import type { ImportItem } from "@App/pages/options/routes/ScriptList/importHandler";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");

export function useScriptDropzone(onFiles: (items: ImportItem[]) => void): { isDragActive: boolean } {
  const [isDragActive, setActive] = useState(false);
  const counter = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      counter.current++;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      counter.current--;
      if (counter.current <= 0) {
        counter.current = 0;
        setActive(false);
      }
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      counter.current = 0;
      setActive(false);
      const dt = e.dataTransfer!;
      const items: ImportItem[] = [];
      const dtItems = Array.from(dt.items || []).filter((it) => it.kind === "file");
      if (dtItems.length) {
        await Promise.all(
          dtItems.map(async (it) => {
            let handle: FileSystemFileHandle | null = null;
            if ("getAsFileSystemHandle" in it) {
              // Chrome 专有:取 FileSystemFileHandle 以支持本地文件监听;Firefox/Safari 无此 API,回退 getAsFile
              const h = await (it as any).getAsFileSystemHandle().catch(() => null);
              if (h && h.kind === "file") handle = h as FileSystemFileHandle;
            }
            const file = handle ? await handle.getFile() : it.getAsFile();
            if (file) items.push({ file, handle });
          })
        );
      } else {
        for (const file of Array.from(dt.files)) items.push({ file, handle: null });
      }
      if (items.length) onFilesRef.current(items);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return { isDragActive };
}
