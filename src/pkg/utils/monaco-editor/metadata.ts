import type { editor } from "monaco-editor";
import { resolveMetadataTagBase } from "@App/pkg/utils/script_compat";
import { parseResourceDeclaration } from "@App/pkg/utils/resource";

export type MetadataAlignmentLine = {
  lineNumber: number;
  lineText: string;
  prefix: string;
  tag: string;
  spacing: string;
  value: string;
  valueColumn: number;
};

export type MetadataAlignmentBlock = {
  startLineNumber: number;
  endLineNumber: number;
  lines: MetadataAlignmentLine[];
};

export type MetadataBlockRange = {
  startLineNumber: number;
  endLineNumber: number;
};

export type UndefinedMetadataTagMatch = {
  lineNumber: number;
  startColumn: number;
  endColumn: number;
};

export type DuplicateResourceNameMatch = {
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  name: string;
};

export const metadataHoverPattern = /^(\s*\/\/[ \t]*@)(\S+)([ \t]*)(.*)$/;
export const metadataLineStartPattern = /^\s*\/\/[ \t]*@/;
export const userscriptHeaderPattern = /^\s*\/\/[ \t]*==UserScript==[ \t]*$/;
export const userscriptEndPattern = /^\s*\/\/[ \t]*==\/UserScript==[ \t]*$/;
const metadataAlignmentPattern = /^(\s*\/\/[ \t]*@)(\S+)([ \t]+)(.*)$/;

export const getMetadataAlignmentLine = (lineNumber: number, lineText: string): MetadataAlignmentLine | null => {
  const match = metadataAlignmentPattern.exec(lineText);
  if (!match) return null;

  const [, prefix, tag, spacing, value] = match;
  return {
    lineNumber,
    lineText,
    prefix,
    tag,
    spacing,
    value,
    valueColumn: prefix.length + tag.length + spacing.length,
  };
};

/**
 * 只识别第一个成对闭合的 ==UserScript==/==/UserScript== 区块，与运行时 parseMetadata 的
 * HEADER_BLOCK 正则语义保持一致（src/pkg/utils/script.ts）：未闭合的区块不会产出任何区块，
 * 闭合区块之外/之后的额外区块也不会被扫描。
 */
export const getMetadataAlignmentBlocks = (model: editor.ITextModel): MetadataAlignmentBlock[] => {
  const lineCount = model.getLineCount();
  let currentBlock: MetadataAlignmentBlock | null = null;

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const lineText = model.getLineContent(lineNumber);

    if (currentBlock === null) {
      if (userscriptHeaderPattern.test(lineText)) {
        currentBlock = { startLineNumber: lineNumber, endLineNumber: lineNumber, lines: [] };
      }
      continue;
    }

    if (userscriptEndPattern.test(lineText)) {
      currentBlock.endLineNumber = lineNumber;
      return [currentBlock];
    }

    const alignmentLine = getMetadataAlignmentLine(lineNumber, lineText);
    if (alignmentLine) {
      currentBlock.lines.push(alignmentLine);
    }
  }

  return [];
};

export const getMetadataAlignmentTargetColumn = (lines: MetadataAlignmentLine[]) =>
  Math.max(...lines.map((line) => line.prefix.length + line.tag.length + 1));

export const isMetadataAlignmentBlockAligned = (block: MetadataAlignmentBlock) => {
  if (block.lines.length < 2) return true;
  const firstValueColumn = block.lines[0].valueColumn;
  return block.lines.every((line) => line.valueColumn === firstValueColumn);
};

export const isKnownMetadataTag = (tag: string, knownTags: ReadonlySet<string>): boolean =>
  knownTags.has(resolveMetadataTagBase(tag));

