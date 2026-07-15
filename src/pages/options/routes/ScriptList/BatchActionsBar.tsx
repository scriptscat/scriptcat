import { useTranslation } from "react-i18next";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import SelectionBar, { SelectionBarButton } from "./SelectionBar";

export interface BatchActionsBarProps {
  selectedCount: number;
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
  onBatchEnable,
  onBatchDisable,
  onBatchExport,
  onBatchDelete,
  onBatchPinTop,
  onBatchCheckUpdate,
  onClose,
}: BatchActionsBarProps) {
  const { t } = useTranslation();

  return (
    <SelectionBar selectedCount={selectedCount} onClose={onClose}>
      <SelectionBarButton color="primary" onClick={onBatchEnable}>
        {t("enable")}
      </SelectionBarButton>
      <SelectionBarButton color="muted" onClick={onBatchDisable}>
        {t("disable")}
      </SelectionBarButton>
      <SelectionBarButton color="muted" onClick={onBatchExport}>
        {t("export")}
      </SelectionBarButton>
      <Popconfirm
        description={t("script:confirm_delete_scripts_content", { count: selectedCount })}
        destructive
        confirmText={t("delete")}
        cancelText={t("editor:cancel")}
        onConfirm={onBatchDelete}
      >
        <SelectionBarButton color="destructive">{t("delete")}</SelectionBarButton>
      </Popconfirm>
      <SelectionBarButton color="muted" onClick={onBatchPinTop}>
        {t("pin_to_top")}
      </SelectionBarButton>
      <SelectionBarButton color="muted" onClick={onBatchCheckUpdate}>
        {t("check_update")}
      </SelectionBarButton>
    </SelectionBar>
  );
}
