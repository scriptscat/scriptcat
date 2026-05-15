import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import { SCRIPT_TYPE_NORMAL, ScriptCodeDAO, ScriptDAO } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { editor, IDisposable } from "monaco-editor";
import { KeyCode, KeyMod } from "monaco-editor";
import { Button, Dropdown, Grid, Input, Menu, Message, Modal, Space, Tabs, Tooltip } from "@arco-design/web-react";
import TabPane from "@arco-design/web-react/es/Tabs/tab-pane";
import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { uuidv4 } from "@App/pkg/utils/uuid";
import "./index.css";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import ScriptStorage from "@App/pages/components/ScriptStorage";
import ScriptResource from "@App/pages/components/ScriptResource";
import ScriptSetting from "@App/pages/components/ScriptSetting";
import { runtimeClient, scriptClient } from "@App/pages/store/features/script";
import i18n, { i18nName } from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import { IconDelete, IconSearch } from "@arco-design/web-react/icon";
import { lazyScriptName } from "@App/pkg/config/config";
import { makeBlobURL } from "@App/pkg/utils/utils";
import { VscLayoutSidebarLeft, VscLayoutSidebarLeftOff } from "react-icons/vsc";
import type { TInstallScript, TDeleteScript, TEnableScript, TSortedScript } from "@App/app/service/queue";
import { subscribeMessage } from "@App/pages/store/global";
import { HookManager } from "@App/pkg/utils/hookManager";

const { Row, Col } = Grid;

type HotKey = {
  id: string;
  title: string;
  hotKey: number;
  action: (script: Script, codeEditor: editor.ICodeEditor) => void;
};

const Editor: React.FC<{
  id: string;
  getScript: (uuid: string) => Script | undefined;
  code: string;
  hotKeys: HotKey[];
  callbackEditor: (e: editor.ICodeEditor) => void;
  onChange: (code: string) => void;
  className: string;
}> = ({ id, getScript, code, hotKeys, callbackEditor, onChange, className }) => {
  const [node, setNode] = useState<{ editor: editor.IStandaloneCodeEditor }>();
  const ref = useCallback<(node: { editor: editor.IStandaloneCodeEditor }) => void>(
    (inlineNode) => {
      if (inlineNode && inlineNode.editor && !node) {
        setNode(inlineNode);
      }
    },
    [node]
  );
  // 用 ref 拿到最新的 hotKeys/onChange/callbackEditor，避免 stale closure
  // 同时让 effect 仅在 editor 实例变化时重跑（不会因父组件重渲染重复 addAction）
  const hotKeysRef = useRef(hotKeys);
  const onChangeRef = useRef(onChange);
  const callbackEditorRef = useRef(callbackEditor);
  hotKeysRef.current = hotKeys;
  onChangeRef.current = onChange;
  callbackEditorRef.current = callbackEditor;

  useEffect(() => {
    if (!node || !node.editor) {
      return;
    }
    // @ts-ignore
    if (!node.editor.uuid) {
      // @ts-ignore
      node.editor.uuid = id;
    }
    const disposables: IDisposable[] = [];
    hotKeysRef.current.forEach((item) => {
      disposables.push(
        node.editor.addAction({
          id: item.id,
          label: item.title,
          keybindings: [item.hotKey],
          run(editor) {
            const script = getScript(id);
            if (script) {
              item.action(script, editor);
            }
          },
        })
      );
    });
    disposables.push(
      node.editor.onDidChangeModelContent(() => {
        onChangeRef.current(node.editor.getValue() || "");
      })
    );
    callbackEditorRef.current(node.editor);
    // editor 实例本身由 CodeEditor 自身负责 dispose，这里仅清理本 effect 注册的 listener/action
    return () => {
      disposables.forEach((d) => d.dispose());
    };
  }, [node?.editor]);

  return <CodeEditor key={id} id={id} ref={ref} className={className} code={code} diffCode="" editable />;
};

const WarpEditor = React.memo(Editor, (prev, next) => {
  return prev.id === next.id;
});

type EditorMenu = {
  title: string;
  tooltip?: string;
  action?: (script: Script, e: editor.ICodeEditor) => void;
  items?: (
    | {
        id: string;
        title: string;
        tooltip?: string;
        hotKey?: number;
        hotKeyString?: string;
        action: (script: Script, e: editor.ICodeEditor) => void;
        divider?: never;
      }
    | { divider: true }
  )[];
};

const emptyScript = async (template: string, hotKeys: any, target?: string) => {
  let code = "";
  switch (template) {
    case "background":
      code = backgroundTpl;
      code = lazyScriptName(code);
      break;
    case "crontab":
      code = crontabTpl;
      code = lazyScriptName(code);
      break;
    default: {
      code = normalTpl;
      const [url, icon] =
        target === "initial"
          ? await new Promise<string[]>((resolve) => {
              chrome.storage.local.get(["activeTabUrl"], (result) => {
                const lastError = chrome.runtime.lastError;
                let retUrl = "https://*/*";
                let retIcon = "";
                if (lastError) {
                  console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
                  chrome.storage.local.remove(["activeTabUrl"]);
                } else {
                  chrome.storage.local.remove(["activeTabUrl"]);
                  const pageUrl = result?.activeTabUrl?.url;
                  if (pageUrl) {
                    try {
                      const { protocol, pathname, hostname } = new URL(pageUrl);
                      if (protocol && pathname && hostname) {
                        retUrl = `${protocol}//${hostname}${pathname}`;
                        if (protocol === "http:" || protocol === "https:") {
                          retIcon = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
                        }
                      }
                    } catch {
                      // do nothing
                    }
                  }
                }
                resolve([retUrl, retIcon]);
              });
            })
          : ["https://*/*", ""];
      code = lazyScriptName(code);
      if (icon) {
        code = code.replace("{{match}}", url);
        code = code.replace("{{icon}}", icon);
      } else {
        code = code.replace("{{match}}", url);
        code = code.replace(/[\r\n]*[^\r\n]*\{\{icon\}\}[^\r\n]*/, "");
      }
      break;
    }
  }
  const prepareScript = await prepareScriptByCode(code, "", uuidv4());
  const { script } = prepareScript;
  script.createtime = 0;

  return {
    script,
    code,
    active: true,
    hotKeys,
    isChanged: false,
  };
};

