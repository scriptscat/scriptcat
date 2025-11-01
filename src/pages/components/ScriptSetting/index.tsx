import type { Script } from "@App/app/repo/scripts";
import { ScriptDAO } from "@App/app/repo/scripts";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { Checkbox, Descriptions, Divider, Drawer, Input, InputTag, Message, Select, Tag } from "@arco-design/web-react";
import type { ReactNode } from "react";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Match from "./Match";
import PermissionManager from "./Permission";
import { scriptClient } from "@App/pages/store/features/script";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import { parseTags } from "@App/app/repo/metadata";
import { hashColor } from "@App/pages/options/routes/utils";

const tagRender: React.FC<{ value: any; label: ReactNode; closable: boolean; onClose: (event: any) => void }> = (
  props
) => {
  const { label, value, closable, onClose } = props;
  return (
    <Tag color={hashColor(value)} closable={closable} onClose={onClose} style={{ margin: "2px 6px 2px 0" }}>
      {label}
    </Tag>
  );
};

const ScriptSetting: React.FC<{
  script: Script | undefined;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const [scriptTags, setScriptTags] = useState<string[]>([]);
  const [checkUpdateUrl, setCheckUpdateUrl] = useState<string>("");
  const [checkUpdate, setCheckUpdate] = useState<boolean>(false);
  const [scriptRunEnv, setScriptRunEnv] = useState<string>("all");
  const [scriptRunAt, setScriptRunAt] = useState<string>("default");

  const { t } = useTranslation();

  const scriptSettingData = useMemo(() => {
    if (!script) {
      return [];
    }
    const ret = [
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
      {
        label: t("script_run_at.title"),
        value: (
          <Select
            value={scriptRunAt}
            options={[
              { label: t("script_run_env.default"), value: "default" },
              { label: "document-start", value: "document-start" },
              { label: "document-body", value: "document-body" },
              { label: "document-end", value: "document-end" },
              { label: "document-idle", value: "document-idle" },
              { label: "early-start", value: "early-start" },
            ]}
            onChange={(value) => {
              setScriptRunAt(value);
              const earlyStart: string[] = [];
              const runAt: string[] = [];
              if (value === "early-start") {
                earlyStart.push("");
                runAt.push("document-start");
              } else if (value !== "default") {
                runAt.push(value);
              }
              Promise.all([
                scriptClient.updateMetadata(script.uuid, "early-start", earlyStart),
                scriptClient.updateMetadata(script.uuid, "run-at", runAt),
              ]).then(() => {
                Message.success(t("update_success")!);
              });
            }}
          />
        ),
      },
    ];
    return ret;
  }, [script, scriptRunEnv, scriptRunAt, t]);

  useEffect(() => {
    if (script) {
      const scriptDAO = new ScriptDAO();
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
        setScriptRunEnv(metadata["run-in"]?.[0] || "default");
        let runAt = metadata["run-at"]?.[0] || "default";
        if (runAt === "document-start" && metadata["early-start"] && metadata["early-start"].length > 0) {
          runAt = "early-start";
        }
        setScriptRunAt(runAt);
        setScriptTags(parseTags(metadata) || []);
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
          {
            label: t("tags"),
            value: (
              <InputTag
                allowClear
                placeholder={t("input_tags_placeholder")}
                value={scriptTags}
                renderTag={tagRender}
                style={{ maxWidth: 350 }}
                onChange={(tags) => {
                  setScriptTags(tags);
                  scriptClient.updateMetadata(script!.uuid, "tag", tags).then(() => {
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
      <Descriptions
        column={1}
        title={t("script_setting")}
        data={scriptSettingData}
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
                  scriptClient.setCheckUpdateUrl(script!.uuid, val, checkUpdateUrl).then(() => {
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
                  scriptClient.setCheckUpdateUrl(script!.uuid, checkUpdate, checkUpdateUrl).then(() => {
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
