import { SettingsLayout } from "../../layout/SettingsLayout";
import { SETTING_CATEGORIES } from "./categories";
import { GeneralSection } from "./sections/GeneralSection";
import { InterfaceSection } from "./sections/InterfaceSection";
import { t } from "@App/locales/locales";

export default function Setting() {
  return (
    <SettingsLayout title={t("settings")} categories={SETTING_CATEGORIES}>
      {(register) => (
        <>
          <GeneralSection register={register} />
          <InterfaceSection register={register} />
          {/* Task 6/7 追加 Sync/Update/Runtime/Security/Developer */}
        </>
      )}
    </SettingsLayout>
  );
}
