import { useTranslation } from "react-i18next";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";
import SelectionBar, { SelectionBarButton } from "./SelectionBar";

export interface BatchActionsBarProps {
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onBatchEnable: () => void;
  onBatchDisable: () => void;
  onBatchExport: () => void;
  onBatchDelete: () => void;
  onBatchPinTop: () => void;
  onBatchCheckUpdate: () => void;
  onClose: () => void;
}

export default function BatchActionsBar({
  selectedCount,
  allSelected,
  onToggleSelectAll,
  onBatchEnable,
  onBatchDisable,
  onBatchExport,
  onBatchDelete,
  onBatchPinTop,
  onBatchCheckUpdate,
  onClose,
}: BatchActionsBarProps) {
  const { t } = useTranslation();
  const [trashEnabled] = useSystemConfig("trash_enabled");

  return (
    <SelectionBar
      selectedCount={selectedCount}
      allSelected={allSelected}
      onToggleSelectAll={onToggleSelectAll}
      onClose={onClose}
    >
      <SelectionBarButton color="primary" onClick={onBatchEnable}>
        {t("enable")}
      </SelectionBarButton>
      <SelectionBarButton color="muted" onClick={onBatchDisable}>
        {t("disable")}
      </SelectionBarButton>
      <SelectionBarButton color="muted" onClick={onBatchExport}>
        {t("export")}
      </SelectionBarButton>
      {/* 回收站开启时删除可由撤销 toast 和回收站找回，不再二次确认；关闭或配置尚未读到时按不可撤销处理，先确认 */}
      {trashEnabled === true ? (
        <SelectionBarButton color="destructive" onClick={onBatchDelete}>
          {t("delete")}
        </SelectionBarButton>
      ) : (
        <Popconfirm
          description={t("script:confirm_delete_scripts_content", { count: selectedCount })}
          destructive
          confirmText={t("delete")}
          cancelText={t("editor:cancel")}
          onConfirm={onBatchDelete}
        >
          <SelectionBarButton color="destructive">{t("delete")}</SelectionBarButton>
        </Popconfirm>
      )}
      <SelectionBarButton color="muted" onClick={onBatchPinTop}>
        {t("pin_to_top")}
      </SelectionBarButton>
      <SelectionBarButton color="muted" onClick={onBatchCheckUpdate}>
        {t("check_update")}
      </SelectionBarButton>
    </SelectionBar>
  );
}
