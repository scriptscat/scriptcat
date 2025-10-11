/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-empty */
// ================================
// File: src/pages/ScriptEditor.tsx
// ================================
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_TYPE_NORMAL, ScriptCodeDAO, ScriptDAO } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { editor } from "monaco-editor";
import { KeyCode, KeyMod } from "monaco-editor";
import {
  Button,
  Dropdown,
  Grid,
  Input,
  Menu,
  Message,
  Modal,
  ModalHookReturnType,
  Tabs,
  Tooltip,
} from "@arco-design/web-react";
import TabPane from "@arco-design/web-react/es/Tabs/tab-pane";
import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { v4 as uuidv4 } from "uuid";
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
import {
  IconClose,
  IconDelete,
  IconList,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShrink,
} from "@arco-design/web-react/icon";
import { lazyScriptName } from "@App/pkg/config/config";
import { systemConfig } from "@App/pages/store/global";
import { wScript } from "./shared";
import { ScriptEditorScriptList } from "./ScriptEditorScriptList";

const { Row, Col } = Grid;

/** Props the core needs (no router hooks here) */
export type ScriptEditorCoreProps = {
  uuid?: string;
  template?: "" | "background" | "crontab";
  target?: "blank" | "initial";
  overlayMode?: boolean;
  onUrlChange?: (params: {
    uuid?: string;
    template?: "" | "background" | "crontab";
    target?: "blank" | "initial";
  }) => void;
};

export type HotKey = {
  id: string;
  title: string;
  hotKey: number;
  action: (script: Script, codeEditor: editor.IStandaloneCodeEditor) => void;
};

export type ScriptEditorScriptListProps = {
  showSearchInput: boolean;
  setShowSearchInput: React.Dispatch<React.SetStateAction<boolean>>;
  searchKeyword: string;
  setSearchKeyword: React.Dispatch<React.SetStateAction<string>>;
  scriptList: Script[];
  selectSciptButtonAndTab: string;
  setSelectSciptButtonAndTab: React.Dispatch<React.SetStateAction<string>>;
  modelMapRef: React.MutableRefObject<Map<string, editor.ITextModel>>;
  switchToUuid: (uuid: string) => void;
  scriptCodeDAO: ScriptCodeDAO;
  setEditors: React.Dispatch<
    React.SetStateAction<
      {
        script: Script;
        code: string;
        hotKeys: HotKey[];
        isChanged: boolean;
      }[]
    >
  >;
  hotKeys: HotKey[];
  setScriptList: React.Dispatch<React.SetStateAction<Script[]>>;
  handleDeleteEditor: (targetUuid: string, needConfirm?: boolean) => void;
  modalConfirm: (config: any) => void;
};

const WrappedCodeEditor = React.memo(CodeEditor, (prev, next) => prev.uuid === next.uuid);
WrappedCodeEditor.displayName = "WrappedCodeEditor";

const cfgEditorWithScriptList = systemConfig.config<boolean>("editor_with_script_list", true);

// --- 單一 Monaco Editor，多個 Model（每個分頁一個 Model，擁有獨立的 Undo 記錄）---
// 我們保留一個 editor 實例（由 CodeEditor 控制），並為每個分頁建立/保存 model。

