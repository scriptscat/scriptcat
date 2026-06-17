import { SettingsLayout } from "../../layout/SettingsLayout";
import { TOOLS_CATEGORIES } from "./categories";
import { LocalBackupSection } from "./sections/LocalBackupSection";
import { CloudBackupSection } from "./sections/CloudBackupSection";
import { AutoBackupSection } from "./sections/AutoBackupSection";
import { MigrationSection } from "./sections/MigrationSection";
import { DevToolsSection } from "./sections/DevToolsSection";
import { t } from "@App/locales/locales";

export default function Tools() {
  return (
    <SettingsLayout title={t("tools")} categories={TOOLS_CATEGORIES}>
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
