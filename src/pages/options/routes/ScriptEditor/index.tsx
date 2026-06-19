import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { editor } from "monaco-editor";
import type { Script } from "@App/app/repo/scripts";
import { ScriptDAO, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { i18nName, t } from "@App/locales/locales";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { makeBlobURL } from "@App/pkg/utils/utils";
import { runtimeClient, scriptClient } from "@App/pages/store/features/script";
import { useScriptDataManagement } from "@App/pages/options/routes/ScriptList/hooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@App/pages/components/ui/alert-dialog";
import { toast } from "sonner";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { editorTabsReducer, initialEditorTabsState } from "./useEditorTabs";
import { useActiveEditorFocus } from "./useActiveEditorFocus";
import { emptyScript, loadScriptCode } from "./editorScriptLoaders";
import { saveScript, SAVE_CANCELED } from "./saveScript";
import ScriptListPanel from "./ScriptListPanel";
import EditorTabs from "./EditorTabs";
import EditorToolbar, { type EditorCommand, type SubView } from "./EditorToolbar";
import EditorStatusBar from "./EditorStatusBar";
import MobileEditor from "./MobileEditor";
import { CodePane, type EditorStatus } from "./tabs/CodePane";
import SettingsPane, { invalidateSettingsPane, preloadSettingsPane, usePreloadSettingsPane } from "./tabs/SettingsPane";
import StoragePane, { invalidateStoragePane, preloadStoragePane, usePreloadStoragePane } from "./tabs/StoragePane";
import ResourcePane, { invalidateResourcePane, usePreloadResourcePane } from "./tabs/ResourcePane";

interface ConfirmState {
  title: string;
  description?: string;
  confirmText?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

const SCRIPT_LIST_COLLAPSED_KEY = "scriptcat-editor-script-list-collapsed";

export default function ScriptEditor() {
  const params = useParams<{ uuid?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { scriptList, setScriptList, loadingList } = useScriptDataManagement();
  const [state, dispatch] = useReducer(editorTabsReducer, initialEditorTabsState);
  const [subView, setSubView] = useState<SubView>("code");
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [scriptListCollapsed, setScriptListCollapsed] = useState(
    () => localStorage.getItem(SCRIPT_LIST_COLLAPSED_KEY) === "1"
  );

  const toggleScriptList = useCallback(() => {
    setScriptListCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SCRIPT_LIST_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const scriptDAO = useMemo(() => new ScriptDAO(), []);
  const editorsRef = useRef(new Map<string, editor.IStandaloneCodeEditor>());

  // refs 避免 stale closure
  const stateRef = useRef(state);
  stateRef.current = state;
  const scriptListRef = useRef(scriptList);
  scriptListRef.current = scriptList;
  const templateRef = useRef(searchParams.get("template") || undefined);
  const targetRef = useRef(searchParams.get("target") || undefined);

  const confirm = useCallback(
    (o: Omit<ConfirmState, "resolve">) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })),
    []
  );

  // saveScript 仍以 { kind } 形式回调，这里适配成通用确认框
  const askConfirm = useCallback(
    ({ kind }: { kind: "name" | "edit" }) =>
      confirm(
        kind === "edit"
          ? { title: t("editor:edit_conflict"), description: t("editor:confirm_override_when_edit_conflict") }
          : { title: t("editor:scriptname_conflict"), description: t("editor:confirm_save_when_scriptname_conflict") }
      ),
    [confirm]
  );

  const openScript = useCallback(async (uuid?: string, template?: string, target?: string) => {
    if (uuid) {
      if (stateRef.current.tabs.some((x) => x.uuid === uuid)) {
        dispatch({ type: "activate", uuid });
        return;
      }
      const script = scriptListRef.current.find((s) => s.uuid === uuid);
      if (!script) {
        toast.error(t("editor:script_not_found"));
        return;
      }
      const code = await loadScriptCode(uuid);
      dispatch({ type: "open", tab: { uuid, script, code, isChanged: false } });
    } else {
      const tab = await emptyScript(template || "", target);
      dispatch({ type: "open", tab });
    }
  }, []);

  // 初始化：列表就绪后根据 URL uuid 打开
  useEffect(() => {
    if (loadingList) return;
    const uuid = params.uuid;
    if (uuid) {
      if (uuid === stateRef.current.activeUuid) return;
      const known =
        stateRef.current.tabs.some((x) => x.uuid === uuid) || scriptListRef.current.some((s) => s.uuid === uuid);
      if (known) {
        openScript(uuid, templateRef.current, targetRef.current);
      } else if (stateRef.current.tabs.length === 0) {
        openScript(undefined, templateRef.current, targetRef.current);
      } else {
        toast.error(t("editor:script_not_found"));
      }
    } else if (stateRef.current.tabs.length === 0) {
      openScript(undefined, templateRef.current, targetRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingList, params.uuid]);

  // 激活标签 → 同步 URL + 标题
  useEffect(() => {
    if (!state.activeUuid) return;
    if (params.uuid !== state.activeUuid) {
      navigate(`/script/editor/${state.activeUuid}`, { replace: true });
    }
    const tab = state.tabs.find((x) => x.uuid === state.activeUuid);
    if (tab) document.title = `${i18nName(tab.script)} - Script Editor`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeUuid]);

  // 切换标签后把焦点恢复到对应编辑器(各标签实例常驻,仅丢失键盘焦点)
  useActiveEditorFocus(state.activeUuid, editorsRef);

  useEffect(() => () => void (document.title = "ScriptCat"), []);

  // 离开未保存提醒
  const anyChanged = state.tabs.some((x) => x.isChanged);
  useEffect(() => {
    if (!anyChanged) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyChanged]);

  const activeTab = state.tabs.find((x) => x.uuid === state.activeUuid);
  usePreloadResourcePane(activeTab?.uuid);
  usePreloadSettingsPane(activeTab?.uuid);
  usePreloadStoragePane(activeTab?.uuid);

  const preloadSubView = useCallback((view: SubView) => {
    const uuid = stateRef.current.activeUuid;
    if (!uuid) return;
    const request =
      view === "storage" ? preloadStoragePane(uuid) : view === "setting" ? preloadSettingsPane(uuid) : null;
    void request?.catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(`${t("script:operation_failed")}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, []);

  const selectSubView = useCallback(
    (view: SubView) => {
      preloadSubView(view);
      setSubView(view);
    },
    [preloadSubView]
  );

  // ---- 标签操作 ----
  const closeTab = useCallback(
    async (uuid: string, skipConfirm = false) => {
      const tab = stateRef.current.tabs.find((x) => x.uuid === uuid);
      if (!skipConfirm && tab?.isChanged) {
        const ok = await confirm({ title: t("editor:script_modified_close_confirm"), destructive: true });
        if (!ok) return;
      }
      const wasLast = stateRef.current.tabs.length === 1;
      editorsRef.current.delete(uuid);
      dispatch({ type: "close", uuid });
      if (wasLast) openScript(undefined, templateRef.current, targetRef.current);
    },
    [confirm, openScript]
  );

  // ---- 保存 / 另存为 / 运行 ----
  const doSave = useCallback(
    async (script: Script, e: editor.ICodeEditor): Promise<Script | undefined> => {
      const code = e.getValue();
      try {
        const res = await saveScript(script, code, {
          prepareScript: (c, o, u) => prepareScriptByCode(c, o, u, false, scriptDAO, { byEditor: true }),
          findByNameAndNamespace: (n, ns) => scriptDAO.findByNameAndNamespace(n, ns),
          install: (p) => scriptClient.install(p),
          confirm: askConfirm,
        });
        invalidateResourcePane(res.script.uuid);
        invalidateSettingsPane(res.script.uuid);
        invalidateStoragePane(res.script.uuid);
        dispatch({ type: "commitSaved", uuid: res.script.uuid, code, script: res.script });
        setScriptList((prev) => {
          if (prev.some((s) => s.uuid === res.script.uuid)) {
            return prev.map((s) =>
              s.uuid === res.script.uuid
                ? { ...s, name: res.script.name, updatetime: res.updatetime ?? s.updatetime }
                : s
            );
          }
          return [{ ...res.script } as (typeof prev)[number], ...prev];
        });
        toast.success(res.updated ? t("editor:save_success") : t("editor:create_success_note"));
        return res.script;
      } catch (err) {
        if (err instanceof Error && err.message === SAVE_CANCELED) return undefined;
        toast.error(`${t("editor:save_failed")}: ${err}`);
        return undefined;
      }
    },
    [askConfirm, scriptDAO, setScriptList]
  );

  const doSaveAs = useCallback((script: Script, e: editor.ICodeEditor) => {
    chrome.downloads.download(
      {
        url: makeBlobURL({ blob: new Blob([e.getValue()], { type: "text/javascript" }), persistence: false }) as string,
        saveAs: true,
        filename: `${script.name}.user.js`,
      },
      () => {
        if (chrome.runtime.lastError) {
          toast.error(`${t("editor:save_as_failed")}: ${chrome.runtime.lastError.message}`);
        } else {
          toast.success(t("editor:save_as_success"));
        }
      }
    );
  }, []);

  const doRun = useCallback(
    async (script: Script, e: editor.ICodeEditor) => {
      const saved = await doSave(script, e);
      if (!saved) return;
      if (saved.type === SCRIPT_TYPE_NORMAL) {
        toast.error(t("editor:only_background_scheduled_can_run"));
        return;
      }
      runtimeClient
        .runScript(saved.uuid)
        .then(() => toast.success(t("editor:build_success_message")))
        .catch((err) => toast.error(`${t("editor:build_failed")}: ${err}`));
    },
    [doSave]
  );

  const onCommand = useCallback(
    (cmd: EditorCommand) => {
      const e = state.activeUuid ? editorsRef.current.get(state.activeUuid) : undefined;
      if (!e) return;
      e.focus();
      switch (cmd) {
        case "undo":
          e.trigger("menu", "undo", null);
          break;
        case "redo":
          e.trigger("menu", "redo", null);
          break;
        case "cut":
          e.trigger("menu", "editor.action.clipboardCutAction", null);
          break;
        case "copy":
          e.trigger("menu", "editor.action.clipboardCopyAction", null);
          break;
        case "paste":
          e.trigger("menu", "editor.action.clipboardPasteAction", null);
          break;
        case "find":
          e.getAction("actions.find")?.run();
          break;
        case "replace":
          e.getAction("editor.action.startFindReplaceAction")?.run();
          break;
        case "selectAll":
          e.trigger("menu", "editor.action.selectAll", null);
          break;
        case "format": {
          const sel = e.getSelection();
          const id = sel && !sel.isEmpty() ? "editor.action.formatSelection" : "editor.action.formatDocument";
          e.getAction(id)?.run();
          break;
        }
      }
    },
    [state.activeUuid]
  );

  const onDelete = useCallback(
    async (script: Script) => {
      const ok = await confirm({
        title: t("editor:confirm_delete_script", { name: i18nName(script) }),
        description: t("script:confirm_delete_script_content", { name: i18nName(script) }),
        destructive: true,
        confirmText: t("delete"),
      });
      if (!ok) return;
      try {
        await scriptClient.deletes([script.uuid]);
        if (stateRef.current.tabs.some((x) => x.uuid === script.uuid)) closeTab(script.uuid, true);
        toast.success(t("editor:delete_success"));
      } catch (err) {
        toast.error(`${t("editor:delete_failed")}: ${err}`);
      }
    },
    [confirm, closeTab]
  );

  const openUuids = useMemo(() => new Set(state.tabs.map((x) => x.uuid)), [state.tabs]);
  const changedUuids = useMemo(() => new Set(state.tabs.filter((x) => x.isChanged).map((x) => x.uuid)), [state.tabs]);

  // 针对当前激活标签的动作（桌面工具栏 / 移动端共用）
  const getActiveEditor = () => (state.activeUuid ? editorsRef.current.get(state.activeUuid) : undefined);
  const handleSaveActive = () => {
    const e = getActiveEditor();
    if (e && activeTab) doSave(activeTab.script, e);
  };
  const handleSaveAsActive = () => {
    const e = getActiveEditor();
    if (e && activeTab) doSaveAs(activeTab.script, e);
  };
  const handleRunActive = () => {
    const e = getActiveEditor();
    if (e && activeTab) doRun(activeTab.script, e);
  };

  // 编辑区：所有标签常驻挂载，非激活隐藏以保留 Monaco 状态（桌面/移动共用）
  const editorArea = (
    <div className="relative min-h-0 flex-1">
      {state.tabs.map((tab) => (
        <div
          key={tab.uuid}
          className="absolute inset-0"
          style={{ display: tab.uuid === state.activeUuid && subView === "code" ? "block" : "none" }}
        >
          <CodePane
            tab={tab}
            getScript={() => stateRef.current.tabs.find((x) => x.uuid === tab.uuid)?.script ?? tab.script}
            onChange={(code) => dispatch({ type: "markChanged", uuid: tab.uuid, code })}
            onSave={doSave}
            onSaveAs={doSaveAs}
            onRun={doRun}
            onStatus={setStatus}
            onMount={(e) => editorsRef.current.set(tab.uuid, e)}
          />
        </div>
      ))}
      {activeTab && subView === "storage" && (
        <div className="absolute inset-0">
          <StoragePane uuid={activeTab.uuid} />
        </div>
      )}
      {activeTab && subView === "resource" && (
        <div className="absolute inset-0">
          <ResourcePane uuid={activeTab.uuid} />
        </div>
      )}
      {activeTab && subView === "setting" && (
        <div className="absolute inset-0">
          <SettingsPane uuid={activeTab.uuid} />
        </div>
      )}
    </div>
  );

  return (
    <>
      {isMobile ? (
        <MobileEditor
          title={activeTab ? i18nName(activeTab.script) : t("editor:script_list")}
          subView={subView}
          onSubView={selectSubView}
          onPreloadSubView={preloadSubView}
          hasActive={!!activeTab}
          onBack={() => navigate("/")}
          onSave={handleSaveActive}
          onSaveAs={handleSaveAsActive}
          onRun={handleRunActive}
          onCommand={onCommand}
        >
          {editorArea}
        </MobileEditor>
      ) : (
        <div className="relative flex h-full min-h-0 overflow-hidden">
          <ScriptListPanel
            scripts={scriptList}
            activeUuid={state.activeUuid}
            openUuids={openUuids}
            changedUuids={changedUuids}
            scriptListCollapsed={scriptListCollapsed}
            onOpen={(uuid) => openScript(uuid)}
            onDelete={onDelete}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <EditorTabs
              tabs={state.tabs}
              activeUuid={state.activeUuid}
              onActivate={(uuid) => dispatch({ type: "activate", uuid })}
              onClose={(uuid) => closeTab(uuid)}
              onCloseOthers={(uuid) => dispatch({ type: "closeOthers", uuid })}
              onCloseLeft={(uuid) => dispatch({ type: "closeLeft", uuid })}
              onCloseRight={(uuid) => dispatch({ type: "closeRight", uuid })}
              onNew={() => openScript(undefined, templateRef.current, targetRef.current)}
            />

            <EditorToolbar
              subView={subView}
              onSubView={selectSubView}
              onPreloadSubView={preloadSubView}
              hasActive={!!activeTab}
              scriptListCollapsed={scriptListCollapsed}
              onSave={handleSaveActive}
              onSaveAs={handleSaveAsActive}
              onRun={handleRunActive}
              onCommand={onCommand}
              onToggleScriptList={toggleScriptList}
            />

            {editorArea}

            <EditorStatusBar status={subView === "code" ? status : null} />
          </div>
        </div>
      )}

      {/* 二次确认（保存冲突 / 删除 / 关闭未保存标签） */}
      <AlertDialog
        open={!!confirmState}
        onOpenChange={(open) => {
          if (!open && confirmState) {
            confirmState.resolve(false);
            setConfirmState(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            {confirmState?.description && <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                confirmState?.resolve(false);
                setConfirmState(null);
              }}
            >
              {t("editor:cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirmState?.destructive ? "destructive" : "default"}
              onClick={() => {
                confirmState?.resolve(true);
                setConfirmState(null);
              }}
            >
              {confirmState?.confirmText ?? t("editor:confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