function ScriptEditor({ uuid, template, target = "blank", overlayMode = false, onUrlChange }: ScriptEditorCoreProps) {
  const [visible, setVisible] = useState<{ [key: string]: boolean }>({});
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [showSearchInput, setShowSearchInput] = useState<boolean>(false);
  const [modal, contextHolder] = Modal.useModal();

  // 編輯器分頁資料（script 與其初始 code）
  const [editors, setEditors] = useState<
    {
      script: Script;
      code: string; // 初始載入的 code，用於判斷 isChanged
      hotKeys: HotKey[];
      isChanged: boolean;
    }[]
  >([]);
  const [scriptList, setScriptList] = useState<Script[]>([]);
  const [currentScript, setCurrentScript] = useState<Script>();
  const [selectSciptButtonAndTab, setSelectSciptButtonAndTab] = useState<string>("");
  const [rightOperationTab, setRightOperationTab] = useState<{
    key: string;
    uuid: string;
    selectSciptButtonAndTab: string;
  }>();
  const [pageInit, setPageInit] = useState<boolean>(false);
  const [canLoadScript, setCanLoadScript] = useState<boolean>(false);
  const [hiddenScriptList, setHiddenScriptList] = useState<boolean | null>(() => {
    const isPromise = cfgEditorWithScriptList.promise?.then(() => {
      setHiddenScriptList(cfgEditorWithScriptList.value ? false : true);
    });
    return isPromise ? null : cfgEditorWithScriptList.value ? false : true;
  });

  // 目前活躍的分頁（以 uuid 指定）
  const [activeUuid, setActiveUuid] = useState<string>("");

  // 單一 Monaco Editor 實例引用
  const monacoEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // 每個分頁對應一個 model；切換分頁只切換 model
  const modelMapRef = useRef<Map<string, editor.ITextModel>>(new Map());

  const { t } = useTranslation();
  const scriptDAO = useMemo(() => new ScriptDAO(), []);
  const scriptCodeDAO = useMemo(() => new ScriptCodeDAO(), []);

  const setShow = useCallback((key: "scriptStorage" | "scriptSetting" | "scriptResource", show: boolean) => {
    setVisible((prev) => {
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach((k) => (next[k] = false));
      next[key] = show;
      return next;
    });
  }, []);

  const save = useCallback(
    (existingScript: Script, e: editor.IStandaloneCodeEditor): Promise<Script> => {
      const code = e.getValue();
      const targetUUID = existingScript.uuid;
      return prepareScriptByCode(code, existingScript.origin || "", targetUUID)
        .then((prepareScript) => {
          const { script, oldScript } = prepareScript;
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
          if (script.ignoreVersion) script.ignoreVersion = "";
          return scriptClient
            .install(script, code)
            .then((update): Script => {
              if (!update) {
                Message.success(t("create_success_note"));
                setScriptList((prev) => {
                  setSelectSciptButtonAndTab(script.uuid);
                  return [script, ...prev];
                });
              } else {
                const uuid = script.uuid;
                const name = script.name;
                setScriptList((prev) => prev.map((s) => (s.uuid === uuid ? { ...s, name } : s)));
                Message.success(t("save_success"));
              }
              const uuid = script.uuid;
              const name = script.name;
              setEditors((prev) =>
                prev.map((item) =>
                  item.script.uuid === uuid
                    ? { ...item, code, isChanged: false, script: wScript({ ...item.script, name }) }
                    : item
                )
              );
              return script;
            })
            .catch((err: any) => {
              Message.error(`${t("save_failed")}: ${err}`);
              return Promise.reject(err);
            });
        })
        .catch((err) => {
          Message.error(`${t("invalid_script_code")}: ${err}`);
          return Promise.reject(err);
        });
    },
    [t]
  );

  const saveAs = useCallback(
    (script: Script, e: editor.IStandaloneCodeEditor) => {
      return new Promise<void>((resolve) => {
        chrome.downloads.download(
          {
            url: URL.createObjectURL(new Blob([e.getValue()], { type: "text/javascript" })),
            saveAs: true,
            filename: `${script.name}.user.js`,
          },
          () => {
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
    },
    [t]
  );

  type EditorMenu = {
    title: string | JSX.Element;
    key?: string;
    tooltip?: string;
    action?: (script: Script, e: editor.IStandaloneCodeEditor) => void;
    items?: {
      id: string;
      title: string;
      tooltip?: string;
      hotKey?: number;
      hotKeyString?: string;
      action: (script: Script, e: editor.IStandaloneCodeEditor) => void;
    }[];
  };

  const menu: EditorMenu[] = useMemo(
    () => [
      {
        title: t("file"),
        items: [
          { id: "save", title: t("save"), hotKey: KeyMod.CtrlCmd | KeyCode.KeyS, hotKeyString: "Ctrl+S", action: save },
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
        title: t("run"),
        items: [
          {
            id: "run",
            title: t("run"),
            hotKey: KeyMod.CtrlCmd | KeyCode.F5,
            hotKeyString: "Ctrl+F5",
            tooltip: t("only_background_scheduled_can_run"),
            action: async (script, e) => {
              const newScript = await save(script, e);
              if (newScript.type === SCRIPT_TYPE_NORMAL) {
                Message.error(t("only_background_scheduled_can_run"));
                return;
              }
              Message.loading({ id: "debug_script", content: t("preparing_script_resources"), duration: 3000 });
              runtimeClient
                .runScript(newScript.uuid)
                .then(() => {
                  Message.success({ id: "debug_script", content: t("build_success_message"), duration: 3000 });
                })
                .catch((err) => {
                  LoggerCore.logger(Logger.E(err)).debug("run script error");
                  Message.error({ id: "debug_script", content: `${t("build_failed")}: ${err}`, duration: 3000 });
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
        title: <IconSettings />,
        key: "icon_settings",
        tooltip: t("script_setting_tooltip"),
        action(script) {
          setShow("scriptSetting", true);
          setCurrentScript(script);
        },
      },
    ],
    [hiddenScriptList, save, saveAs, setShow, t]
  );

  // 根據菜單生成快捷鍵（熱鍵行為會對當前活躍分頁生效）
  const hotKeys: HotKey[] = React.useMemo(() => {
    const keys: HotKey[] = [];
    menu.forEach((item) => {
      item.items?.forEach((menuItem) => {
        if (menuItem.hotKey) {
          keys.push({ id: menuItem.id, title: menuItem.title, hotKey: menuItem.hotKey, action: menuItem.action });
        }
      });
    });
    return keys;
  }, [menu]);

  // 初始化 + 卸載
  useEffect(() => {
    let mounted = true;
    if (!pageInit) {
      setPageInit(true);
      scriptDAO.all().then((scripts) => {
        if (!mounted) return;
        setScriptList(scripts.sort((a, b) => a.sort - b.sort));
        setCanLoadScript(true);
      });
    }
    return () => {
      mounted = false;
      document.title = "Home - ScriptCat";
      // 清理所有殘留 model（避免記憶體洩漏）
      modelMapRef.current.forEach((m) => m.dispose());
      modelMapRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!selectSciptButtonAndTab) return;
    try {
      const elm = document.querySelector(`#editor-script-uuid-${selectSciptButtonAndTab}`);
      if (elm) {
        elm.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
      }
    } catch (e) {
      console.warn(e);
    }
  }, [selectSciptButtonAndTab]);

  useEffect(() => {
    const item = editors.find((e) => e.script.uuid === activeUuid);
    if (item?.script?.name) {
      document.title = `${i18nName(item.script)} - Script Editor`;
    }
  }, [activeUuid, editors]);

  const memoParamsKey = useMemo(() => `${uuid || ""}|${template || ""}|${target || ""}`, [uuid, template, target]);
  const handledParamsRef = useRef<string | null>(null);

  // 產生新分頁（建立 model）
  const createTabWithCode = useCallback(
    (code: string): Promise<{ script: Script; code: string } & { uuid: string }> => {
      return prepareScriptByCode(code, "", uuidv4()).then(({ script }) => {
        script.createtime = 0;
        const model = editor.createModel(code, "javascript");
        modelMapRef.current.set(script.uuid, model);
        return { script, code, uuid: script.uuid };
      });
    },
    []
  );

  const [buildTemplateParam, setBuildTemplateParam] = useState<"" | "background" | "crontab">(template || "");

  const handleCreateByTemplate = useCallback(
    (tpl: "" | "background" | "crontab", tgt: "blank" | "initial" = "blank") => {
      setBuildTemplateParam(tpl);
      // 直接沿用上方新建邏輯（略過 tgt，保持簡化）
      let code = "";
      switch (tpl) {
        case "background":
          code = lazyScriptName(backgroundTpl);
          break;
        case "crontab":
          code = lazyScriptName(crontabTpl);
          break;
        default:
          code = lazyScriptName(normalTpl)
            .replace("{{match}}", "https://*/*")
            .replace(/\[\r\n]*[^\r\n]*\{\{icon\}\}[^\r\n]*/, "");
          break;
      }
      createTabWithCode(code).then(({ script, code: c }) => {
        setEditors((prev) => [...prev, { script: wScript(script), code: c, hotKeys, isChanged: false }]);
        switchToUuid(script.uuid);
      });
    },
    [createTabWithCode, hotKeys]
  );

  // 依傳入參數建立/開啟分頁
  useEffect(() => {
    if (!canLoadScript) return;
    if (handledParamsRef.current === memoParamsKey) return;

    const [idFromParam, tpl, tgt] = memoParamsKey.split("|");

    if (idFromParam) {
      const found = scriptList.find((s) => s.uuid === idFromParam);
      if (!found) return; // 等清單
      scriptCodeDAO.findByUUID(idFromParam).then((code) => {
        if (modelMapRef.current.has(idFromParam)) {
          setActiveUuid(idFromParam);
          setSelectSciptButtonAndTab(idFromParam);
          handledParamsRef.current = memoParamsKey;
          return;
        }
        const mdl = editor.createModel(code?.code || "", "javascript");
        modelMapRef.current.set(found.uuid, mdl);
        const newEditorEntry = { script: wScript(found), code: code?.code || "", hotKeys, isChanged: false };
        setEditors((prev) => [...prev, newEditorEntry]);
        setActiveUuid(found.uuid);
        setSelectSciptButtonAndTab(found.uuid);
        handledParamsRef.current = memoParamsKey;
      });
    } else {
      // 建立空白腳本（依 template）
      const makeCodeByTemplate = async () => {
        let code = "";
        switch (tpl) {
          case "background":
            code = lazyScriptName(backgroundTpl);
            break;
          case "crontab":
            code = lazyScriptName(crontabTpl);
            break;
          default:
            code = lazyScriptName(normalTpl);
            // target 初始網址替換（與原邏輯一致，略）
            code = code.replace("{{match}}", "https://*/*");
            code = code.replace(/\[\r\n]*[^\r\n]*\{\{icon\}\}[^\r\n]*/, "");
            break;
        }
        return code;
      };
      makeCodeByTemplate().then((code) => {
        createTabWithCode(code).then(({ script, code: c }) => {
          setEditors((prev) => [...prev, { script: wScript(script), code: c, hotKeys, isChanged: false }]);
          setActiveUuid(script.uuid);
          setSelectSciptButtonAndTab(script.uuid);
          handledParamsRef.current = memoParamsKey;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoadScript, memoParamsKey, scriptList]);

  // 未保存離開保護（overlay 下不啟用）
  useEffect(() => {
    // if (overlayMode) return;
    const anyChanged = editors.some((e) => e.isChanged);
    const unhooks = [] as (() => any)[];
    if (anyChanged) {
      const beforeunload = (event: Event) => {
        // https://developer.mozilla.org/ja/docs/Web/API/Window/beforeunload_event
        // Cancel the event as stated by the standard.
        event.preventDefault();
        // Chrome requires returnValue to be set.
        //@ts-ignore
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", beforeunload);
      const popstate = () => {
        if (confirm(i18n.t("script_modified_leave_confirm"))) {
          window.history.back();
          window.removeEventListener("popstate", popstate);
        } else {
          window.history.pushState(null, "", window.location.href);
        }
        return false;
      };
      window.history.pushState(null, "", window.location.href);
      window.addEventListener("popstate", popstate);
      unhooks.push(() => {
        window.removeEventListener("beforeunload", beforeunload);
        window.removeEventListener("popstate", popstate);
      });
    }

    const onAdd = (e: Event | CustomEvent) => {
      const p = (e as CustomEvent).detail;
      if (p && typeof p.tpl === "string") {
        handleCreateByTemplate(p.tpl, p.tgt);
      }
    };
    window.addEventListener("scriptcat:editor:add", onAdd);
    unhooks.push(() => {
      window.removeEventListener("scriptcat:editor:add", onAdd);
    });
    return () => {
      for (const unhook of unhooks) unhook();
    };
  }, [editors, handleCreateByTemplate]);

  // URL 同步
  useEffect(() => {
    if (!onUrlChange) return;
    const active = editors.find((e) => e.script.uuid === activeUuid);
    if (!active) return;
    if (active.script?.uuid && active.script.createtime !== 0) {
      onUrlChange({ uuid: active.script.uuid });
    } else {
      onUrlChange({ template: template || "", target: target || "blank" });
    }
  }, [onUrlChange, activeUuid, editors, template, target]);

  // 右鍵分頁操作（關閉當前/其它/左側/右側）
  useEffect(() => {
    let selectEditorIndex = 0;
    if (!rightOperationTab) return;
    switch (rightOperationTab.key) {
      case "1": // 關閉當前
        handleDeleteEditor(rightOperationTab.uuid, false);
        break;
      case "2": // 關閉其它
        setSelectSciptButtonAndTab(rightOperationTab.uuid);
        setEditors((prev) => {
          const only = prev.filter((it) => it.script.uuid === rightOperationTab.uuid);
          setActiveUuid(rightOperationTab.uuid);
          // 清理被移除的 models
          prev.forEach((it) => {
            if (it.script.uuid !== rightOperationTab.uuid) {
              const m = modelMapRef.current.get(it.script.uuid);
              m?.dispose();
              modelMapRef.current.delete(it.script.uuid);
            }
          });
          return only;
        });
        break;
      case "3": // 關閉左側
        setEditors((prev) => {
          prev.some((item, index) => {
            if (item.script.uuid === rightOperationTab.uuid) {
              selectEditorIndex = index;
              return true;
            }
            return false;
          });
          const sliced = prev.slice(selectEditorIndex);
          prev.slice(0, selectEditorIndex).forEach((it) => {
            const m = modelMapRef.current.get(it.script.uuid);
            m?.dispose();
            modelMapRef.current.delete(it.script.uuid);
          });
          const stillActive = sliced.some((e) => e.script.uuid === activeUuid);
          if (!stillActive) {
            setActiveUuid(rightOperationTab.uuid);
            setSelectSciptButtonAndTab(rightOperationTab.uuid);
          }
          return sliced;
        });
        break;
      case "4": // 關閉右側
        setEditors((prev) => {
          prev.some((item, index) => {
            if (item.script.uuid === rightOperationTab.uuid) {
              selectEditorIndex = index;
              return true;
            }
            return false;
          });
          const sliced = prev.slice(0, selectEditorIndex + 1);
          prev.slice(selectEditorIndex + 1).forEach((it) => {
            const m = modelMapRef.current.get(it.script.uuid);
            m?.dispose();
            modelMapRef.current.delete(it.script.uuid);
          });
          const stillActive = sliced.some((e) => e.script.uuid === activeUuid);
          if (!stillActive) {
            setActiveUuid(rightOperationTab.uuid);
            setSelectSciptButtonAndTab(rightOperationTab.uuid);
          }
          return sliced;
        });
        break;
      default:
        break;
    }
  }, [rightOperationTab, activeUuid]);

  // 通用刪除（會處理 model 釋放）
  const handleDeleteEditor = (targetUuid: string, needConfirm: boolean = false) => {
    setEditors((prev) => {
      const idx = prev.findIndex((e) => e.script.uuid === targetUuid);
      if (idx === -1) return prev;
      const target = prev[idx];
      if (needConfirm && target.isChanged) {
        if (!confirm(t("script_modified_close_confirm"))) return prev;
      }
      const next = prev.filter((_, i) => i !== idx);
      // 釋放對應 model（保留其它 model 的 undo 記錄）
      const mdl = modelMapRef.current.get(targetUuid);
      mdl?.dispose();
      modelMapRef.current.delete(targetUuid);

      if (prev.length === 1) {
        // 若刪到無分頁，新增空白一個
        const code = lazyScriptName(normalTpl)
          .replace("{{match}}", "https://*/*")
          .replace(/\[\r\n]*[^\r\n]*\{\{icon\}\}[^\r\n]*/, "");
        createTabWithCode(code).then(({ script, code: c }) => {
          setEditors([{ script, code: c, hotKeys, isChanged: false }]);
          setActiveUuid(script.uuid);
          setSelectSciptButtonAndTab(script.uuid);
          // 同時讓 editor 設定成新 model
          const newModel = modelMapRef.current.get(script.uuid);
          if (monacoEditorRef.current && newModel) monacoEditorRef.current.setModel(newModel);
        });
        return prev; // 讓異步流程接手
      }

      // 切換活躍分頁
      if (targetUuid === activeUuid && next.length > 0) {
        const nextActiveIndex = idx >= next.length ? next.length - 1 : idx;
        const u = next[nextActiveIndex].script.uuid;
        setActiveUuid(u);
        setSelectSciptButtonAndTab(u);
        const mdl2 = modelMapRef.current.get(u);
        if (monacoEditorRef.current && mdl2) monacoEditorRef.current.setModel(mdl2);
      }
      return next;
    });
  };

  // 當前分頁切換：只切換 editor 的 model
  const activeTab = useMemo(() => {
    const idx = editors.findIndex((e) => e.script.uuid === activeUuid);
    return idx >= 0 ? String(idx) : undefined;
  }, [editors, activeUuid]);

  const switchToUuid = (uuid: string) => {
    setActiveUuid(uuid);
    setSelectSciptButtonAndTab(uuid);
    const mdl = modelMapRef.current.get(uuid);
    if (monacoEditorRef.current && mdl) {
      monacoEditorRef.current.setModel(mdl);
      // 小延時以確保 layout/focus
      setTimeout(() => {
        try {
          monacoEditorRef.current!.layout();
          monacoEditorRef.current!.focus();
        } catch {}
      }, 100);
    }
  };

  const handleModeToggle = () => {
    const layoutContent = document.querySelector("#scripteditor-layout-content");
    const container = document.querySelector("#scripteditor-container");
    if (layoutContent && container && !layoutContent.firstElementChild) {
      let s = layoutContent.previousElementSibling as HTMLElement | null;
      while (s instanceof HTMLElement) {
        s.style.display = "none";
        s = s.previousElementSibling as HTMLElement | null;
      }
      layoutContent.appendChild(container);
      const modalBoxParent = document.querySelector(".editor-modal-wrapper");
      if (modalBoxParent) {
        (modalBoxParent.parentElement as HTMLElement)!.style.display = "none";
      }
      // setTimeout(() => {
      //   let s: Element | HTMLElement | null | undefined = document.querySelector("#scripteditor-layout-content");
      //   while ((s = s?.previousElementSibling) instanceof HTMLElement) {
      //     (s as HTMLElement).style.display = "";
      //   }
      // }, 1);
    }
  };

  const handleClose = () => {
    const modalBoxParent = document.querySelector(".editor-modal-wrapper");
    if (modalBoxParent) {
      (modalBoxParent.parentElement as HTMLElement)!.style.display = "none";
    }
    setTimeout(() => {
      let s: Element | HTMLElement | null | undefined = document.querySelector("#scripteditor-layout-content");
      while ((s = s?.previousElementSibling) instanceof HTMLElement) {
        (s as HTMLElement).style.display = "";
      }
    }, 1);
  };

  useLayoutEffect(() => {
    if (!showSearchInput) return;
    const cid = setTimeout(
      () => showSearchInput && (document.querySelector("#editor_search_scripts_input") as HTMLInputElement)?.focus(),
      1
    );
    return () => {
      clearTimeout(cid);
    };
  }, [showSearchInput]);

  const modalConfirm = useCallback(
    (config: any) => {
      modal.confirm!(config);
    },
    [modal]
  );

  const actionProps = {
    showSearchInput,
    setShowSearchInput,
    searchKeyword,
    setSearchKeyword,
    scriptList,
    selectSciptButtonAndTab,
    setSelectSciptButtonAndTab,
    modelMapRef,
    switchToUuid,
    scriptCodeDAO,
    setEditors,
    hotKeys,
    setScriptList,
    handleDeleteEditor,
    modalConfirm,
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{ position: "relative", left: -10, top: -10, width: "calc(100% + 20px)", height: "calc(100% + 20px)" }}
    >
      {contextHolder}
      <ScriptStorage
        visible={visible.scriptStorage}
        script={currentScript}
        onOk={() => setShow("scriptStorage", false)}
        onCancel={() => setShow("scriptStorage", false)}
      />
      <ScriptResource
        visible={visible.scriptResource}
        script={currentScript}
        onOk={() => setShow("scriptResource", false)}
        onCancel={() => setShow("scriptResource", false)}
      />
      <ScriptSetting
        visible={visible.scriptSetting}
        script={currentScript!}
        onOk={() => setShow("scriptSetting", false)}
        onCancel={() => setShow("scriptSetting", false)}
      />

      <div
        className="h-6"
        style={{ borderBottom: "1px solid var(--color-neutral-3)", background: "var(--color-secondary)" }}
      >
        <div className="flex flex-row">
          {
            <Button
              size="mini"
              style={{
                backgroundColor: hiddenScriptList ? "" : "var(--color-tooltip-bg)",
              }}
              onClick={() => {
                setHiddenScriptList((v) => {
                  const newVal = !v!;
                  systemConfig.setEditorWithScriptList(newVal ? false : true);
                  return newVal;
                });
              }}
            >
              <IconList />
            </Button>
          }
          {menu.map((item, index) => {
            if (!item.items) {
              const btn = (
                <Button
                  key={`m_${item.key || item.title}`}
                  size="mini"
                  onClick={() => {
                    const script = editors.find((e) => e.script.uuid === activeUuid)?.script;
                    if (!script || !monacoEditorRef.current) return;
                    item.action && item.action(script, monacoEditorRef.current);
                  }}
                >
                  {item.title}
                </Button>
              );
              return item.tooltip ? (
                <Tooltip key={`menu-tooltip-a${index.toString()}`} position="bottom" content={item.tooltip}>
                  {btn}
                </Tooltip>
              ) : (
                btn
              );
            }
            return (
              <Dropdown
                key={`d_${index.toString()}`}
                trigger="click"
                position="bl"
                droplist={
                  <Menu
                    style={{
                      padding: "0",
                      margin: "0",
                      borderRadius: "0",
                    }}
                  >
                    {item.items.map((menuItem, i) => {
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
                            const script = editors.find((e) => e.script.uuid === activeUuid)?.script;
                            if (!script || !monacoEditorRef.current) return;
                            menuItem.action(script, monacoEditorRef.current);
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
                          key={`m_${i.toString()}`}
                          style={{
                            height: "unset",
                            padding: "0",
                            lineHeight: "unset",
                          }}
                        >
                          {menuItem.tooltip ? (
                            <Tooltip key={`m${i.toString()}`} position="right" content={menuItem.tooltip}>
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
              >
                <Button size="mini">{item.title}</Button>
              </Dropdown>
            );
          })}
          <div style={{ flex: 1 }} />
          {overlayMode && (
            <Button size="mini" onClick={handleModeToggle}>
              <IconShrink />
            </Button>
          )}
          {overlayMode && (
            <Button size="mini" onClick={handleClose}>
              <IconClose />
            </Button>
          )}
        </div>
      </div>

      <Row className="flex flex-grow flex-1" style={{ overflow: "hidden" }}>
        {!hiddenScriptList && hiddenScriptList !== null && <ScriptEditorScriptList {...actionProps} />}

        <Col span={hiddenScriptList ? 24 : 20} className="flex! flex-col h-full">
          <Tabs
            editable
            activeTab={activeTab}
            className="edit-tabs"
            type="card-gutter"
            style={{ overflow: "inherit" }}
            onChange={(index: string) => {
              const i = Number(index);
              const uuid = editors[i]?.script.uuid;
              if (uuid) switchToUuid(uuid);
            }}
            onAddTab={() => handleCreateByTemplate(template || "", "blank")}
            onDeleteTab={(index: string) => {
              const i = parseInt(index, 10);
              const targetUuid = editors[i]?.script.uuid;
              if (targetUuid) handleDeleteEditor(targetUuid, true);
            }}
            deleteButton={editors.length === 1 ? <></> : undefined}
            addButton={<></>}
            extra={
              <>
                <Dropdown
                  trigger="hover"
                  position="br"
                  droplist={
                    <Menu>
                      <Menu.Item key="new-user" onClick={() => handleCreateByTemplate("")}>
                        {t("create_user_script")}
                      </Menu.Item>
                      <Menu.Item key="new-bg" onClick={() => handleCreateByTemplate("background", "blank")}>
                        {t("create_background_script")}
                      </Menu.Item>
                      <Menu.Item key="new-cron" onClick={() => handleCreateByTemplate("crontab", "blank")}>
                        {t("create_scheduled_script")}
                      </Menu.Item>
                    </Menu>
                  }
                >
                  <Button size="mini" onClick={() => handleCreateByTemplate(buildTemplateParam, "blank")}>
                    <IconPlus />
                  </Button>
                </Dropdown>
                <div style={{ width: "8px" }} />
              </>
            }
          >
            {editors.map((e, index, array) => (
              <TabPane
                closable={array.length == 1 ? false : true}
                destroyOnHide
                key={index!.toString()}
                title={
                  <Dropdown
                    trigger="contextMenu"
                    disabled={array.length == 1 ? true : false}
                    position="bl"
                    droplist={
                      <Menu
                        onClickMenuItem={(key) =>
                          setRightOperationTab({
                            ...rightOperationTab,
                            key,
                            uuid: e.script.uuid,
                            selectSciptButtonAndTab,
                          })
                        }
                        onClick={(e) => (e.preventDefault(), e.stopPropagation())} // 要設定；否則按 disabled 選項 時會點到 editor
                      >
                        <Menu.Item key="1">{t("close_current_tab")}</Menu.Item>
                        <Menu.Item key="2">{t("close_other_tabs")}</Menu.Item>
                        <Menu.Item key="3" disabled={index === 0}>
                          {t("close_left_tabs")}
                        </Menu.Item>
                        <Menu.Item key="4" disabled={index === array.length - 1}>
                          {t("close_right_tabs")}
                        </Menu.Item>
                      </Menu>
                    }
                  >
                    <span
                      style={{
                        color: e.isChanged
                          ? "rgb(var(--orange-5))"
                          : e.script.uuid === selectSciptButtonAndTab
                            ? "rgb(var(--green-7))"
                            : e.script.uuid === activeUuid
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

          {/* 單一 CodeEditor；切換分頁時只切換 model */}
          <div className="flex flex-grow flex-1 w-full">
            <WrappedCodeEditor
              id={`singleton-editor`}
              className="script-code-editor"
              uuid={`${activeUuid}`}
              editable
              // 當前使用的 model 由子元件透過 monacoEditor.setModel 接收（使用 ref + prop currentModel）
              currentModel={modelMapRef.current.get(activeUuid)}
              onReady={(ed) => {
                monacoEditorRef.current = ed;
                // 註冊快捷鍵（對當前活躍分頁生效）
                hotKeys.forEach((hk) => {
                  ed.addAction({
                    id: hk.id,
                    label: hk.title,
                    keybindings: [hk.hotKey],
                    run: () => {
                      const script = editors.find((e) => e.script.uuid === activeUuid)?.script;
                      if (script) hk.action(script, ed);
                    },
                  });
                });
                // 初次掛載設置當前 model
                const mdl = modelMapRef.current.get(activeUuid);
                if (mdl) ed.setModel(mdl);
                setTimeout(() => {
                  try {
                    ed.layout();
                    ed.focus();
                  } catch {}
                }, 100);
              }}
              onChange={(val) => {
                // 更新 isChanged 標記（與當初載入 code 比對）
                setEditors((prev) => {
                  const idx = prev.findIndex((e) => e.script.uuid === activeUuid);
                  if (idx === -1) return prev;
                  const item = prev[idx];
                  const changed = item.code !== val;
                  if (changed === item.isChanged) return prev;
                  const next = [...prev];
                  next[idx] = { ...item, isChanged: changed };
                  return next;
                });
              }}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}

export default ScriptEditor;
