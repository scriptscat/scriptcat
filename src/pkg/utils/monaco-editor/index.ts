import { systemConfig } from "@App/pages/store/global";
import EventEmitter from "eventemitter3";
import { editor, languages, MarkerSeverity } from "monaco-editor";
import { findGlobalInsertionInfo, updateGlobalCommentLine } from "./utils";
import type { EditorLangCode, EditorLangEntry } from "./langs";
import { asEditorLangEntry, editorLangs } from "./langs";
import { deferred } from "../utils";
import { type EslintFix, getModelEslintFixKey } from "./eslintFixCache";

interface ILinterWorker extends Worker {
  myLinterHook: EventEmitter<string, any>;
}

type MetadataLineParts = {
  prefix: string;
  tag: string;
  normalizedTag: MetadataTag;
  spacing: string;
  value: string;
  suffix: string;
};

type MetadataTag = "connect" | "match" | "include";

type MetadataLineFix = {
  code: string;
  title: string;
  text: string;
};

type TextEdit = languages.IWorkspaceTextEdit["textEdit"];

type MetadataAlignmentLine = {
  lineNumber: number;
  lineText: string;
  prefix: string;
  tag: string;
  spacing: string;
  value: string;
  valueColumn: number;
};

type MetadataAlignmentBlock = {
  startLineNumber: number;
  endLineNumber: number;
  lines: MetadataAlignmentLine[];
};

type MetadataAlignmentFix = {
  range: TextEdit["range"];
  text: string;
};

type ScriptcatMonacoEnvironment = typeof window.MonacoEnvironment & {
  myLinterWorker?: ILinterWorker;
  eslintFixMap?: Map<string, EslintFix>;
};

// 注册 eslint worker（全局单例）
const linterWorkerDeferred = deferred<ILinterWorker>();
const configuredLanguagePromise = systemConfig.getLanguage();

let currentEditorLang: EditorLangEntry;
type EditorLangEntryPrompt = typeof currentEditorLang.prompt;
let promptByMetadataTag: EditorLangEntryPrompt;

const loadEditorLangEntry = (languageCode: EditorLangCode) => {
  currentEditorLang = asEditorLangEntry(languageCode);
  promptByMetadataTag = Object.fromEntries(
    Object.entries(currentEditorLang.prompt).map(([metadataTag, prompt]) => [metadataTag.toLowerCase(), prompt])
  ) as typeof currentEditorLang.prompt;
};

loadEditorLangEntry("en-US");

const updateEditorLang = (language: string) => {
  const requestedLanguageCode = `${language || ""}` as EditorLangCode | "";
  const supportedLanguageCode = ((Object.hasOwn(editorLangs, requestedLanguageCode) && requestedLanguageCode) ||
    "en-US") as EditorLangCode;
  loadEditorLangEntry(supportedLanguageCode);
};

configuredLanguagePromise.then((language) => updateEditorLang(language));

systemConfig.addListener("language", (language) => {
  updateEditorLang(language);
});

export class LinterWorkerController {
  static sendLinterMessage(data: unknown) {
    linterWorkerDeferred.promise.then((linterWorker) => {
      linterWorker.postMessage(data);
    });
  }
  static hookAddListener(event: string, fn: (...args: any[]) => void) {
    linterWorkerDeferred.promise.then((linterWorker) => {
      linterWorker.myLinterHook.addListener(event, fn);
    });
  }
  static hookRemoveListener(event: string, fn: (...args: any[]) => void) {
    linterWorkerDeferred.promise.then((linterWorker) => {
      linterWorker.myLinterHook.removeListener(event, fn);
    });
  }
  static hookEmit(event: string, data: any) {
    linterWorkerDeferred.promise.then((linterWorker) => {
      linterWorker.myLinterHook.emit(event, data);
    });
  }
}

let isEditorRegistered = false;