export const getUndefinedMetadataTagMatches = (
  model: editor.ITextModel,
  blocks: MetadataAlignmentBlock[],
  knownTags: ReadonlySet<string>
): UndefinedMetadataTagMatch[] => {
  const matches: UndefinedMetadataTagMatch[] = [];

  for (const block of blocks) {
    for (let lineNumber = block.startLineNumber; lineNumber <= block.endLineNumber; lineNumber += 1) {
      const lineText = model.getLineContent(lineNumber);
      const metadataMatch = metadataHoverPattern.exec(lineText);
      if (!metadataMatch) continue;

      const [, prefix, tag] = metadataMatch;
      if (isKnownMetadataTag(tag, knownTags)) continue;

      matches.push({
        lineNumber,
        startColumn: prefix.length + 1,
        endColumn: prefix.length + tag.length + 1,
      });
    }
  }

  return matches;
};

/**
 * 只检查第一个有效 metadata 区块内的 @resource 声明（block 已由 getMetadataAlignmentBlocks
 * 限定为第一个成对闭合的区块）。名称按大小写敏感分组，复用 parseResourceDeclaration 解析
 * `<name> <url>`，格式不合法的声明会被 parseResourceDeclaration 拒绝并忽略。
 */
export const getDuplicateResourceNameMatches = (blocks: MetadataAlignmentBlock[]): DuplicateResourceNameMatch[] => {
  const matches: DuplicateResourceNameMatch[] = [];

  for (const block of blocks) {
    const linesByName = new Map<string, MetadataAlignmentLine[]>();

    for (const line of block.lines) {
      if (line.tag.toLowerCase() !== "resource") continue;

      const declaration = parseResourceDeclaration(line.value.trim());
      if (!declaration) continue;

      const lines = linesByName.get(declaration.name);
      if (lines) {
        lines.push(line);
      } else {
        linesByName.set(declaration.name, [line]);
      }
    }

    for (const [name, lines] of linesByName) {
      if (lines.length < 2) continue;

      for (const line of lines) {
        matches.push({
          lineNumber: line.lineNumber,
          startColumn: line.valueColumn + 1,
          endColumn: line.valueColumn + 1 + name.length,
          name,
        });
      }
    }
  }

  return matches;
};

const lineCanAffectMetadataMarkers = (lineText: string) =>
  metadataLineStartPattern.test(lineText) ||
  userscriptHeaderPattern.test(lineText) ||
  userscriptEndPattern.test(lineText);

const commentEditCanAffectMetadataMarkers = (lineText: string, change: editor.IModelContentChange) =>
  /^\s*\/\//.test(lineText) || (change.rangeLength > 0 && change.range.startColumn <= 12);

const changeIntersectsBlockRange = (change: editor.IModelContentChange, blockRange: MetadataBlockRange | null) =>
  blockRange !== null &&
  change.range.startLineNumber >= blockRange.startLineNumber &&
  change.range.startLineNumber <= blockRange.endLineNumber;

/**
 * 判断本次内容变更是否可能影响 ScriptCat metadata 诊断。除了基于变更后文本形态的启发式判断外，
 * 还会检查变更行是否落在“上一次识别到的 metadata 区块”范围内——这样即使一次编辑让某一行从
 * metadata 注释变为非注释（例如在 `// @foo` 行首插入字符），只要该行原本在区块内就一定会触发
 * 重新计算，不依赖正则去猜编辑前后的文本形态，从而避免遗留过期 marker。
 */
export const contentChangeCanAffectMetadataMarkers = (
  model: editor.ITextModel,
  event: editor.IModelContentChangedEvent,
  knownBlockRange: MetadataBlockRange | null
): boolean => {
  if (event.isFlush || event.isEolChange) return true;

  for (const change of event.changes) {
    if (
      change.range.startLineNumber !== change.range.endLineNumber ||
      change.text.includes("\n") ||
      change.text.includes("@") ||
      change.text.includes("UserScript")
    ) {
      return true;
    }

    if (changeIntersectsBlockRange(change, knownBlockRange)) {
      return true;
    }

    const lineText = model.getLineContent(change.range.startLineNumber);
    if (lineCanAffectMetadataMarkers(lineText) || commentEditCanAffectMetadataMarkers(lineText, change)) {
      return true;
    }
  }

  return false;
};
