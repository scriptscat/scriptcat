import type { Script } from "@App/app/repo/scripts";
import { ScriptDAO } from "@App/app/repo/scripts";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { Checkbox, Descriptions, Divider, Drawer, Input, Message, Select } from "@arco-design/web-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Match from "./Match";
import PermissionManager from "./Permission";
import { scriptClient } from "@App/pages/store/features/script";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";

const ScriptSetting: React.FC<{
  script: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const scriptDAO = new ScriptDAO();
  const [checkUpdateUrl, setCheckUpdateUrl] = useState<string>("");
  const [checkUpdate, setCheckUpdate] = useState<boolean>(false);
  const [scriptRunEnv, setScriptRunEnv] = useState<string>("all");

  const { t } = useTranslation();

  useEffect(() => {
    if (script) {
      scriptDAO.get(script.uuid).then((v) => {
        if (!v) {
          return;
        }
        setCheckUpdateUrl(v.downloadUrl || "");
        setCheckUpdate(v.checkUpdate === false ? false : true);
        let metadata = v.metadata;
        if (v.selfMetadata) {
          metadata = getCombinedMeta(metadata, v.selfMetadata);
        }
        setScriptRunEnv(metadata["run-in"]?.[0] || "all");
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
      <Descriptions
        column={1}
        title={t("script_setting")}
        data={[
          {
            label: t("script_run_env.title"),
            value: (
              <Select
                value={scriptRunEnv}
                options={[
                  { label: t("script_run_env.default"), value: "default" },
                  { label: t("script_run_env.all"), value: "all" },
                  { label: t("script_run_env.normal-tabs"), value: "normal-tabs" },
                  { label: t("script_run_env.incognito-tabs"), value: "incognito-tabs" },
                ]}
                onChange={(value) => {
                  setScriptRunEnv(value);
                  scriptClient.updateMetadata(script.uuid, "run-in", value === "default" ? [] : [value]).then(() => {
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
    </Drawer>
  );
};

export default ScriptSetting;
