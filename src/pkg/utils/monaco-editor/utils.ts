import type { editor } from "monaco-editor";

export const getEditorWorkerPromise = () => {
  return Promise.resolve(
    new Worker("/src/editor.worker.js", {
      credentials: "omit",
      name: "editorWorker",
      type: "module",
    })
  );
};

export const getTsWorkerPromise = () => {
  return fetch(chrome.runtime.getURL(`/src/ts.worker.js.bin`))
    .then((resp) => (resp.ok ? resp.blob() : null))
    .catch(() => null)
    .then(async (blob) => {
      if (blob) {
        const blobUrl = URL.createObjectURL(new Blob([blob], { type: "text/javascript" }));
        return new Worker(blobUrl, { credentials: "omit", name: "tsWorker", type: "module" });
      }
      throw new Error("no ts.worker.js");
    });
};

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
