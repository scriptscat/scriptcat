import type { editor } from "monaco-editor";

const getPartialBlob = (idx: number): Promise<Blob | null> =>
  fetch(chrome.runtime.getURL(`/src/ts.worker.js.part${idx}`))
    .then((resp) => (resp.ok ? resp.blob() : null))
    .catch(() => null);
const combineBlobsToUrl = async (blobs: Blob[], defaultType?: string): Promise<string> => {
  const arrayBuffers: ArrayBuffer[] = [];
  let totalLength = 0;

  // Read all blobs into ArrayBuffers and compute total length
  for (const blob of blobs) {
    const arrayBuffer = await blob.arrayBuffer();
    arrayBuffers.push(arrayBuffer);
    totalLength += arrayBuffer.byteLength; // <-- sum, don't overwrite
  }

  // Allocate a single Uint8Array large enough for everything
  const combined = new Uint8Array(totalLength);

  // Copy each buffer into the combined array
  let offset = 0;
  for (const buffer of arrayBuffers) {
    combined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  // Create a single Blob out of the combined data
  const type = defaultType || blobs[0]?.type || "application/octet-stream";
  const combinedBlob = new Blob([combined], { type });

  // Create a Blob URL
  const blobUrl = URL.createObjectURL(combinedBlob);
  // 注意：此处生成的 Blob URL 在整个应用生命周期内用于 Worker，不会被释放。
  // 如果未来 Worker 支持销毁重建，请在销毁时调用 URL.revokeObjectURL(blobUrl) 释放资源。
  return blobUrl;
};
export const getTsWorkerPromise = () =>
  fetch(chrome.runtime.getURL("/src/ts.worker.js.part0"))
    .then((resp) => {
      return resp.ok ? resp.blob() : null;
    })
    .catch(() => {
      return null;
    })
    .then(async (blob) => {
      let worker: Worker;
      if (blob) {
        // 有分割
        const blobs: Blob[] = [];
        let idx = 0;
        do {
          blobs.push(blob);
          blob = await getPartialBlob(++idx);
        } while (blob);
        const url = await combineBlobsToUrl(blobs, "text/javascript");
        worker = new Worker(url, { type: "module" });
      } else {
        // 沒分割
        worker = new Worker("/src/ts.worker.js", { type: "module" });
      }
      return worker;
    });

export const findGlobalInsertionInfo = (model: editor.ITextModel) => {
  const lineCount = model.getLineCount();

  let insertLine = 1; // first non-comment line
  let globalLine: number | null = null;

  let line = 1;
  while (line <= lineCount) {
    const raw = model.getLineContent(line);
    const text = raw.trim();

    // empty line
    if (text === "") {
      line += 1;
      continue;
    }

    // single-line comment
    if (text.startsWith("//")) {
      line += 1;
      continue;
    }

    // block comment
    if (text.startsWith("/*")) {
      // check if this is a /* global ... */ comment
      if (/^\/\*\s*global\b/.test(text)) {
        globalLine = line;
      }

      // skip the whole block comment
      while (line <= lineCount && !model.getLineContent(line).includes("*/")) {
        line += 1;
      }
      line += 1;
      continue;
    }

    // first non-comment, non-empty line = insertion point
    insertLine = line;
    break;
  }

  // fallback (file all comments / empty)
  if (insertLine > lineCount) {
    insertLine = lineCount + 1;
  }

  return { insertLine, globalLine };
};

export const escapeRegExp = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const updateGlobalCommentLine = (oldLine: string, globalName: string) => {
  // if already present, do nothing
  // 使用更灵活的边界匹配，支持包含特殊字符的变量名
  const escapedName = escapeRegExp(globalName);
  // 匹配前面是空白、逗号或global关键字，后面是空白、逗号或*/的情况
  const nameRegex = new RegExp("(?:^|[\\s,]|global\\s+)" + escapedName + "(?=[\\s,]|\\*/|$)");
  if (nameRegex.test(oldLine)) {
    return oldLine;
  }

  const endIdx = oldLine.lastIndexOf("*/");
  if (endIdx === -1) {
    // weird / malformed, just append
    return oldLine + ", " + globalName;
  }

  const before = oldLine.slice(0, endIdx).trimEnd(); // up to before */
  const after = oldLine.slice(endIdx); // "*/" and whatever after

  // decide separator
  const needsComma =
    !/global\s*$/.test(before) && // not just "/* global"
    !/[, ]$/.test(before); // doesn't already end with , or space

  const sep = needsComma ? ", " : " ";

  return before + sep + globalName + " " + after;
};
