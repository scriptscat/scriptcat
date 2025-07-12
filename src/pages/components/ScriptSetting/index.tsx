import type { Script } from "@App/app/repo/scripts";
import { ScriptDAO } from "@App/app/repo/scripts";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { Checkbox, Descriptions, Divider, Drawer, Empty, Input, Message } from "@arco-design/web-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Match from "./Match";
import PermissionManager from "./Permission";
import { scriptClient } from "@App/pages/store/features/script";

const ScriptSetting: React.FC<{
  script: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const scriptDAO = new ScriptDAO();
  const [checkUpdateUrl, setCheckUpdateUrl] = useState<string>("");
  const [checkUpdate, setCheckUpdate] = useState<boolean>(false);

  const { t } = useTranslation();

  useEffect(() => {
    if (script) {
      scriptDAO.get(script.uuid).then((v) => {
        setCheckUpdateUrl(v?.downloadUrl || "");
        setCheckUpdate(v?.checkUpdate === false ? false : true);
      });
    }
  }, [script]);

  return (
    <Drawer
      width={600}
      title={
        <span>
          {script?.name} {t("script_setting")}
        </span>
      }
      autoFocus={false}
      focusLock={false}
      visible={visible}
      onOk={() => {
        onOk();
      }}
      onCancel={() => {
        onCancel();
      }}
    >
      <Descriptions
        column={1}
        title={t("basic_info")}
        data={[
          {
            label: t("last_updated"),
            value: formatUnixTime((script?.updatetime || script?.createtime || 0) / 1000),
          },
          {
            label: "UUID",
            value: script?.uuid,
          },
        ]}
        style={{ marginBottom: 20 }}
        labelStyle={{ paddingRight: 36 }}
      />
      <Divider />
      {script && <Match script={script} />}
      <Descriptions
        column={1}
        title={t("update")}
        data={[
          {
            label: t("check_update"),
            value: (
              <Checkbox
                checked={checkUpdate}
                onChange={(val) => {
                  setCheckUpdate(val);
                  scriptClient.setCheckUpdateUrl(script.uuid, val, checkUpdateUrl).then(() => {
                    Message.success(t("update_success")!);
                  });
                }}
              />
            ),
          },
          {
            label: t("update_url"),
            value: (
              <Input
                value={checkUpdateUrl}
                onChange={(e) => {
                  setCheckUpdateUrl(e);
                }}
                onBlur={() => {
                  scriptClient.setCheckUpdateUrl(script.uuid, checkUpdate, checkUpdateUrl).then(() => {
                    Message.success(t("update_success")!);
                  });
                }}
              />
            ),
          },
        ]}
        style={{ marginBottom: 20 }}
        labelStyle={{ paddingRight: 36 }}
      />
      <Divider />
      {script && <PermissionManager script={script} />}
      <Empty description={t("under_construction")} />
    </Drawer>
  );
};

export default ScriptSetting;
