import { SettingsLayout } from "../../layout/SettingsLayout";
import { SETTING_CATEGORIES } from "./categories";
import { GeneralSection } from "./sections/GeneralSection";
import { InterfaceSection } from "./sections/InterfaceSection";
import { SyncSection } from "./sections/SyncSection";
import { UpdateSection } from "./sections/UpdateSection";
import { RuntimeSection } from "./sections/RuntimeSection";
import { t } from "@App/locales/locales";

export default function Setting() {
  return (
    <SettingsLayout title={t("settings")} categories={SETTING_CATEGORIES}>
      {(register) => (
        <>
          <GeneralSection register={register} />
          <InterfaceSection register={register} />
          <SyncSection register={register} />
          <UpdateSection register={register} />
          <RuntimeSection register={register} />
          {/* Task 7 追加 Security/Developer */}
        </>
      )}
    </SettingsLayout>
  );
}
