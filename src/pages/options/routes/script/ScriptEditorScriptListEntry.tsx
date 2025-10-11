import LoggerCore from "@App/app/logger/core";
import { scriptClient } from "@App/pages/store/features/script";
import { Button, Message } from "@arco-design/web-react";
import { IconBulb, IconDelete } from "@arco-design/web-react/icon";
import { t } from "i18next";
import { editor } from "monaco-editor";
import React from "react";
import Logger from "@App/app/logger/logger";
import { type ScriptEditorScriptListEntryActionProps } from "./ScriptEditorScriptList";
import { wScript } from "./shared";
import { type SCRIPT_STATUS, SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";

export const ScriptEditorScriptListEntry = React.memo(function ScriptEditorScriptListEntry({
  uuid,
  name,
  status,
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
}: {
  uuid: string;
  name: string;
  status: SCRIPT_STATUS;
} & ScriptEditorScriptListEntryActionProps): React.ReactNode {
  const isEnabled = status === SCRIPT_STATUS_ENABLE;
  return (
    <div key={`s_${uuid}`} className="relative group" style={{ overflow: "hidden" }}>
      <Button
        size="mini"
        className="text-left w-full"
        id={`editor-script-uuid-${uuid}`}
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          backgroundColor: selectSciptButtonAndTab === uuid ? "gray" : "",
          paddingRight: 32,
        }}
        onClick={() => {
          setSelectSciptButtonAndTab(uuid);
          if (modelMapRef.current.has(uuid)) {
            switchToUuid(uuid);
            return;
          }
          scriptCodeDAO.findByUUID(uuid).then((code) => {
            if (!code) return;
            const mdl = editor.createModel(code.code, "javascript");
            modelMapRef.current.set(uuid, mdl);
            setEditors((prev) =>
              prev.some((e) => e.script.uuid === uuid)
                ? prev
                : [...prev, { script: wScript(uuid), code: code.code, hotKeys, isChanged: false }]
            );
            switchToUuid(uuid);
          });
        }}
      >
        <span className="overflow-hidden text-ellipsis">{name}</span>
      </Button>
      {/* 開關按钮，只在鼠标悬停时显示 */}
      <Button
        type="text"
        icon={<IconBulb />}
        iconOnly
        size="mini"
        className="absolute right-1 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          width: "20px",
          height: "20px",
          minWidth: "20px",
          border: "none",
          background: "transparent",
          color: isEnabled ? "var(--color-data-11)" : "var(--color-text-2)",
          boxShadow: "none",
          paddingRight: "32px", // 为删除按钮留出空间
        }}
        onClick={(e) => {
          const doDisable = isEnabled;
          e.stopPropagation();
          scriptClient
            .enables([uuid], doDisable ? false : true)
            .then(() => {
              setScriptList((prev) =>
                prev.map((item) =>
                  item.uuid === uuid
                    ? { ...item, status: doDisable ? SCRIPT_STATUS_DISABLE : SCRIPT_STATUS_ENABLE }
                    : item
                )
              );
              Message.success(t(doDisable ? "disable_script_success" : "enable_script_success"));
            })
            .catch((err) => {
              LoggerCore.logger(Logger.E(err)).debug(doDisable ? "disable script failed" : "enable script failed");
              Message.error(`${t(doDisable ? "disable_script_failed" : "enable_script_failed")}: ${err}`);
            });
        }}
      />
      {/* 删除按钮，只在鼠标悬停时显示 */}
      <Button
        type="text"
        icon={<IconDelete />}
        iconOnly
        size="mini"
        className="absolute right-1 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          width: 20,
          height: 20,
          minWidth: 20,
          border: "none",
          background: "transparent",
          color: "var(--color-text-2)",
          boxShadow: "none",
        }}
        onClick={(e) => {
          e.stopPropagation();
          modalConfirm({
            title: t("confirm_delete_script"),
            content: t("confirm_delete_script_content", { name: name }),
            onOk: () => {
              scriptClient
                .deletes([uuid])
                .then(() => {
                  setScriptList((prev) => prev.filter((s) => s.uuid !== uuid));
                  handleDeleteEditor(uuid);
                  if (selectSciptButtonAndTab === uuid) setSelectSciptButtonAndTab("");
                  Message.success(t("delete_success"));
                })
                .catch((err) => {
                  LoggerCore.logger(Logger.E(err)).debug("delete script error");
                  Message.error(`${t("delete_failed")}: ${err}`);
                });
            },
          });
        }}
      />
    </div>
  );
});
