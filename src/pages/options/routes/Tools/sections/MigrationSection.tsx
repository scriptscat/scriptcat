import { SettingCard } from "../../../components/SettingCard";
import { Button } from "@App/pages/components/ui/button";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { SystemClient } from "@App/app/service/service_worker/client";
import { message } from "@App/pages/store/global";
import { notify } from "@App/pages/components/ui/toast";
import { useTranslation } from "react-i18next";

export function MigrationSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const migrate = () =>
    new SystemClient(message).migrateToChromeStorage().catch((e) => notify.error(`${t("error")}: ${e}`));
  return (
    <SettingCard
      id="data-migration"
      title={t("tools:data_migration")}
      description={t("settings:migration_confirm_message")}
      register={register}
    >
      <div>
        <Popconfirm
          description={t("settings:migration_confirm_message")}
          confirmText={t("confirm")}
          cancelText={t("editor:cancel")}
          onConfirm={migrate}
        >
          <Button data-testid="retry_migration" size="sm">
            {t("settings:retry_migration")}
          </Button>
        </Popconfirm>
      </div>
    </SettingCard>
  );
}