type visibleItem = "scriptStorage" | "scriptSetting" | "scriptResource";

const popstate: EventListener = (e: Event) => {
  if (!e.isTrusted) return;
  if (location.href.startsWith(chrome.runtime.getURL("/src/options.html#/script/editor"))) {
    return;
  }
  if (confirm(i18n.t("script_modified_leave_confirm"))) {
    window.history.back();
    window.removeEventListener("popstate", popstate);
  } else {
    window.history.pushState(null, "", window.location.href);
  }
  return false;
};

type EditorState = {
  script: Script;
  code: string;
  active: boolean;
  hotKeys: HotKey[];
  editor?: editor.ICodeEditor;
  isChanged: boolean;
};

const scriptDAO = new ScriptDAO();
const scriptCodeDAO = new ScriptCodeDAO();

function useScriptList() {
  const [selectedScript, setSelectSciptButtonAndTab] = useState<string>("");
  const [editors, setEditors] = useState<EditorState[]>([]);
  const [canLoadScript, setCanLoadScript] = useState<boolean>(false);
  const [scriptList, setScriptList] = useState<Script[]>([]);
  // 监听后台消息更新状态
  useEffect(() => {
    const pageApi = {
      async installScript(data: TInstallScript) {
        const latest = await scriptDAO.all();
        const latestMap = new Map(latest.map((script) => [script.uuid, script]));
        setScriptList((list) => {
          const newList: Script[] = [];
          for (const entry of list) {
            if (entry.uuid !== data.script.uuid) {
              const latestScript = latestMap.get(entry.uuid);
              if (latestScript) {
                newList.push({
                  ...entry,
                  sort: latestScript.sort,
                  name: latestScript.name,
                  updatetime: latestScript.updatetime,
                  status: latestScript.status,
                });
              }
            }
          }
          const installedScript = latestMap.get(data.script.uuid);
          if (installedScript) {
            newList.push(installedScript);
          }
          newList.sort((a, b) => a.sort - b.sort);
          return newList;
        });
      },
      deleteScripts(data: TDeleteScript[]) {
        const dels = new Set(data.map((script) => script.uuid));
        setEditors((prev) => {
          const newList: EditorState[] = [];
          for (const editor of prev) {
            if (!dels.has(editor.script.uuid)) {
              newList.push(editor);
            }
          }
          // 关键修复：确保关闭后仍有一个 Tab 是激活的
          if (newList.length > 0 && !newList.some((e) => e.active)) {
            newList[0] = { ...newList[0], active: true };
            setSelectSciptButtonAndTab(newList[0].script.uuid);
          }
          return newList;
        });
        setScriptList((list) => {
          return list.filter((script) => !dels.has(script.uuid));
        });
      },
      enableScripts(data: TEnableScript[]) {
        const enableMap = new Map(data.map((e) => [e.uuid, e.enable]));
        setScriptList((list) => {
          const newList: Script[] = [];
          for (const script of list) {
            const oldEnable = script.status !== SCRIPT_STATUS_DISABLE;
            const newEnable = enableMap.get(script.uuid);
            if (typeof newEnable === "boolean" && oldEnable !== newEnable) {
              newList.push({ ...script, status: newEnable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE });
            } else {
              newList.push(script);
            }
          }
          return newList;
        });
      },
      sortedScripts(sorting: TSortedScript[]) {
        const sortMap = new Map(sorting.map((s) => [s.uuid, s.sort]));
        setScriptList((list) => {
          const newList: Script[] = [];
          for (const entry of list) {
            const sort = sortMap.get(entry.uuid);
            if (sort! >= 0) {
              newList.push({ ...entry, sort: sort! });
            } else {
              newList.push(entry);
            }
          }
          newList.sort((a, b) => a.sort - b.sort);
          return newList;
        });
      },
    } as const;

    const hookMgr = new HookManager();
    hookMgr.append(
      subscribeMessage<TInstallScript>("installScript", pageApi.installScript),
      subscribeMessage<TDeleteScript[]>("deleteScripts", pageApi.deleteScripts),
      subscribeMessage<TEnableScript[]>("enableScripts", pageApi.enableScripts),
      subscribeMessage<TSortedScript[]>("sortedScripts", pageApi.sortedScripts)
    );
    return hookMgr.unhook;
  }, []);
  return {
    scriptList,
    setScriptList,
    canLoadScript,
    setCanLoadScript,
    editors,
    setEditors,
    selectedScript,
    setSelectSciptButtonAndTab,
  };
}

