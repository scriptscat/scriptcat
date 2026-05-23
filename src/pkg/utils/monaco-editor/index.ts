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
  title: string;
  text: string;
};

type TextEdit = languages.IWorkspaceTextEdit["textEdit"];

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
const quickfixKind = "quickfix";
const noop = () => {};
const metaLinePattern = /\/\/[ \t]*@(\S+)[ \t]*(.*)$/;
const metadataFixPattern = /^(\s*\/\/[ \t]*@)(connect|match|include)([ \t]+)(\S+)(.*)$/i;
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

const createMetadataFix = (titleTemplate: string, titleValue: string, text: string): MetadataLineFix => {
  return {
    title: titleTemplate.replace("{0}", titleValue),
    text,
  };
};

const getIncludeSpacing = (spacing: string, tag: string) => {
  const lenDiff = "include".length - tag.length;
  return lenDiff > 0 && spacing.length > lenDiff ? spacing.slice(0, -lenDiff) : spacing;
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
  return [createMetadataFix(titleTemplate, hostName, `${prefix}${tag}${spacing}${hostName}${suffix}`)];
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
  return [
    createMetadataFix(titleTemplate, tldValue, `${prefix}include${includeSpacing}${tldValue}${suffix}`),
    createMetadataFix(titleTemplate, value, `${prefix}include${includeSpacing}${value}${suffix}`),
  ];
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
  if (wildcardNormalizedHost.split(".").every((hostSegment) => hostSegment === "*" || /^[\w-]+$/.test(hostSegment))) {
    const includeSpacing = getIncludeSpacing(spacing, normalizedTag);
    const titleTemplate = currentEditorLang.replaceIncludeWithMatch;
    return [createMetadataFix(titleTemplate, value, `${prefix}match  ${includeSpacing}${value}${suffix}`)];
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

  const diagnostics = markers.filter(
    (marker) => marker.source === scriptcatMarkerOwner && marker.startLineNumber === lineNumber
  );

  return metadataFixes.map((metadataFix, index) =>
    createLineReplacementAction(
      model,
      metadataFix.title,
      diagnostics,
      lineNumber,
      lineText,
      metadataFix.text,
      index === 0
    )
  );
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

const updateScriptcatMetadataMarkers = (model: editor.ITextModel) => {
  if (model.getLanguageId() !== "javascript") return;

  const markers: editor.IMarkerData[] = [];
  const lineCount = model.getLineCount();
  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const lineText = model.getLineContent(lineNumber);
    const metadataLineFixes = getMetadataLineFixes(lineText);
    if (metadataLineFixes.length === 0) continue;

    markers.push({
      severity: MarkerSeverity.Warning,
      message: metadataLineFixes[0].title,
      source: scriptcatMarkerOwner,
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: lineText.length + 1,
    });
  }

  editor.setModelMarkers(model, scriptcatMarkerOwner, markers);
};

const registerScriptcatMetadataMarkerProvider = () => {
  const registerMetadataModel = (model: editor.ITextModel) => {
    updateScriptcatMetadataMarkers(model);
    model.onDidChangeContent(() => {
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
