import { i18nName } from "@App/locales/locales";
import { Button, Input } from "@arco-design/web-react";
import Col from "@arco-design/web-react/es/Grid/col";
import { IconSearch } from "@arco-design/web-react/icon";
import { t } from "i18next";
import type { editor } from "monaco-editor";
import React, { useMemo } from "react";
import { type HotKey, type ScriptEditorScriptListProps } from "./ScriptEditor";
import { ScriptEditorScriptListEntry } from "./ScriptEditorScriptListEntry";
import type { Script, ScriptCodeDAO } from "@App/app/repo/scripts";
import { wScript } from "./shared";

export type ScriptEditorScriptListEntryActionProps = {
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

export const ScriptEditorScriptList = React.memo(function ScriptEditorScriptList({
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
}: ScriptEditorScriptListProps): React.ReactNode {
  const filterScriptList = useMemo(() => {
    return scriptList.filter((script) => {
      wScript(script);
      if (!searchKeyword) return true;
      return i18nName(script).toLowerCase().includes(searchKeyword.toLowerCase());
    });
  }, [scriptList, searchKeyword]);

  const actionProps = {
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
  } as ScriptEditorScriptListEntryActionProps;

  return (
    <Col span={4} className="h-full" style={{ overflowY: "scroll" }}>
      <div className="flex flex-col" style={{ backgroundColor: "var(--color-secondary)", overflow: "hidden" }}>
        <Button
          className="text-left"
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
          <div className="flex justify-between items-center">
            {t("installed_scripts")}
            <IconSearch style={{ cursor: "inherit" }} />
          </div>
        </Button>
        {showSearchInput && (
          <div className="p-2">
            <Input
              placeholder={t("search_scripts")}
              allowClear
              value={searchKeyword}
              onChange={setSearchKeyword}
              size="mini"
              id="editor_search_scripts_input"
            />
          </div>
        )}
        {filterScriptList.map((script) => (
          <ScriptEditorScriptListEntry
            key={`entry-${script.uuid}`}
            uuid={script.uuid}
            name={i18nName(script)}
            status={script.status}
            {...actionProps}
          />
        ))}
      </div>
    </Col>
  );
});