function ScriptEditor() {
  const [visible, setVisible] = useState<{ [key: string]: boolean }>({});
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [showSearchInput, setShowSearchInput] = useState<boolean>(false);
  const [modal, contextHolder] = Modal.useModal();
  const {
    scriptList,
    setScriptList,
    canLoadScript,
    setCanLoadScript,
    editors,
    setEditors,
    selectedScript,
    setSelectSciptButtonAndTab,
  } = useScriptList();
  const editorsRef = useRef<EditorState[]>(editors); // 取出资料用
  // Sync during render (no useEffect needed)
  editorsRef.current = editors;
  // The function identity is now permanent (empty dependency array)
  const getScript = useCallback((uuid: string) => {
    return editorsRef.current.find((e) => e.script.uuid === uuid)?.script;
  }, []);
  const editorFindIndex = (uuid: string) => {
    return editorsRef.current.findIndex((e) => e.script.uuid === uuid);
  };
  const editorFindItem = (uuid: string) => {
    return editorsRef.current.find((e) => e.script.uuid === uuid);
  };
  const delayedEditorFocus = (editor: editor.ICodeEditor | null | undefined, delayMs: number = 100) => {
    editor = !editor ? editorsRef.current.find((e) => e.active && e.script.uuid === selectedScript)?.editor : editor;
    if (editor) {
      setTimeout(editor.focus.bind(editor), delayMs);
    }
  };
  const getSelectedText = (editor: editor.ICodeEditor) => {
    const model = editor.getModel();
    if (!model) return "";

    const selections = editor.getSelections()?.filter((selection) => !selection.isEmpty()) || [];
    return selections.map((selection) => model.getValueInRange(selection)).join(model.getEOL());
  };
  const writeClipboardText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to execCommand fallback below.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) throw new Error("copy failed");
  };
  const copyEditorSelection = (editor: editor.ICodeEditor) => {
    const text = getSelectedText(editor);
    if (!text) return;
    writeClipboardText(text)
      .catch((err) => {
        LoggerCore.logger(Logger.E(err)).debug("copy editor selection error");
      })
      .finally(() => {
        editor.focus();
      });
  };
  const cutEditorSelection = (editor: editor.ICodeEditor) => {
    const text = getSelectedText(editor);
    const selections = editor.getSelections()?.filter((selection) => !selection.isEmpty()) || [];
    if (!text || !selections.length) return;
    writeClipboardText(text)
      .then(() => {
        editor.pushUndoStop();
        editor.executeEdits(
          "menu",
          selections.map((selection) => ({ range: selection, text: "" }))
        );
        editor.pushUndoStop();
      })
      .catch((err) => {
        LoggerCore.logger(Logger.E(err)).debug("cut editor selection error");
      })
      .finally(() => {
        editor.focus();
      });
  };
  const pasteEditorClipboard = (editor: editor.ICodeEditor) => {
    if (!navigator.clipboard?.readText) {
      editor.focus();
      editor.getAction("editor.action.clipboardPasteAction")?.run();
      return;
    }
    navigator.clipboard
      .readText()
      .then((text) => {
        if (!text) return;
        editor.focus();
        editor.trigger("keyboard", "paste", {
          text,
          pasteOnNewLine: false,
          multicursorText: null,
          mode: null,
        });
      })
      .catch((err) => {
        LoggerCore.logger(Logger.E(err)).debug("paste editor clipboard error");
        editor.focus();
        editor.getAction("editor.action.clipboardPasteAction")?.run();
      });
  };
  const triggerEditorCommand = (editor: editor.ICodeEditor, handlerId: string) => {
    editor.focus();
    editor.trigger("menu", handlerId, null);
    requestAnimationFrame(() => editor.focus());
  };
  const [currentScript, setCurrentScript] = useState<Script>();
  const [rightOperationTab, setRightOperationTab] = useState<{
    key: string;
    uuid: string;
    selectSciptButtonAndTab: string;
  }>();
  const cidRef = useRef<ReturnType<typeof setTimeout>>();
  const [hiddenScriptList, setHiddenScriptList] = useState<boolean>(() => {
    return localStorage.getItem("hiddenEditorScriptList") === "true";
  });

  const pageUrlParams = useParams();
  const [pageUrlSearchParams, _] = useSearchParams();

  const navigate = useNavigate();
  const { t } = useTranslation();

  // 封装：统一的打开/创建脚本逻辑 (Command Pattern)
  const openScript = useCallback(
    async (uuid?: string, template?: string, target?: string) => {
      const insertEditor = (e: EditorState) => {
        let insertIdx = editorFindIndex(selectedScript);
        insertIdx = insertIdx >= 0 ? insertIdx + 1 : editorsRef.current.length;
        setEditors((prev) => {
          const ret = prev.map((e) => ({ ...e, active: false }));
          ret.splice(insertIdx, 0, e);
          return ret;
        });
      };

      if (uuid) {
        // 如果已在编辑器中，直接激活
        const existIndex = editorFindIndex(uuid);
        if (existIndex !== -1) {
          setEditors((prev) => prev.map((e, i) => ({ ...e, active: i === existIndex })));
          setSelectSciptButtonAndTab(uuid);
          return;
        }

        // 如果不在，从数据库读取
        const script = scriptList.find((s) => s.uuid === uuid);
        if (script) {
          const code = await scriptCodeDAO.findByUUID(uuid);
          const newEditor: EditorState = {
            script,
            code: code?.code || "",
            active: true,
            hotKeys: hotKeys.current,
            isChanged: false,
          };
          insertEditor(newEditor);
          setSelectSciptButtonAndTab(uuid);
        } else {
          Message.error("Script Not Found");
        }
      } else {
        // 新建脚本
        const e = await emptyScript(template || "", hotKeys.current, target || "blank");
        insertEditor(e);
        setSelectSciptButtonAndTab(e.script.uuid);
      }
    },
    [scriptList, selectedScript]
  );

  const setShow = (key: visibleItem, show: boolean) => {
    for (const k of Object.keys(visible)) {
      visible[k] = false;
    }
    visible[key] = show;
    setVisible({ ...visible });
  };

  const save = (existingScript: Script, e: editor.ICodeEditor): Promise<Script> => {
    // 解析code生成新的script并更新
    const code = e.getValue();
    const targetUUID = existingScript.uuid;
    return prepareScriptByCode(code, existingScript.origin || "", targetUUID, false, scriptDAO, { byEditor: true })
      .then(async (prepareScript) => {
        const { script, oldScript } = prepareScript;
        // 新增/更改名字时，有相同名字的脚本的话，提醒一下是否真的储存
        if (
          (!oldScript || oldScript.name !== script.name || oldScript.namespace !== script.namespace) &&
          script.name &&
          script.namespace
        ) {
          const searchResult = await scriptDAO.findByNameAndNamespace(script.name, script.namespace);
          if (searchResult && searchResult.uuid !== targetUUID) {
            const modalResult = await new Promise((resolve) => {
              modal.confirm!({
                focusLock: false,
                simple: false,
                closable: true,
                title: t("scriptname_conflict"),
                content: t("confirm_save_when_scriptname_conflict"),
                onOk: () => {
                  resolve("yes");
                },
                onCancel: () => {
                  resolve("no");
                },
              });
            });
            setTimeout(e.focus.bind(e), 50);
            if (modalResult === "no") {
              Message.warning(t("save_abort_when_scriptname_conflict"));
              // 用户主动取消，非错误
              return Promise.reject(new Error("SAVE_CANCELED"));
            }
          }
        }
        if (targetUUID) {
          if (existingScript.createtime !== 0) {
            if (!oldScript || oldScript.uuid !== targetUUID) {
              Message.warning("The editing script does not exist.");
              return Promise.reject(new Error("The editing script does not exist."));
            }
          }
          existingScript.createtime = Date.now();
          script.createtime = existingScript.createtime;
        }
        if (!script.name) {
          Message.warning(t("script_name_cannot_be_set_to_empty"));
          return Promise.reject(new Error("script name cannot be empty"));
        }
        const currentEditorUpdateTime = existingScript.updatetime;
        const latestUpdateTime = oldScript?.updatetime ?? 0;

        if (
          currentEditorUpdateTime !== latestUpdateTime &&
          latestUpdateTime > 0 &&
          script.uuid === existingScript.uuid &&
          script.uuid === oldScript?.uuid
        ) {
          const modalResult = await new Promise((resolve) => {
            modal.confirm!({
              focusLock: false,
              simple: false,
              closable: true,
              title: t("edit_conflict"),
              content: t("confirm_override_when_edit_conflict"),
              onOk: () => {
                resolve("yes");
              },
              onCancel: () => {
                resolve("no");
              },
            });
          });
          setTimeout(e.focus.bind(e), 50);
          if (modalResult === "no") {
            Message.warning(t("save_abort_when_edit_conflict"));
            // 用户主动取消，非错误
            return Promise.reject(new Error("SAVE_CANCELED"));
          }
        }

        if (script.ignoreVersion) script.ignoreVersion = "";
        return scriptClient
          .install({ script, code })
          .then((result): Script => {
            if (!result.update) {
              Message.success(t("create_success_note"));
              // 保存的时候如何左侧没有脚本即新建
              setScriptList((prev) => {
                setSelectSciptButtonAndTab(script.uuid);
                return [script, ...prev];
              });
            } else {
              const uuid = script.uuid;
              const name = script.name;
              setScriptList((prev) =>
                prev.map((script: Script) =>
                  script.uuid === uuid
                    ? {
                        ...script,
                        name,
                        updatetime: result.updatetime || script.updatetime,
                      }
                    : script
                )
              );
              Message.success(t("save_success"));
            }
            const uuid = script.uuid;
            const name = script.name;
            setEditors((prev) =>
              prev.map((item) =>
                item.script.uuid === uuid
                  ? {
                      ...item,
                      code: code,
                      isChanged: false,
                      script: {
                        ...item.script,
                        name,
                        updatetime: result.updatetime || item.script.updatetime,
                      },
                    }
                  : item
              )
            );
            return script;
          })
          .catch((err: any) => {
            // 用户主动取消保存，不再弹出错误提示
            if (err instanceof Error && err.message === "SAVE_CANCELED") {
              return Promise.reject(err);
            }
            Message.error(`${t("save_failed")}: ${err}`);
            return Promise.reject(err);
          });
      })
      .catch((err) => {
        // 用户主动取消保存，不再弹出错误提示
        if (err instanceof Error && err.message === "SAVE_CANCELED") {
          return Promise.reject(err);
        }
        Message.error(`${t("invalid_script_code")}: ${err}`);
        return Promise.reject(err);
      });
  };

  const saveAs = (script: Script, e: editor.ICodeEditor) => {
    return new Promise<void>((resolve) => {
      chrome.downloads.download(
        {
          url: makeBlobURL({
            blob: new Blob([e.getValue()], { type: "text/javascript" }),
            persistence: false,
          }) as string,
          saveAs: true, // true直接弹出对话框；false弹出下载选项
          filename: `${script.name}.user.js`,
        },
        () => {
          /*
            chrome扩展api发生错误无法通过try/catch捕获，必须在api回调函数中访问chrome.runtime.lastError进行获取
            var chrome.runtime.lastError: chrome.runtime.LastError | undefined
            This will be defined during an API method callback if there was an error
          */
          if (chrome.runtime.lastError) {
            console.log(t("save_as_failed") + ": ", chrome.runtime.lastError);
            Message.error(`${t("save_as_failed")}: ${chrome.runtime.lastError.message}`);
          } else {
            Message.success(t("save_as_success"));
          }
          resolve();
        }
      );
    });
  };
  const menu: EditorMenu[] = [
    {
      title: t("file"),
      items: [
        {
          id: "save",
          title: t("save"),
          hotKey: KeyMod.CtrlCmd | KeyCode.KeyS,
          hotKeyString: "Ctrl+S",
          action: save,
        },
        {
          id: "saveAs",
          title: t("save_as"),
          hotKey: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
          hotKeyString: "Ctrl+Shift+S",
          action: saveAs,
        },
      ],
    },
    {
      title: t("edit"),
      items: [
        {
          id: "undo",
          title: t("undo"),
          hotKeyString: "Ctrl+Z",
          action(_script, e) {
            triggerEditorCommand(e, "undo");
          },
        },
        {
          id: "redo",
          title: t("redo"),
          hotKeyString: "Ctrl+Shift+Z",
          action(_script, e) {
            triggerEditorCommand(e, "redo");
          },
        },
        { divider: true },
        {
          id: "cut",
          title: t("cut"),
          hotKeyString: "Ctrl+X",
          action(_script, e) {
            cutEditorSelection(e);
          },
        },
        {
          id: "copy",
          title: t("copy"),
          hotKeyString: "Ctrl+C",
          action(_script, e) {
            copyEditorSelection(e);
          },
        },
        {
          id: "paste",
          title: t("paste"),
          hotKeyString: "Ctrl+V",
          action(_script, e) {
            pasteEditorClipboard(e);
          },
        },
        { divider: true },
        {
          id: "find",
          title: t("find"),
          hotKey: KeyMod.CtrlCmd | KeyCode.KeyF,
          hotKeyString: "Ctrl+F",
          action(_script, e) {
            e.getAction("actions.find")?.run();
          },
        },
        {
          id: "replace",
          title: t("replace"),
          hotKey: KeyMod.CtrlCmd | KeyCode.KeyH,
          hotKeyString: "Ctrl+H",
          action(_script, e) {
            e.getAction("editor.action.startFindReplaceAction")?.run();
          },
        },
        {
          id: "selectAll",
          title: t("select_all"),
          hotKeyString: "Ctrl+A",
          action(_script, e) {
            e.trigger("menu", "editor.action.selectAll", null);
          },
        },
        { divider: true },
        {
          id: "format",
          title: t("format"),
          hotKey: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
          hotKeyString: "Ctrl+Shift+F",
          action(_script, e) {
            const selection = e.getSelection();
            const actionId =
              selection && !selection.isEmpty() ? "editor.action.formatSelection" : "editor.action.formatDocument";
            e.getAction(actionId)?.run();
          },
        },
      ],
    },
    {
      title: t("run"),
      items: [
        {
          id: "run",
          title: t("run"),
          hotKey: KeyMod.CtrlCmd | KeyCode.F5,
          hotKeyString: "Ctrl+F5",
          tooltip: t("only_background_scheduled_can_run"),
          action: async (script, e) => {
            // 保存更新代码之后再调试
            const newScript = await save(script, e);
            // 判断脚本类型
            if (newScript.type === SCRIPT_TYPE_NORMAL) {
              Message.error(t("only_background_scheduled_can_run"));
              return;
            }
            Message.loading({
              id: "debug_script",
              content: t("preparing_script_resources"),
              duration: 3000,
            });
            runtimeClient
              .runScript(newScript.uuid)
              .then(() => {
                Message.success({
                  id: "debug_script",
                  content: t("build_success_message"),
                  duration: 3000,
                });
              })
              .catch((err) => {
                LoggerCore.logger(Logger.E(err)).debug("run script error");
                Message.error({
                  id: "debug_script",
                  content: `${t("build_failed")}: ${err}`,
                  duration: 3000,
                });
              });
          },
        },
      ],
    },
    {
      title: t("tools"),
      items: [
        {
          id: "scriptStorage",
          title: t("script_storage"),
          tooltip: t("script_storage_tooltip"),
          action(script) {
            setShow("scriptStorage", true);
            setCurrentScript(script);
          },
        },
        {
          id: "scriptResource",
          title: t("script_resource"),
          tooltip: t("script_resource_tooltip"),
          action(script) {
            setShow("scriptResource", true);
            setCurrentScript(script);
          },
        },
      ],
    },
    {
      title: t("settings"),
      tooltip: t("script_setting_tooltip"),
      action(script) {
        setShow("scriptSetting", true);
        setCurrentScript(script);
      },
    },
  ];

  // 根据菜单生产快捷键
  const hotKeys = useRef<HotKey[]>([]);
  hotKeys.current = [];
  menu.forEach((item) => {
    item.items?.forEach((menuItem) => {
      if (!menuItem.divider && menuItem.hotKey) {
        hotKeys.current.push({
          id: menuItem.id,
          title: menuItem.title,
          hotKey: menuItem.hotKey,
          action: menuItem.action,
        });
      }
    });
  });

  const templateVal = useRef(pageUrlSearchParams.get("template"));
  const targetVal = useRef(pageUrlSearchParams.get("target"));

  // 初始化 & 网址改变
  useEffect(() => {
    const template = pageUrlSearchParams.get("template");
    const target = pageUrlSearchParams.get("target");
    if (template) templateVal.current = template;
    if (target) targetVal.current = target;

    if (canLoadScript) {
      const uuid = pageUrlParams.uuid;
      if (uuid === selectedScript) return;
      if (!uuid || editorFindItem(uuid) || scriptList.find((v) => v.uuid === uuid)) {
        const template = templateVal.current;
        const target = targetVal.current;
        openScript(uuid || undefined, template || undefined, target || undefined);
      } else {
        if (!selectedScript) {
          // e.g. F5 reload the script editor page with an unsaved template script.
          openScript(undefined, template || undefined, target || undefined);
        } else {
          Message.error("Invalid UUID");
        }
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoadScript, pageUrlSearchParams, pageUrlParams.uuid, navigate]);

  const updateScriptList = () => {
    return scriptDAO.all().then((scripts) => {
      setScriptList(scripts.sort((a, b) => a.sort - b.sort));
      setCanLoadScript(true);
    });
  };

  // 页面初次挂载：获取脚本列表
  useEffect(() => {
    updateScriptList();
    // 离开ScriptEditor时恢复标题
    return () => {
      document.title = "Home - ScriptCat";
    };
  }, []);

  // 控制onbeforeunload
  useEffect(() => {
    let flag = false;

    for (let i = 0; i < editors.length; i += 1) {
      if (editors[i].isChanged) {
        flag = true;
        break;
      }
    }

    if (flag) {
      const beforeunload = () => {
        return true;
      };
      window.onbeforeunload = beforeunload;
      window.history.pushState(null, "", window.location.href);
      window.addEventListener("popstate", popstate);
    } else {
      window.removeEventListener("popstate", popstate);
    }

    return () => {
      window.onbeforeunload = null;
    };
  }, [editors]);

  // 对tab点击右键进行的操作
  // 1 关闭当前, 2关闭其它, 3关闭左侧, 4关闭右侧
  useEffect(() => {
    if (!rightOperationTab) return;

    setEditors((prev) => {
      const idx = editorFindIndex(rightOperationTab.uuid);
      if (idx === -1) return prev;

      let newList = [...prev];
      switch (rightOperationTab.key) {
        case "1":
          newList = newList.filter((e) => e.script.uuid !== rightOperationTab.uuid);
          break;
        case "2":
          newList = newList.filter((e) => e.script.uuid === rightOperationTab.uuid);
          break;
        case "3":
          newList = newList.slice(idx);
          break;
        case "4":
          newList = newList.slice(0, idx + 1);
          break;
      }

      // 关键修复：确保关闭后仍有一个 Tab 是激活的
      if (newList.length > 0 && !newList.some((e) => e.active)) {
        newList[0] = { ...newList[0], active: true };
        setSelectSciptButtonAndTab(newList[0].script.uuid);
      }
      return newList;
    });
    setRightOperationTab(undefined); // 处理完清空，防止重复触发
  }, [rightOperationTab]);

  // 通用的编辑器删除处理函数
  const handleDeleteEditor = async (targetUuid: string, needConfirm: boolean = false) => {
    const editors = editorsRef.current;
    const targetIndex = editorFindIndex(targetUuid);
    if (targetIndex === -1) return;
    const targetEditor = editors[targetIndex];

    // 如果需要确认且脚本已修改
    if (needConfirm && targetEditor.isChanged) {
      if (!confirm(t("script_modified_close_confirm"))) return;
    }

    // 如果只剩一个编辑器，打开空白脚本
    if (editors.length === 1) {
      const template = templateVal.current || "";
      const e = await emptyScript(template || "", hotKeys.current, "blank");
      setEditors([e]);
      setSelectSciptButtonAndTab(e.script.uuid);
      return;
    }

    setEditors((prev) => {
      // 在回调中重新计算 index，避免 confirm/await 期间状态变化导致的竞态问题
      const currentIndex = prev.findIndex((e) => e.script.uuid === targetUuid);
      if (currentIndex === -1) return prev;
      const currentEditor = prev[currentIndex];
      // 删除目标编辑器
      const filtered = prev.filter((e) => e.script.uuid !== targetUuid);
      // 如果删除的是当前激活的编辑器，需要激活其他编辑器
      if (currentEditor.active && filtered.length > 0) {
        // 如果删除的是最后一个，激活前一个
        // 否则激活下一个（原来的下一个现在在同样的位置）
        const nextActiveIndex = currentIndex >= filtered.length ? filtered.length - 1 : currentIndex;
        filtered[nextActiveIndex] = { ...filtered[nextActiveIndex], active: true };
        setSelectSciptButtonAndTab(filtered[nextActiveIndex].script.uuid);
      }
      return filtered;
    });
  };

  // 处理编辑器激活状态变化时的focus
  useEffect(() => {
    if (!selectedScript) return;
    if (pageUrlParams.uuid !== selectedScript) {
      navigate(`/script/editor/${selectedScript}`, { replace: true });
    }
    delayedEditorFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScript]); // 只在activeTab变化时执行

  const handleEditorChange = (uuid: string, newCode: string) => {
    const targetEditor = editorFindItem(uuid);
    if (!targetEditor) return;
    const isChanged = targetEditor.code !== newCode;
    if (targetEditor.isChanged === isChanged) return;
    setEditors((prev) => prev.map((e) => (e.script.uuid !== uuid ? e : { ...e, isChanged: isChanged })));
  };

  const filteredScriptList = useMemo(() => {
    return scriptList.filter((script) => {
      if (!searchKeyword) return true;
      return i18nName(script).toLowerCase().includes(searchKeyword.toLowerCase());
    });
  }, [scriptList, searchKeyword]);

  return (
    <div
      className="tw-h-full tw-flex tw-flex-col"
      style={{
        position: "relative",
        left: -10,
        top: -10,
        width: "calc(100% + 20px)",
        height: "calc(100% + 20px)",
      }}
    >
      {contextHolder}
      {currentScript && (
        <>
          <ScriptStorage
            visible={visible.scriptStorage}
            script={currentScript}
            onOk={() => {
              setShow("scriptStorage", false);
            }}
            onCancel={() => {
              setShow("scriptStorage", false);
            }}
          />
          <ScriptResource
            visible={visible.scriptResource}
            script={currentScript}
            onOk={() => {
              setShow("scriptResource", false);
            }}
            onCancel={() => {
              setShow("scriptResource", false);
            }}
          />
          <ScriptSetting
            visible={visible.scriptSetting}
            script={currentScript}
            onOk={() => {
              setShow("scriptSetting", false);
            }}
            onCancel={() => {
              setShow("scriptSetting", false);
            }}
          />
        </>
      )}
      <div
        className="tw-h-6"
        style={{
          borderBottom: "1px solid var(--color-neutral-3)",
          background: "var(--color-secondary)",
        }}
      >
        <div className="tw-flex tw-flex-row">
          {menu.map((item, index) => {
            if (!item.items) {
              // 没有子菜单
              return (
                <Button
                  key={`m_${item.title}`}
                  size="mini"
                  onClick={() => {
                    setEditors((prev) => {
                      prev.forEach((e) => {
                        if (e.active) {
                          item.action && item.action(e.script, e.editor!);
                        }
                      });
                      return prev;
                    });
                  }}
                >
                  {item.title}
                </Button>
              );
            }
            return (
              <Dropdown
                key={`d_${index}`}
                droplist={
                  <Menu
                    style={{
                      padding: "0",
                      margin: "0",
                      borderRadius: "0",
                      maxHeight: "none",
                      overflow: "visible",
                    }}
                  >
                    {item.items.map((menuItem, i) => {
                      if (menuItem.divider) {
                        return (
                          <div key={`divider_${i}`} style={{ padding: "4px 0", background: "var(--color-secondary)" }}>
                            <div style={{ height: "1px", backgroundColor: "var(--color-neutral-4)" }} />
                          </div>
                        );
                      }
                      const btn = (
                        <Button
                          style={{
                            width: "100%",
                            textAlign: "left",
                            alignSelf: "center",
                            verticalAlign: "middle",
                          }}
                          key={`sm_${menuItem.title}`}
                          size="mini"
                          onClick={() => {
                            setEditors((prev) => {
                              prev.forEach((e) => {
                                if (e.active) {
                                  menuItem.action(e.script, e.editor!);
                                }
                              });
                              return prev;
                            });
                          }}
                        >
                          <div
                            style={{
                              minWidth: "70px",
                              float: "left",
                              fontSize: "14px",
                            }}
                          >
                            {menuItem.title}
                          </div>
                          <div
                            style={{
                              minWidth: "50px",
                              float: "left",
                              color: "rgb(165 165 165)",
                              fontSize: "12px",
                              lineHeight: "22px", // 不知道除此以外怎么垂直居中
                            }}
                          >
                            {menuItem.hotKeyString}
                          </div>
                        </Button>
                      );
                      return (
                        <Menu.Item
                          key={`m_${i}`}
                          style={{
                            height: "unset",
                            padding: "0",
                            lineHeight: "unset",
                          }}
                        >
                          {menuItem.tooltip ? (
                            <Tooltip key={`m${i}`} position="right" content={menuItem.tooltip}>
                              {btn}
                            </Tooltip>
                          ) : (
                            btn
                          )}
                        </Menu.Item>
                      );
                    })}
                  </Menu>
                }
                trigger="click"
                position="bl"
              >
                <Button key={`m_${item.title}`} size="mini">
                  {item.title}
                </Button>
              </Dropdown>
            );
          })}
        </div>
      </div>
      <Row
        className="tw-flex tw-flex-grow tw-flex-1"
        style={{
          overflow: "hidden",
        }}
      >
        {!hiddenScriptList && (
          <Col
            span={4}
            className="tw-h-full"
            style={{
              overflowY: "scroll",
            }}
          >
            <div
              className="tw-flex tw-flex-col"
              style={{
                backgroundColor: "var(--color-secondary)",
                overflow: "hidden",
              }}
            >
              <Button
                className="tw-text-left"
                size="mini"
                style={{
                  color: "var(--color-text-2)",
                  background: "transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(127, 127, 127, 0.8)",
                }}
                onClick={() => {
                  setShowSearchInput(!showSearchInput);
                }}
              >
                <div className="tw-flex tw-justify-between tw-items-center">
                  {t("installed_scripts")}
                  <IconSearch
                    style={{
                      cursor: "inherit",
                    }}
                  />
                </div>
              </Button>
              {showSearchInput && (
                <div className="tw-p-2">
                  <Input
                    placeholder={t("search_scripts")}
                    allowClear
                    autoFocus
                    defaultValue={searchKeyword}
                    onChange={(value) => setSearchKeyword(value)}
                    size="mini"
                    id="editor_search_scripts_input"
                  />
                </div>
              )}
              {filteredScriptList.map((script) => {
                const editor = editorFindItem(script.uuid);
                const alpha = script.status === SCRIPT_STATUS_DISABLE ? 0.66 : 1.0;
                return (
                  <div key={`s_${script.uuid}`} className="tw-relative tw-group">
                    <Button
                      size="mini"
                      className="tw-text-left tw-w-full"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: !editor
                          ? "var(--color-text-3)"
                          : editor.isChanged
                            ? "rgb(var(--warning-6))"
                            : "var(--color-text-2)",
                        backgroundColor:
                          selectedScript === script.uuid
                            ? "var(--editor-bg-selected)"
                            : editor
                              ? "var(--editor-bg-open)"
                              : "var(--editor-bg-default)",
                        paddingRight: "32px", // 为删除按钮留出空间
                      }}
                      onClick={() => {
                        openScript(script.uuid);
                      }}
                    >
                      <span
                        className="tw-overflow-hidden tw-text-ellipsis"
                        style={{
                          opacity: alpha,
                        }}
                      >
                        {i18nName(script)}
                      </span>
                    </Button>
                    {/* 删除按钮，只在鼠标悬停时显示 */}
                    <Button
                      type="text"
                      icon={<IconDelete />}
                      iconOnly
                      size="mini"
                      className="tw-absolute tw-right-1 tw-top-1/2 tw-transform -tw-translate-y-1/2 tw-opacity-0 group-hover:tw-opacity-100 tw-transition-opacity tw-duration-200"
                      style={{
                        width: "20px",
                        height: "20px",
                        minWidth: "20px",
                        border: "none",
                        background: "transparent",
                        color: "var(--color-text-3)",
                        boxShadow: "none",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // 删除脚本
                        modal.confirm!({
                          title: t("confirm_delete_script"),
                          content: t("confirm_delete_script_content", { name: i18nName(script) }),
                          focusLock: false,
                          simple: false,
                          closable: true,
                          onOk: () => {
                            scriptClient
                              .deletes([script.uuid])
                              .then(() => {
                                setScriptList((prev) => prev.filter((s) => s.uuid !== script.uuid));
                                handleDeleteEditor(script.uuid);
                                if (selectedScript === script.uuid) {
                                  setSelectSciptButtonAndTab("");
                                }
                                Message.success(t("delete_success"));
                              })
                              .catch((err) => {
                                LoggerCore.logger(Logger.E(err)).debug("delete script error");
                                Message.error(`${t("delete_failed")}: ${err}`);
                              });
                          },
                          onCancel: () => {
                            delayedEditorFocus(null);
                          },
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Col>
        )}
        <Col span={hiddenScriptList ? 24 : 20} className="tw-flex! tw-flex-col tw-h-full">
          <div className="tw-flex tw-flex-row tw-w-full tw-justify-between">
            <Tabs
              editable
              activeTab={selectedScript}
              className="edit-tabs"
              type="card-gutter"
              style={{
                overflow: "hidden",
              }}
              onChange={(uuid) => {
                // rightTabOperation 时会发生多次 onChange
                // 只取最后一个
                clearTimeout(cidRef.current);
                cidRef.current = setTimeout(() => {
                  if (editorFindIndex(uuid) >= 0) {
                    openScript(uuid);
                  }
                }, 1);
              }}
              onAddTab={() => openScript(undefined, templateVal.current || undefined, undefined)} // 不传参数即为新建
              onDeleteTab={(uuid) => {
                handleDeleteEditor(uuid, true);
              }}
            >
              {editors.map((e, _index) => (
                <TabPane
                  destroyOnHide
                  key={e.script.uuid}
                  title={
                    <Dropdown
                      trigger="contextMenu"
                      position="bl"
                      droplist={
                        <Menu
                          onClickMenuItem={(key) => {
                            setRightOperationTab({
                              ...rightOperationTab,
                              key,
                              uuid: e.script.uuid,
                              selectSciptButtonAndTab: selectedScript,
                            });
                          }}
                        >
                          <Menu.Item key="1">{t("close_current_tab")}</Menu.Item>
                          <Menu.Item key="2">{t("close_other_tabs")}</Menu.Item>
                          <Menu.Item key="3">{t("close_left_tabs")}</Menu.Item>
                          <Menu.Item key="4">{t("close_right_tabs")}</Menu.Item>
                        </Menu>
                      }
                    >
                      <span
                        style={{
                          color: e.isChanged
                            ? "rgb(var(--orange-5))"
                            : e.script.uuid === selectedScript
                              ? "rgb(var(--green-7))"
                              : e.active
                                ? "rgb(var(--green-7))"
                                : "var(--color-text-1)",
                        }}
                      >
                        {e.script.name}
                      </span>
                    </Dropdown>
                  }
                />
              ))}
            </Tabs>
            <Space>
              <Tooltip
                content={hiddenScriptList ? t("editor.show_script_list") : t("editor.hide_script_list")}
                position="bottom"
              >
                <Button
                  iconOnly
                  type="text"
                  size="small"
                  style={{
                    color: "var(--color-text-2)",
                  }}
                  icon={!hiddenScriptList ? <VscLayoutSidebarLeft /> : <VscLayoutSidebarLeftOff />}
                  onClick={() => {
                    const newValue = !hiddenScriptList;
                    localStorage.setItem("hiddenEditorScriptList", String(newValue));
                    setHiddenScriptList(newValue);
                  }}
                />
              </Tooltip>
            </Space>
          </div>
          <div className="tw-flex tw-flex-grow tw-flex-1 tw-relative">
            {editors.map((item) => {
              if (item.active) {
                document.title = `${i18nName(item.script)} - Script Editor`;
              }
              return (
                <div
                  className="tw-w-full tw-absolute sc-inset-0"
                  key={`fe_${item.script.uuid}`}
                  style={{
                    display: item.active ? "block" : "none",
                  }}
                >
                  <WarpEditor
                    className="script-code-editor"
                    key={`e_${item.script.uuid}`}
                    id={`${item.script.uuid}`}
                    getScript={getScript}
                    code={item.code}
                    hotKeys={item.hotKeys}
                    callbackEditor={(e) => {
                      setEditors((prev) =>
                        prev.map((v) =>
                          v.script.uuid === item.script.uuid
                            ? {
                                ...v,
                                editor: e,
                              }
                            : v
                        )
                      );
                      delayedEditorFocus(e); // 编辑器实例创建后立即聚焦一次
                    }}
                    onChange={(code) => handleEditorChange(item.script.uuid, code)}
                  />
                </div>
              );
            })}
          </div>
        </Col>
      </Row>
    </div>
  );
}

export default ScriptEditor;
