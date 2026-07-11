import { SettingsLayout } from "../../layout/SettingsLayout";
import { getSettingCategories } from "./categories";
import { GeneralSection } from "./sections/GeneralSection";
import { InterfaceSection } from "./sections/InterfaceSection";
import { SyncSection } from "./sections/SyncSection";
import { UpdateSection } from "./sections/UpdateSection";
import { RuntimeSection } from "./sections/RuntimeSection";
import { SecuritySection } from "./sections/SecuritySection";
import { DeveloperSection } from "./sections/DeveloperSection";
import { useTranslation } from "react-i18next";

export default function Setting() {
  const { t } = useTranslation();
  return (
    <SettingsLayout title={t("settings")} categories={getSettingCategories(t)}>
      {(register) => (
        <>
          <GeneralSection register={register} />
          <InterfaceSection register={register} />
          <SyncSection register={register} />
          <UpdateSection register={register} />
          <RuntimeSection register={register} />
          <SecuritySection register={register} />
          <DeveloperSection register={register} />
        </>
      )}
    </SettingsLayout>
  );
}
