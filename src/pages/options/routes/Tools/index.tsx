import { SettingsLayout } from "../../layout/SettingsLayout";
import { getToolsCategories } from "./categories";
import { LocalBackupSection } from "./sections/LocalBackupSection";
import { CloudBackupSection } from "./sections/CloudBackupSection";
import { AutoBackupSection } from "./sections/AutoBackupSection";
import { MigrationSection } from "./sections/MigrationSection";
import { DevToolsSection } from "./sections/DevToolsSection";
import { useTranslation } from "react-i18next";

export default function Tools() {
  const { t } = useTranslation();
  return (
    <SettingsLayout title={t("tools")} categories={getToolsCategories(t)}>
      {(register) => (
        <>
          <LocalBackupSection register={register} />
          <CloudBackupSection register={register} />
          <AutoBackupSection register={register} />
          <MigrationSection register={register} />
          <DevToolsSection register={register} />
        </>
      )}
    </SettingsLayout>
  );
}
