import React, { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Input,
  Message,
  Select,
  Space,
} from "@arco-design/web-react";
import FileSystemParams from "@App/pages/components/FileSystemParams";
import { SystemConfig } from "@App/pkg/config/config";
import IoC from "@App/app/ioc";
import FileSystemFactory, { FileSystemType } from "@Pkg/filesystem/factory";
import Title from "@arco-design/web-react/es/Typography/title";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";
// eslint-disable-next-line import/no-extraneous-dependencies, import/no-import-module-exports
import { format } from "prettier";
// eslint-disable-next-line import/no-extraneous-dependencies, import/no-import-module-exports
import babel from "prettier/parser-babel";
import GMApiSetting from "@App/pages/components/GMApiSetting";
import i18n from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import Logger from "@App/app/logger/logger";

function Setting() {
  const systemConfig = IoC.instance(SystemConfig) as SystemConfig;
  const [syncDelete, setSyncDelete] = useState<boolean>(
    systemConfig.cloudSync.syncDelete
  );
  const [enableCloudSync, setEnableCloudSync] = useState(
    systemConfig.cloudSync.enable
  );
  const [fileSystemType, setFilesystemType] = useState<FileSystemType>(
    systemConfig.cloudSync.filesystem
  );
  const [fileSystemParams, setFilesystemParam] = useState<{
    [key: string]: any;
  }>(systemConfig.cloudSync.params[fileSystemType] || {});
  const [language, setLanguage] = useState(i18n.language);
  const languageList: { key: string; title: string }[] = [];
  const { t } = useTranslation();
  Object.keys(i18n.store.data).forEach((key) => {
    if (key === "ach-UG") {
      return;
    }
    languageList.push({
      key,
      title: i18n.store.data[key].title as string,
    });
  });
  languageList.push({
    key: "help",
    title: t("help_translate"),
  });

  return (
    <Space
      className="setting"
      direction="vertical"
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        position: "relative",
      }}
    >
      <Card title={t("general")} bordered={false}>
        <Space direction="vertical">
          <Space>
            <span>{t("language")}:</span>
            <Select
              value={language}
              className="w-24"
              onChange={(value) => {
                if (value === "help") {
                  window.open(
                    "https://crowdin.com/project/scriptcat",
                    "_blank"
                  );
                  return;
                }
                setLanguage(value);
                i18n.changeLanguage(value);
                dayjs.locale(value.toLocaleLowerCase());
                localStorage.language = value;
                Message.success(t("language_change_tip")!);
              }}
            >
              {languageList.map((item) => (
                <Select.Option key={item.key} value={item.key}>
                  {item.title}
                </Select.Option>
              ))}
            </Select>
          </Space>
          <Space>
            {t("menu_expand_num_before")}:
            <Input
              style={{ width: "64px" }}
              type="number"
              defaultValue={systemConfig.menuExpandNum.toString()}
              onChange={(val) => {
                systemConfig.menuExpandNum = parseInt(val, 10);
              }}
            />
            {t("menu_expand_num_after")}
          </Space>
        </Space>
      </Card>
      <Card className="sync" title={t("script_sync")} bordered={false}>
        <Space direction="vertical">
          <Checkbox
            checked={syncDelete}
            onChange={(checked) => {
              setSyncDelete(checked);
            }}
          >
            {t("sync_delete")}
          </Checkbox>
          <FileSystemParams
            preNode={
              <Checkbox
                checked={enableCloudSync}
                onChange={(checked) => {
                  setEnableCloudSync(checked);
                }}
              >
                {t("enable_script_sync_to")}
              </Checkbox>
            }
            actionButton={[
              <Button
                key="save"
                type="primary"
                onClick={async () => {
                  // Save to the configuration
                  // Perform validation if enabled
                  if (enableCloudSync) {
                    Message.info(t("cloud_sync_account_verification")!);
                    try {
                      await FileSystemFactory.create(
                        fileSystemType,
                        fileSystemParams
                      );
                    } catch (e) {
                      Message.error(
                        `${t(
                          "cloud_sync_verification_failed"
                        )}: ${JSON.stringify(Logger.E(e))}`
                      );
                      return;
                    }
                  }
                  const params = { ...systemConfig.backup.params };
                  params[fileSystemType] = fileSystemParams;
                  systemConfig.cloudSync = {
                    enable: enableCloudSync,
                    syncDelete,
                    filesystem: fileSystemType,
                    params,
                  };
                  Message.success(t("save_success")!);
                }}
              >
                {t("save")}
              </Button>,
            ]}
            fileSystemType={fileSystemType}
            fileSystemParams={fileSystemParams}
            onChangeFileSystemType={(type) => {
              setFilesystemType(type);
            }}
            onChangeFileSystemParams={(params) => {
              setFilesystemParam(params);
            }}
          />
        </Space>
      </Card>
      <Card title={t("update")} bordered={false}>
        <Space direction="vertical">
          <Space>
            <span>{t("script_subscription_check_interval")}:</span>
            <Select
              defaultValue={systemConfig.checkScriptUpdateCycle.toString()}
              style={{
                width: 120,
              }}
              onChange={(value) => {
                systemConfig.checkScriptUpdateCycle = parseInt(value, 10);
              }}
            >
              <Select.Option value="0">{t("never")}</Select.Option>
              <Select.Option value="21600">{t("6_hours")}</Select.Option>
              <Select.Option value="43200">{t("12_hours")}</Select.Option>
              <Select.Option value="86400">{t("every_day")}</Select.Option>
              <Select.Option value="604800">{t("every_week")}</Select.Option>
            </Select>
          </Space>
          <Checkbox
            onChange={(checked) => {
              systemConfig.updateDisableScript = checked;
            }}
            defaultChecked={systemConfig.updateDisableScript}
          >
            {t("update_disabled_scripts")}
          </Checkbox>
          <Checkbox
            onChange={(checked) => {
              systemConfig.silenceUpdateScript = checked;
            }}
            defaultChecked={systemConfig.silenceUpdateScript}
          >
            {t("silent_update_non_critical_changes")}
          </Checkbox>
        </Space>
      </Card>
      <GMApiSetting />
      <Card title="ESLint" bordered={false}>
        <Space direction="vertical" className="w-full">
          <Checkbox
            onChange={(checked) => {
              systemConfig.enableEslint = checked;
            }}
            defaultChecked={systemConfig.enableEslint}
          >
            {t("enable_eslint")}
          </Checkbox>
          <Title heading={5}>
            {t("eslint_rules")}{" "}
            <Button
              type="text"
              style={{
                height: 24,
              }}
              icon={
                <IconQuestionCircleFill
                  style={{
                    margin: 0,
                  }}
                />
              }
              href="https://eslint.org/play/"
              target="_blank"
              iconOnly
            />
          </Title>
          <Input.TextArea
            placeholder={t("enter_eslint_rules")!}
            autoSize={{
              minRows: 4,
              maxRows: 8,
            }}
            defaultValue={format(systemConfig.eslintConfig, {
              parser: "json",
              plugins: [babel],
            })}
            onBlur={(v) => {
              systemConfig.eslintConfig = v.target.value;
            }}
          />
        </Space>
      </Card>
    </Space>
  );
}

export default Setting;
