import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { editor } from "monaco-editor";
import type { Script } from "@App/app/repo/scripts";
import { ScriptDAO, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { i18nName } from "@App/locales/locales";
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
import { notify } from "@App/pages/components/ui/toast";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { editorTabsReducer, initialEditorTabsState } from "./useEditorTabs";
import { useActiveEditorFocus } from "./useActiveEditorFocus";
import { emptyScript, loadScriptCode } from "./editorScriptLoaders";
import { saveScript, SAVE_CANCELED, SAVE_EMPTY_NAME } from "./saveScript";
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
  const { t } = useTranslation();
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
  const scriptListRef = useRef(scriptList);
  // 每次渲染提交后同步最新值到 ref(供回调/effect 读取),避免在渲染期写 ref。
  // 用 useLayoutEffect 在提交阶段同步写入,保持与原渲染期赋值一致的可见时机。
  useLayoutEffect(() => {
    stateRef.current = state;
    scriptListRef.current = scriptList;
  });
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
    [confirm, t]
  );

  const openScript = useCallback(
    async (uuid?: string, template?: string, target?: string) => {
      if (uuid) {
        if (stateRef.current.tabs.some((x) => x.uuid === uuid)) {
          dispatch({ type: "activate", uuid });
          return;
        }
        const script = scriptListRef.current.find((s) => s.uuid === uuid);
        if (!script) {
          notify.error(t("editor:script_not_found"));
          return;
        }
        const code = await loadScriptCode(uuid);
        dispatch({ type: "open", tab: { uuid, script, code, isChanged: false } });
      } else {
        const tab = await emptyScript(template || "", target);
        dispatch({ type: "open", tab });
      }
    },
    [t]
  );

  // 初始化：列表就绪后根据 URL uuid 打开
  useEffect(() => {
    if (loadingList) return;
    const uuid = params.uuid;
    if (uuid) {
      if (uuid === stateRef.current.activeUuid) return;
      const known =
        stateRef.current.tabs.some((x) => x.uuid === uuid) || scriptListRef.current.some((s) => s.uuid === uuid);
      if (known) {
        void openScript(uuid, templateRef.current, targetRef.current);
      } else if (stateRef.current.tabs.length === 0) {
        void openScript(undefined, templateRef.current, targetRef.current);
      } else {
        notify.error(t("editor:script_not_found"));
      }
    } else if (stateRef.current.tabs.length === 0) {
      void openScript(undefined, templateRef.current, targetRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingList, params.uuid]);

  // 激活标签 → 同步 URL + 标题
  useEffect(() => {
    if (!state.activeUuid) return;
    if (params.uuid !== state.activeUuid) {
      void navigate(`/script/editor/${state.activeUuid}`, { replace: true });
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

  const activeTab = useMemo(() => state.tabs.find((x) => x.uuid === state.activeUuid), [state.tabs, state.activeUuid]);
  usePreloadResourcePane(activeTab?.uuid);
  usePreloadSettingsPane(activeTab?.uuid);
  usePreloadStoragePane(activeTab?.uuid);

  const preloadSubView = useCallback(
    (view: SubView) => {
      const uuid = stateRef.current.activeUuid;
      if (!uuid) return;
      const request =
        view === "storage" ? preloadStoragePane(uuid) : view === "setting" ? preloadSettingsPane(uuid) : null;
      void request?.catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify.error(`${t("script:operation_failed")}: ${error instanceof Error ? error.message : String(error)}`);
      });
    },
    [t]
  );

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
      if (wasLast) void openScript(undefined, templateRef.current, targetRef.current);
    },
    [confirm, openScript, t]
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
        notify.success(res.updated ? t("editor:save_success") : t("editor:create_success_note"));
        return res.script;
      } catch (err) {
        if (err instanceof Error && err.message === SAVE_CANCELED) return undefined;
        if (err instanceof Error && err.message === SAVE_EMPTY_NAME) {
          notify.error(t("editor:script_name_cannot_be_set_to_empty"));
          return undefined;
        }
        notify.error(`${t("editor:save_failed")}: ${err}`);
        return undefined;
      }
    },
    [askConfirm, scriptDAO, setScriptList, t]
  );

  const doSaveAs = useCallback(
    (script: Script, e: editor.ICodeEditor) => {
      chrome.downloads.download(
        {
          url: makeBlobURL({
            blob: new Blob([e.getValue()], { type: "text/javascript" }),
            persistence: false,
          }) as string,
          saveAs: true,
          filename: `${script.name}.user.js`,
        },
        () => {
          if (chrome.runtime.lastError) {
            notify.error(`${t("editor:save_as_failed")}: ${chrome.runtime.lastError.message}`);
          } else {
            notify.success(t("editor:save_as_success"));
          }
        }
      );
    },
    [t]
  );

  const doRun = useCallback(
    async (script: Script, e: editor.ICodeEditor) => {
      const saved = await doSave(script, e);
      if (!saved) return;
      if (saved.type === SCRIPT_TYPE_NORMAL) {
        notify.error(t("editor:only_background_scheduled_can_run"));
        return;
      }
      runtimeClient
        .runScript(saved.uuid)
        .then(() => notify.success(t("editor:build_success_message")))
        .catch((err) => notify.error(`${t("editor:build_failed")}: ${err}`));
    },
    [doSave, t]
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
          void e.getAction("actions.find")?.run();
          break;
        case "replace":
          void e.getAction("editor.action.startFindReplaceAction")?.run();
          break;
        case "selectAll":
          e.trigger("menu", "editor.action.selectAll", null);
          break;
        case "format": {
          const sel = e.getSelection();
          const id = sel && !sel.isEmpty() ? "editor.action.formatSelection" : "editor.action.formatDocument";
          void e.getAction(id)?.run();
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
        if (stateRef.current.tabs.some((x) => x.uuid === script.uuid)) void closeTab(script.uuid, true);
        notify.success(t("editor:delete_success"));
      } catch (err) {
        notify.error(`${t("editor:delete_failed")}: ${err}`);
      }
    },
    [confirm, closeTab, t]
  );

  // dispatch from useReducer is stable — zero deps needed
  const onActivateTab = useCallback((uuid: string) => dispatch({ type: "activate", uuid }), []);
  const onCloseOthersTab = useCallback((uuid: string) => dispatch({ type: "closeOthers", uuid }), []);
  const onCloseLeftTab = useCallback((uuid: string) => dispatch({ type: "closeLeft", uuid }), []);
  const onCloseRightTab = useCallback((uuid: string) => dispatch({ type: "closeRight", uuid }), []);
  const onNewTab = useCallback(() => void openScript(undefined, templateRef.current, targetRef.current), [openScript]);
  const onOpenScript = useCallback((uuid: string) => void openScript(uuid), [openScript]);
  const onBack = useCallback(() => navigate("/"), [navigate]);

  const openUuids = useMemo(() => new Set(state.tabs.map((x) => x.uuid)), [state.tabs]);
  const changedUuids = useMemo(() => new Set(state.tabs.filter((x) => x.isChanged).map((x) => x.uuid)), [state.tabs]);

  // 针对当前激活标签的动作（桌面工具栏 / 移动端共用）
  // 读取 stateRef 而非直接用 activeTab，避免对 activeTab 产生依赖，使这三个回调仅在操作函数本身变化时才更新
  const handleSaveActive = useCallback(() => {
    const uuid = stateRef.current.activeUuid;
    const e = uuid ? editorsRef.current.get(uuid) : undefined;
    const tab = stateRef.current.tabs.find((x) => x.uuid === uuid);
    if (e && tab) void doSave(tab.script, e);
  }, [doSave]);

  const handleSaveAsActive = useCallback(() => {
    const uuid = stateRef.current.activeUuid;
    const e = uuid ? editorsRef.current.get(uuid) : undefined;
    const tab = stateRef.current.tabs.find((x) => x.uuid === uuid);
    if (e && tab) doSaveAs(tab.script, e);
  }, [doSaveAs]);

  const handleRunActive = useCallback(() => {
    const uuid = stateRef.current.activeUuid;
    const e = uuid ? editorsRef.current.get(uuid) : undefined;
    const tab = stateRef.current.tabs.find((x) => x.uuid === uuid);
    if (e && tab) void doRun(tab.script, e);
  }, [doRun]);

  // 编辑区：所有标签常驻挂载，非激活隐藏以保留 Monaco 状态（桌面/移动共用）
  // useMemo 保证 children 引用稳定，使 MobileEditor 的 React.memo 能有效跳过渲染
  const editorArea = useMemo(
    () => (
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
    ),
    [state.tabs, state.activeUuid, subView, activeTab, doSave, doSaveAs, doRun]
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
          onBack={onBack}
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
            onOpen={onOpenScript}
            onDelete={onDelete}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <EditorTabs
              tabs={state.tabs}
              activeUuid={state.activeUuid}
              onActivate={onActivateTab}
              onClose={closeTab}
              onCloseOthers={onCloseOthersTab}
              onCloseLeft={onCloseLeftTab}
              onCloseRight={onCloseRightTab}
              onNew={onNewTab}
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