const scriptcatMarkerOwner = "ScriptCat";
const eslintMarkerOwner = "ESLint";
const scriptcatMetadataAlignmentRuleId = "scriptcat/align-metadata-attributes";
const scriptcatRemoveConnectWildcardRuleId = "scriptcat/remove-connect-wildcard";
const scriptcatReplaceMatchTldWildcardRuleId = "scriptcat/replace-match-tld-wildcard-with-include";
const scriptcatReplaceIncludeWithMatchRuleId = "scriptcat/replace-include-with-match";
const scriptcatGrantNoneConflictRuleId = "scriptcat/grant-none-conflict";
const quickfixKind = "quickfix";
const noop = () => {};
const metaLinePattern = /\/\/[ \t]*@(\S+)[ \t]*(.*)$/;
const metadataHoverPattern = /^(\s*\/\/[ \t]*@)(\S+)([ \t]*)(.*)$/;
const metadataFixPattern = /^(\s*\/\/[ \t]*@)(connect|match|include)([ \t]+)(\S+)(.*)$/i;
const metadataAlignmentPattern = /^(\s*\/\/[ \t]*@)(\S+)([ \t]+)(.*)$/;
const metadataLineStartPattern = /^\s*\/\/[ \t]*@/;
const userscriptHeaderPattern = /^\s*\/\/[ \t]*==UserScript==[ \t]*$/;
const userscriptEndPattern = /^\s*\/\/[ \t]*==\/UserScript==[ \t]*$/;
const matchMetadataPattern = /^(\*|[-a-z]+|http\*):\/\/([^/]+)(\/.*)?$/i;
const noUndefMessagePattern = /^[^']*'([^']+)'[^']*$/;

const getMonacoEnvironment = () => window.MonacoEnvironment as ScriptcatMonacoEnvironment | undefined;

const ensureEslintFixMap = (environment: ScriptcatMonacoEnvironment) => {
  environment.eslintFixMap ??= new Map();
  return environment.eslintFixMap;
};

const getMarkerCode = (marker: editor.IMarkerData) => {
  if (!marker.code) return "";
  return typeof marker.code === "string" ? marker.code : marker.code.value;
};

const normalizeGrantValue = (grantValue: string) => {
  switch (grantValue) {
    case "GM.xmlHttpRequest":
      return "GM_xmlhttpRequest";
    case "GM.cookie":
      return "GM_cookie";
    default:
      return grantValue.startsWith("GM.") ? grantValue.replace("GM.", "GM_") : grantValue;
  }
};

const getGrantValueHoverPrompt = (lineText: string, column: number) => {
  const match = metadataHoverPattern.exec(lineText);
  if (!match) return null;

  const [, prefix, tag, spacing, value] = match;
  if (tag.toLowerCase() !== "grant") return null;

  const grantValueMatch = /^\S+/.exec(value);
  if (!grantValueMatch) return null;

  const valueStartColumn = prefix.length + tag.length + spacing.length + 1;
  const valueEndColumn = valueStartColumn + grantValueMatch[0].length;
  if (column < valueStartColumn || column > valueEndColumn) return null;

  const grantValue = grantValueMatch[0];
  const prompt =
    currentEditorLang.grantValuePrompts[grantValue as keyof typeof currentEditorLang.grantValuePrompts] ??
    currentEditorLang.grantValuePrompts[
      normalizeGrantValue(grantValue) as keyof typeof currentEditorLang.grantValuePrompts
    ];
  if (!prompt) return null;

  return `\`${grantValue}\`<br>${prompt}`;
};

const getMetadataValueToken = (value: string) => /^\S+/.exec(value)?.[0] || "";

const createTextEditAction = (
  model: editor.ITextModel,
  title: string,
  diagnostics: editor.IMarkerData[],
  textEdit: TextEdit,
  isPreferred: boolean
) => {
  return {
    title,
    diagnostics,
    kind: quickfixKind,
    edit: {
      edits: [{ resource: model.uri, textEdit, versionId: undefined }],
    },
    isPreferred,
  } satisfies languages.CodeAction;
};

const createTextEditsAction = (
  model: editor.ITextModel,
  title: string,
  diagnostics: editor.IMarkerData[],
  textEdits: TextEdit[],
  isPreferred: boolean
) => {
  return {
    title,
    diagnostics,
    kind: quickfixKind,
    edit: {
      edits: textEdits.map((textEdit) => ({
        resource: model.uri,
        textEdit,
        versionId: undefined,
      })),
    },
    isPreferred,
  } satisfies languages.CodeAction;
};

const createLineReplacementAction = (
  model: editor.ITextModel,
  title: string,
  diagnostics: editor.IMarkerData[],
  lineNumber: number,
  lineText: string,
  text: string,
  isPreferred: boolean
) => {
  return createTextEditAction(
    model,
    title,
    diagnostics,
    {
      range: {
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: lineText.length + 1,
      },
      text,
    },
    isPreferred
  );
};

const isSimpleValidHost = (hostName: string) => {
  if (!hostName) return false;
  try {
    hostName = hostName.toLowerCase();
    return new URL(`https://${hostName}.com/path`).origin === `https://${hostName}.com`;
  } catch {
    return false;
  }
};

const parseMetadataLine = (lineText: string): MetadataLineParts | null => {
  if (lineText.length < 6 || !lineText.includes("@")) return null;
  const metadataMatch = metadataFixPattern.exec(lineText);
  if (!metadataMatch) return null;

  const [, prefix, tag, spacing, value, suffix] = metadataMatch;
  return {
    prefix,
    tag,
    normalizedTag: tag.toLowerCase() as MetadataTag,
    spacing,
    value,
    suffix,
  };
};

const createMetadataFix = (code: string, titleTemplate: string, titleValue: string, text: string): MetadataLineFix => {
  return {
    code,
    title: titleTemplate.replace("{0}", titleValue),
    text,
  };
};

const getIncludeSpacing = (spacing: string, tag: string) => {
  const lenDiff = "include".length - tag.length;
  if (lenDiff <= 0) return spacing;
  const targetLength = Math.max(1, spacing.length - lenDiff);
  return spacing.slice(0, targetLength);
};

const normalizeHost = (hostPattern: string) => {
  const wildcardNormalizedHost = hostPattern
    .split(".")
    .map((hostSegment) => (hostSegment.includes("*") ? "*" : hostSegment))
    .join(".");
  return wildcardNormalizedHost;
};

const getConnectMetadataFixes = ({ prefix, tag, spacing, value, suffix }: MetadataLineParts): MetadataLineFix[] => {
  if (!value.startsWith("*.") || value.includes("**")) return [];

  const hostName = value.slice(2);
  if (!/\.\w{2,}$/.test(hostName) || !isSimpleValidHost(hostName)) return [];

  const titleTemplate = currentEditorLang.removeConnectWildcard;
  return [
    createMetadataFix(
      scriptcatRemoveConnectWildcardRuleId,
      titleTemplate,
      hostName,
      `${prefix}${tag}${spacing}${hostName}${suffix}`
    ),
  ];
};

const getMatchMetadataFixes = ({
  prefix,
  normalizedTag,
  spacing,
  value,
  suffix,
}: MetadataLineParts): MetadataLineFix[] => {
  if (!value || value.startsWith("/")) return [];
  const metadataValueMatch = matchMetadataPattern.exec(value);
  if (!metadataValueMatch || !metadataValueMatch[2]) return [];
  const hostPattern = metadataValueMatch[2];
  const wildcardNormalizedHost = normalizeHost(hostPattern);
  if (
    !wildcardNormalizedHost.endsWith(".*") ||
    !hostPattern.includes(".") ||
    hostPattern.includes("**") ||
    hostPattern.includes("\\")
  )
    return [];

  const hostName = hostPattern.slice(0, hostPattern.lastIndexOf("."));
  if (!isSimpleValidHost(hostName.replace(/\*/g, "x"))) return [];

  const includeSpacing = getIncludeSpacing(spacing, normalizedTag);
  const tldValue = `${metadataValueMatch[1]}://${hostName}.tld${metadataValueMatch[3] || ""}`;

  const titleTemplate = currentEditorLang.replaceMatchTldWildcardWithInclude;
  const actions = [];
  if (hostPattern.endsWith(".*")) {
    actions.push(
      createMetadataFix(
        scriptcatReplaceMatchTldWildcardRuleId,
        titleTemplate,
        tldValue,
        `${prefix}include${includeSpacing}${tldValue}${suffix}`
      )
    );
  }
  actions.push(
    createMetadataFix(
      scriptcatReplaceMatchTldWildcardRuleId,
      titleTemplate,
      value,
      `${prefix}include${includeSpacing}${value}${suffix}`
    )
  );
  return actions;
};

const getIncludeMetadataFixes = ({
  prefix,
  normalizedTag,
  spacing,
  value,
  suffix,
}: MetadataLineParts): MetadataLineFix[] => {
  const metadataValueMatch = matchMetadataPattern.exec(value);
  const hostPattern = metadataValueMatch?.[2];
  const wildcardNormalizedHost = hostPattern ? normalizeHost(hostPattern) : "";
  if (
    !metadataValueMatch ||
    !hostPattern ||
    wildcardNormalizedHost.endsWith(".*") ||
    hostPattern.includes("**") ||
    hostPattern.endsWith(".tld")
  )
    return [];
  if (isSimpleValidHost(wildcardNormalizedHost.replace(/\*/g, "x"))) {
    const includeSpacing = getIncludeSpacing(spacing, normalizedTag);
    const titleTemplate = currentEditorLang.replaceIncludeWithMatch;
    return [
      createMetadataFix(
        scriptcatReplaceIncludeWithMatchRuleId,
        titleTemplate,
        value,
        `${prefix}match  ${includeSpacing}${value}${suffix}`
      ),
    ];
  }
  return [];
};

const getMetadataLineFixes = (lineText: string): MetadataLineFix[] => {
  const parts = parseMetadataLine(lineText);
  if (!parts) return [];

  switch (parts.normalizedTag) {
    case "connect":
      return getConnectMetadataFixes(parts);
    case "match":
      return getMatchMetadataFixes(parts);
    case "include":
      return getIncludeMetadataFixes(parts);
    default:
      return [];
  }
};

const getMetadataLineActions = (
  model: editor.ITextModel,
  lineNumber: number,
  lineText: string,
  markers: editor.IMarkerData[]
): languages.CodeAction[] => {
  const metadataFixes = getMetadataLineFixes(lineText);
  if (metadataFixes.length === 0) return [];

  return metadataFixes.map((metadataFix, index) =>
    createLineReplacementAction(
      model,
      metadataFix.title,
      markers.filter(
        (marker) =>
          marker.source === scriptcatMarkerOwner &&
          marker.startLineNumber === lineNumber &&
          getMarkerCode(marker) === metadataFix.code
      ),
      lineNumber,
      lineText,
      metadataFix.text,
      index === 0
    )
  );
};

const getMetadataAlignmentLine = (lineNumber: number, lineText: string): MetadataAlignmentLine | null => {
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

const getMetadataAlignmentBlocks = (model: editor.ITextModel): MetadataAlignmentBlock[] => {
  const blocks: MetadataAlignmentBlock[] = [];
  const lineCount = model.getLineCount();
  let currentBlock: MetadataAlignmentBlock | null = null;

  const finishBlock = (endLineNumber: number) => {
    if (!currentBlock) return;
    currentBlock.endLineNumber = endLineNumber;
    blocks.push(currentBlock);
    currentBlock = null;
  };

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const lineText = model.getLineContent(lineNumber);

    if (userscriptHeaderPattern.test(lineText)) {
      finishBlock(lineNumber - 1);
      currentBlock = {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        lines: [],
      };
      continue;
    }

    if (!currentBlock) continue;

    const alignmentLine = getMetadataAlignmentLine(lineNumber, lineText);
    if (alignmentLine) {
      currentBlock.lines.push(alignmentLine);
    }

    if (userscriptEndPattern.test(lineText)) {
      finishBlock(lineNumber);
    }
  }

  finishBlock(lineCount);
  return blocks;
};

const getMetadataAlignmentTargetColumn = (lines: MetadataAlignmentLine[]) =>
  Math.max(...lines.map((line) => line.prefix.length + line.tag.length + 1));

const isMetadataAlignmentBlockAligned = (block: MetadataAlignmentBlock) => {
  if (block.lines.length < 2) return true;
  const firstValueColumn = block.lines[0].valueColumn;
  return block.lines.every((line) => line.valueColumn === firstValueColumn);
};

const getMetadataAlignmentFix = (model: editor.ITextModel, block: MetadataAlignmentBlock): MetadataAlignmentFix => {
  const targetColumn = getMetadataAlignmentTargetColumn(block.lines);
  const lineFixes = new Map(
    block.lines.map((line) => {
      const spacing = " ".repeat(Math.max(1, targetColumn - line.prefix.length - line.tag.length));
      return [line.lineNumber, `${line.prefix}${line.tag}${spacing}${line.value}`];
    })
  );
  const blockLines: string[] = [];

  for (let lineNumber = block.startLineNumber; lineNumber <= block.endLineNumber; lineNumber += 1) {
    blockLines.push(lineFixes.get(lineNumber) ?? model.getLineContent(lineNumber));
  }

  return {
    range: {
      startLineNumber: block.startLineNumber,
      startColumn: 1,
      endLineNumber: block.endLineNumber,
      endColumn: model.getLineContent(block.endLineNumber).length + 1,
    },
    text: blockLines.join("\n"),
  };
};

const getMetadataAlignmentBlockAtLine = (model: editor.ITextModel, lineNumber: number) =>
  getMetadataAlignmentBlocks(model).find(
    (block) =>
      block.startLineNumber <= lineNumber &&
      lineNumber <= block.endLineNumber &&
      !isMetadataAlignmentBlockAligned(block)
  );

const getMetadataAlignmentActions = (
  model: editor.ITextModel,
  lineNumber: number,
  markers: editor.IMarkerData[]
): languages.CodeAction[] => {
  const alignmentMarkers = markers.filter(
    (marker) =>
      marker.source === scriptcatMarkerOwner &&
      getMarkerCode(marker) === scriptcatMetadataAlignmentRuleId &&
      marker.startLineNumber <= lineNumber &&
      lineNumber <= marker.endLineNumber
  );
  if (alignmentMarkers.length === 0) return [];

  const block = getMetadataAlignmentBlockAtLine(model, lineNumber);
  if (!block) return [];

  return [
    createTextEditsAction(
      model,
      currentEditorLang.quickfix.replace("{0}", scriptcatMetadataAlignmentRuleId),
      alignmentMarkers,
      [getMetadataAlignmentFix(model, block)],
      true
    ),
  ];
};

const getGrantNoneConflictMarkers = (blocks: MetadataAlignmentBlock[]): editor.IMarkerData[] => {
  const markers: editor.IMarkerData[] = [];

  for (const block of blocks) {
    const grantLines: Array<{ line: MetadataAlignmentLine; grantValue: string }> = [];
    let hasNone = false;
    let hasGmApi = false;

    for (const line of block.lines) {
      if (line.tag.toLowerCase() !== "grant") continue;

      const grantValue = getMetadataValueToken(line.value);
      if (!grantValue) continue;

      grantLines.push({ line, grantValue });
      hasNone ||= grantValue === "none";
      hasGmApi ||= grantValue.startsWith("GM");
    }

    if (!hasNone || !hasGmApi) continue;

    for (const { line, grantValue } of grantLines) {
      if (grantValue !== "none" && !grantValue.startsWith("GM")) continue;
      markers.push({
        severity: MarkerSeverity.Warning,
        message: currentEditorLang.grantConflict,
        source: scriptcatMarkerOwner,
        code: scriptcatGrantNoneConflictRuleId,
        startLineNumber: line.lineNumber,
        startColumn: 1,
        endLineNumber: line.lineNumber,
        endColumn: line.lineText.length + 1,
      });
    }
  }

  return markers;
};

const getNoUndefGlobalName = (marker: editor.IMarkerData) => {
  return noUndefMessagePattern.exec(marker.message)?.[1] || null;
};

const getGlobalDeclarationTextEdit = (model: editor.ITextModel, globalName: string): TextEdit => {
  const { insertLine, globalLine } = findGlobalInsertionInfo(model);

  if (globalLine == null) {
    return {
      range: {
        startLineNumber: insertLine,
        startColumn: 1,
        endLineNumber: insertLine,
        endColumn: 1,
      },
      text: `/* global ${globalName} */\n`,
    };
  }

  const existingGlobalLineText = model.getLineContent(globalLine);
  return {
    range: {
      startLineNumber: globalLine,
      startColumn: 1,
      endLineNumber: globalLine,
      endColumn: existingGlobalLineText.length + 1,
    },
    text: updateGlobalCommentLine(existingGlobalLineText, globalName),
  };
};

const getMarkerCodeActions = (
  model: editor.ITextModel,
  marker: editor.IMarkerData,
  eslintFixMap?: Map<string, EslintFix>
): languages.CodeAction[] => {
  if (marker.source !== eslintMarkerOwner) return [];
  const eslintRuleId = getMarkerCode(marker);
  if (!eslintRuleId) return [];

  const actions: languages.CodeAction[] = [];

  const eslintFix = eslintFixMap?.get(getModelEslintFixKey(model, eslintRuleId, marker));
  if (eslintFix) {
    actions.push(
      createTextEditAction(
        model,
        currentEditorLang.quickfix.replace("{0}", eslintRuleId),
        [marker],
        {
          range: eslintFix.range,
          text: eslintFix.text,
        },
        true
      )
    );
  }

  let canAddEslintDisableNextLine = true;

  switch (eslintRuleId) {
    case "no-undef": {
      const globalName = getNoUndefGlobalName(marker);
      if (globalName) {
        actions.push(
          createTextEditAction(
            model,
            currentEditorLang.declareGlobal.replace("{0}", globalName),
            [marker],
            getGlobalDeclarationTextEdit(model, globalName),
            false
          )
        );
      }
      break;
    }
    case "userscripts/align-attributes":
    case "userscripts/better-use-match":
    case "userscripts/no-invalid-headers":
      canAddEslintDisableNextLine = false;
  }

  if (canAddEslintDisableNextLine) {
    actions.push(
      createTextEditAction(
        model,
        currentEditorLang.addEslintDisableNextLine,
        [marker],
        {
          range: {
            startLineNumber: marker.startLineNumber,
            endLineNumber: marker.startLineNumber,
            startColumn: 1,
            endColumn: 1,
          },
          text: `// eslint-disable-next-line ${eslintRuleId}\n`,
        },
        true
      )
    );
  }
  actions.push(
    createTextEditAction(
      model,
      currentEditorLang.addEslintDisable,
      [marker],
      {
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        },
        text: `/* eslint-disable ${eslintRuleId} */\n`,
      },
      true
    )
  );

  return actions;
};

const lineCanAffectMetadataMarkers = (lineText: string) =>
  metadataLineStartPattern.test(lineText) ||
  userscriptHeaderPattern.test(lineText) ||
  userscriptEndPattern.test(lineText);

const commentEditCanAffectMetadataMarkers = (lineText: string, change: editor.IModelContentChange) =>
  /^\s*\/\//.test(lineText) || (change.rangeLength > 0 && change.range.startColumn <= 12);

const contentChangeCanAffectMetadataMarkers = (model: editor.ITextModel, event: editor.IModelContentChangedEvent) => {
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

    const lineText = model.getLineContent(change.range.startLineNumber);
    if (lineCanAffectMetadataMarkers(lineText) || commentEditCanAffectMetadataMarkers(lineText, change)) {
      return true;
    }
  }

  return false;
};

const updateScriptcatMetadataMarkers = (model: editor.ITextModel) => {
  if (model.getLanguageId() !== "javascript") {
    editor.setModelMarkers(model, scriptcatMarkerOwner, []);
    return;
  }

  const metadataBlocks = getMetadataAlignmentBlocks(model);
  const markers: editor.IMarkerData[] = [];
  markers.push(...getGrantNoneConflictMarkers(metadataBlocks));

  for (const block of metadataBlocks) {
    if (isMetadataAlignmentBlockAligned(block)) continue;
    markers.push({
      severity: MarkerSeverity.Warning,
      message: currentEditorLang.quickfix.replace("{0}", scriptcatMetadataAlignmentRuleId),
      source: scriptcatMarkerOwner,
      code: scriptcatMetadataAlignmentRuleId,
      startLineNumber: block.startLineNumber,
      startColumn: 1,
      endLineNumber: block.endLineNumber,
      endColumn: model.getLineContent(block.endLineNumber).length + 1,
    });
  }

  for (const block of metadataBlocks) {
    for (const line of block.lines) {
      const metadataLineFixes = getMetadataLineFixes(line.lineText);
      if (metadataLineFixes.length === 0) continue;

      markers.push({
        severity: MarkerSeverity.Warning,
        message: metadataLineFixes[0].title,
        source: scriptcatMarkerOwner,
        code: metadataLineFixes[0].code,
        startLineNumber: line.lineNumber,
        startColumn: 1,
        endLineNumber: line.lineNumber,
        endColumn: line.lineText.length + 1,
      });
    }
  }

  editor.setModelMarkers(model, scriptcatMarkerOwner, markers);
};

const registerScriptcatMetadataMarkerProvider = () => {
  const registerMetadataModel = (model: editor.ITextModel) => {
    updateScriptcatMetadataMarkers(model);
    model.onDidChangeContent((event) => {
      if (model.getLanguageId() !== "javascript") return;
      if (contentChangeCanAffectMetadataMarkers(model, event)) {
        updateScriptcatMetadataMarkers(model);
      }
    });
    model.onDidChangeLanguage(() => {
      updateScriptcatMetadataMarkers(model);
    });
  };

  editor.getModels().forEach(registerMetadataModel);
  editor.onDidCreateModel(registerMetadataModel);
};

/**
 * 注册 monaco-editor 的全局环境与语言支援
 * 应该在应用启动早期执行一次（例如在 App 根组件 mount 时）
 */
export function registerEditor() {
  // 避免重复注册
  if (isEditorRegistered) return;
  isEditorRegistered = true;

  // worker 初始化：复用已有 worker 或创建新的
  const existingEnvironment = getMonacoEnvironment();
  if (existingEnvironment?.myLinterWorker) {
    ensureEslintFixMap(existingEnvironment);
    linterWorkerDeferred.resolve(existingEnvironment.myLinterWorker);
  } else {
    const linterWorker = new Worker("/src/linter.worker.js") as ILinterWorker;
    linterWorker.myLinterHook = new EventEmitter<string, any>();

    linterWorker.onmessage = (event) => {
      LinterWorkerController.hookEmit("message", event.data);
    };

    window.MonacoEnvironment = {
      ...existingEnvironment,
      getWorkerUrl(_moduleId: unknown, label: string) {
        if (label === "json") {
          return "/src/json.worker.js";
        }
        if (label === "typescript" || label === "javascript") {
          return "/src/ts.worker.js";
        }
        return "/src/editor.worker.js";
      },
      myLinterWorker: linterWorker,
      eslintFixMap: new Map<string, EslintFix>(),
    } as ScriptcatMonacoEnvironment;

    linterWorkerDeferred.resolve(linterWorker);
  }

  // provider 注册始终执行，不受 worker 复用影响
  registerScriptcatMetadataMarkerProvider();

  languages.registerHoverProvider("javascript", {
    provideHover: (model, position) => {
      const lineText = model.getLineContent(position.lineNumber);
      const grantValuePrompt = getGrantValueHoverPrompt(lineText, position.column);
      if (grantValuePrompt) {
        return {
          contents: [
            {
              value: grantValuePrompt,
              supportHtml: true,
            },
          ],
        };
      }

      const metadataCommentMatch = metaLinePattern.exec(lineText);

      if (metadataCommentMatch) {
        const metadataTag = metadataCommentMatch[1].toLowerCase() as keyof EditorLangEntryPrompt;
        return {
          contents: [
            {
              value: promptByMetadataTag[metadataTag] || currentEditorLang.undefinedPrompt,
              supportHtml: true,
            },
          ],
        };
      }

      if (/==UserScript==/.test(lineText)) {
        return { contents: [{ value: currentEditorLang.thisIsAUserScript }] };
      }

      return null;
    },
  });

  languages.registerCodeActionProvider(
    "javascript",
    {
      provideCodeActions: (model /** ITextModel */, range /** Range */, context /** CodeActionContext */) => {
        const eslintFixMap = getMonacoEnvironment()?.eslintFixMap;
        const lineText = model.getLineContent(range.startLineNumber);
        const actions = [
          ...getMetadataLineActions(model, range.startLineNumber, lineText, context.markers),
          ...getMetadataAlignmentActions(model, range.startLineNumber, context.markers),
          ...context.markers.flatMap((marker) => getMarkerCodeActions(model, marker, eslintFixMap)),
        ];

        return { actions, dispose: noop };
      },
    },
    { providedCodeActionKinds: ["quickfix"] }
  );

  // 设定编译器选项与额外类型定义
  Promise.all([systemConfig.getEditorConfig(), systemConfig.getEditorTypeDefinition()]).then(
    ([editorConfig, typeDefinition]) => {
      // 设置编辑器设置
      const options = JSON.parse(editorConfig) as languages.typescript.CompilerOptions;
      languages.typescript.javascriptDefaults.setCompilerOptions({
        allowNonTsExtensions: true,
        ...options,
      });
      // 注册类型定义
      languages.typescript.javascriptDefaults.addExtraLib(typeDefinition, "scriptcat.d.ts");
    }
  );
}
