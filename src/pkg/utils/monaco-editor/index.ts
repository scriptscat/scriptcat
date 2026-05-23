import { systemConfig } from "@App/pages/store/global";
import EventEmitter from "eventemitter3";
import { editor, languages, MarkerSeverity, type IRange } from "monaco-editor";
import { findGlobalInsertionInfo, updateGlobalCommentLine } from "./utils";
import type { EditorLangCode, EditorPrompt } from "./langs";
import { asEditorLangEntry, editorLangs } from "./langs";
import { deferred } from "../utils";

interface ILinterWorker extends Worker {
  myLinterHook: EventEmitter<string, any>;
}

type EslintFix = {
  range: IRange;
  text: string;
};

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
const langPromise = systemConfig.getLanguage();

let multiLang = asEditorLangEntry("en-US");

const updateLang = (lang: string) => {
  lang = `${lang || ""}` as EditorLangCode | "";
  const key = ((Object.hasOwn(editorLangs, lang) && lang) || "en-US") as EditorLangCode;
  multiLang = asEditorLangEntry(key);
};

langPromise.then((res) => updateLang(res));

systemConfig.addListener("language", (lang) => {
  updateLang(lang);
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

let isRegisterEditorDone = false;

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

const getEslintFixKey = (marker: editor.IMarkerData, code: string) => {
  return `${code}|${marker.startLineNumber}|${marker.endLineNumber}|${marker.startColumn}|${marker.endColumn}`;
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
  line: string,
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
        endColumn: line.length + 1,
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

const parseMetadataLine = (line: string): MetadataLineParts | null => {
  const match = metadataFixPattern.exec(line);
  if (!match) return null;

  const [, prefix, tag, spacing, value, suffix] = match;
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

const getConnectMetadataFixes = ({ prefix, tag, spacing, value, suffix }: MetadataLineParts): MetadataLineFix[] => {
  if (!value.startsWith("*.") || value.includes("**")) return [];

  const hostName = value.slice(2);
  if (!/\.\w{2,}$/.test(hostName) || !isSimpleValidHost(hostName)) return [];

  const titleTemplate = multiLang.replaceConnectWildcard;
  return [createMetadataFix(titleTemplate, hostName, `${prefix}${tag}${spacing}${hostName}${suffix}`)];
};

const getMatchMetadataFixes = ({
  prefix,
  normalizedTag,
  spacing,
  value,
  suffix,
}: MetadataLineParts): MetadataLineFix[] => {
  const match = matchMetadataPattern.exec(value);
  const host = match?.[2];
  if (!match || !host?.endsWith(".*") || host.includes("**")) return [];

  const hostName = host.slice(0, -2);
  if (!isSimpleValidHost(hostName.replace(/\*/g, "x"))) return [];

  const includeSpacing = getIncludeSpacing(spacing, normalizedTag);
  const tldValue = `${match[1]}://${hostName}.tld${match[3] || ""}`;

  const titleTemplate = multiLang.replaceMatchWildcard;
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
  const match = matchMetadataPattern.exec(value);
  const host = match?.[2];
  if (!match || !host || host.endsWith(".*") || host.includes("**")) return [];
  if (host.split(".").every((e) => e === "*" || /^[\w-]+$/.test(e))) {
    const includeSpacing = getIncludeSpacing(spacing, normalizedTag);
    const titleTemplate = multiLang.replaceToMatch;
    return [createMetadataFix(titleTemplate, value, `${prefix}match  ${includeSpacing}${value}${suffix}`)];
  }
  return [];
};

const getMetadataLineFixes = (line: string): MetadataLineFix[] => {
  const parts = parseMetadataLine(line);
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
  line: string,
  markers: editor.IMarkerData[]
): languages.CodeAction[] => {
  const fixes = getMetadataLineFixes(line);
  if (fixes.length === 0) return [];

  const diagnostics = markers.filter(
    (marker) => marker.source === scriptcatMarkerOwner && marker.startLineNumber === lineNumber
  );

  return fixes.map((fix, index) =>
    createLineReplacementAction(model, fix.title, diagnostics, lineNumber, line, fix.text, index === 0)
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

  const oldLine = model.getLineContent(globalLine);
  return {
    range: {
      startLineNumber: globalLine,
      startColumn: 1,
      endLineNumber: globalLine,
      endColumn: oldLine.length + 1,
    },
    text: updateGlobalCommentLine(oldLine, globalName),
  };
};

const getMarkerCodeActions = (
  model: editor.ITextModel,
  marker: editor.IMarkerData,
  eslintFixMap?: Map<string, EslintFix>
): languages.CodeAction[] => {
  if (marker.source !== eslintMarkerOwner) return [];
  const code = getMarkerCode(marker);
  if (!code) return [];

  const actions: languages.CodeAction[] = [];

  const fix = eslintFixMap?.get(getEslintFixKey(marker, code));
  if (fix) {
    actions.push(
      createTextEditAction(
        model,
        multiLang.quickfix.replace("{0}", code),
        [marker],
        {
          range: fix.range,
          text: fix.text,
        },
        true
      )
    );
  }

  let canApplyEslintSingleLineDisable = true;

  switch (code) {
    case "no-undef": {
      const globalName = getNoUndefGlobalName(marker);
      if (globalName) {
        actions.push(
          createTextEditAction(
            model,
            multiLang.declareGlobal.replace("{0}", globalName),
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
      canApplyEslintSingleLineDisable = false;
  }

  if (canApplyEslintSingleLineDisable) {
    actions.push(
      createTextEditAction(
        model,
        multiLang.addEslintDisableNextLine,
        [marker],
        {
          range: {
            startLineNumber: marker.startLineNumber,
            endLineNumber: marker.startLineNumber,
            startColumn: 1,
            endColumn: 1,
          },
          text: `// eslint-disable-next-line ${code}\n`,
        },
        true
      )
    );
  }
  actions.push(
    createTextEditAction(
      model,
      multiLang.addEslintDisable,
      [marker],
      {
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        },
        text: `/* eslint-disable ${code} */\n`,
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
    const line = model.getLineContent(lineNumber);
    const metadataLineFixes = getMetadataLineFixes(line);
    if (metadataLineFixes.length === 0) continue;

    markers.push({
      severity: MarkerSeverity.Warning,
      message: metadataLineFixes[0].title,
      source: scriptcatMarkerOwner,
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: line.length + 1,
    });
  }

  editor.setModelMarkers(model, scriptcatMarkerOwner, markers);
};

const registerScriptcatMetadataMarkerProvider = () => {
  const registerModel = (model: editor.ITextModel) => {
    updateScriptcatMetadataMarkers(model);
    model.onDidChangeContent(() => {
      updateScriptcatMetadataMarkers(model);
    });
  };

  editor.getModels().forEach(registerModel);
  editor.onDidCreateModel(registerModel);
};

/**
 * 注册 monaco-editor 的全局环境与语言支援
 * 应该在应用启动早期执行一次（例如在 App 根组件 mount 时）
 */
export function registerEditor() {
  // 避免重复注册
  if (isRegisterEditorDone) return;
  isRegisterEditorDone = true;

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
      const line = model.getLineContent(position.lineNumber);
      const match = metaLinePattern.exec(line);

      if (match) {
        const key = match[1] as keyof EditorPrompt;
        return {
          contents: [
            {
              value: multiLang.prompt[key] || multiLang.undefinedPrompt,
              supportHtml: true,
            },
          ],
        };
      }

      if (/==UserScript==/.test(line)) {
        return { contents: [{ value: multiLang.thisIsAUserScript }] };
      }

      return null;
    },
  });

  languages.registerCodeActionProvider(
    "javascript",
    {
      provideCodeActions: (model /** ITextModel */, range /** Range */, context /** CodeActionContext */) => {
        const eslintFixMap = getMonacoEnvironment()?.eslintFixMap;
        const line = model.getLineContent(range.startLineNumber);
        const actions = [
          ...getMetadataLineActions(model, range.startLineNumber, line, context.markers),
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
