import { useEffect, useState } from "react";
import { Button, Card, Checkbox, Input, Message, Select, Space } from "@arco-design/web-react";
import Title from "@arco-design/web-react/es/Typography/title";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";
import prettier from "prettier/standalone";
import * as babel from "prettier/parser-babel";
import prettierPluginEstree from "prettier/plugins/estree";
import GMApiSetting from "@App/pages/components/GMApiSetting";
import i18n from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import Logger from "@App/app/logger/logger";
import FileSystemFactory, { FileSystemType } from "@Packages/filesystem/factory";
import FileSystemParams from "@App/pages/components/FileSystemParams";
import { systemConfig } from "@App/pages/store/global";

function Setting() {
  const [syncDelete, setSyncDelete] = useState<boolean>();
  const [enableCloudSync, setEnableCloudSync] = useState<boolean>();
  const [fileSystemType, setFilesystemType] = useState<FileSystemType>("webdav");
  const [fileSystemParams, setFilesystemParam] = useState<{
    [key: string]: any;
  }>({});
  const [language, setLanguage] = useState(i18n.language);
  const [menuExpandNum, setMenuExpandNum] = useState(5);
  const [checkScriptUpdateCycle, setCheckScriptUpdateCycle] = useState(0);
  const [updateDisableScript, setUpdateDisableScript] = useState(false);
  const [silenceUpdateScript, setSilenceUpdateScript] = useState(false);
  const [enableEslint, setEnableEslint] = useState(false);
  const [eslintConfig, setEslintConfig] = useState("");
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

  useEffect(() => {
    const loadConfigs = async () => {
      const [
        cloudSync,
        menuExpandNum,
        checkCycle,
        updateDisabled,
        silenceUpdate,
        eslintConfig,
        enableEslint,
        language,
      ] = await Promise.all([
        systemConfig.getCloudSync(),
        systemConfig.getMenuExpandNum(),
        systemConfig.getCheckScriptUpdateCycle(),
        systemConfig.getUpdateDisableScript(),
        systemConfig.getSilenceUpdateScript(),
        systemConfig.getEslintConfig(),
        systemConfig.getEnableEslint(),
        systemConfig.getLanguage(),
      ]);

      setSyncDelete(cloudSync.syncDelete);
      setEnableCloudSync(cloudSync.enable);
      setFilesystemType(cloudSync.filesystem);
      setFilesystemParam(cloudSync.params[cloudSync.filesystem] || {});
      setMenuExpandNum(menuExpandNum);
      setCheckScriptUpdateCycle(checkCycle);
      setUpdateDisableScript(updateDisabled);
      setSilenceUpdateScript(silenceUpdate);
      setEslintConfig(eslintConfig);
      setEnableEslint(enableEslint);
      setLanguage(language);
    };

    loadConfigs();
  }, []);

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
                  window.open("https://crowdin.com/project/scriptcat", "_blank");
                  return;
                }
                setLanguage(value);
                systemConfig.setLanguage(value);
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
              value={menuExpandNum.toString()}
              onChange={(val) => {
                const num = parseInt(val, 10);
                setMenuExpandNum(num);
                systemConfig.setMenuExpandNum(num);
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
                      await FileSystemFactory.create(fileSystemType, fileSystemParams);
                    } catch (e) {
                      Message.error(`${t("cloud_sync_verification_failed")}: ${JSON.stringify(Logger.E(e))}`);
                      return;
                    }
                  }
                  const cloudSync = await systemConfig.getCloudSync();
                  const params = { ...cloudSync.params };
                  params[fileSystemType] = fileSystemParams;
                  systemConfig.setCloudSync({
                    enable: enableCloudSync || false,
                    syncDelete: syncDelete || false,
                    filesystem: fileSystemType,
                    params,
                  });
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
              value={checkScriptUpdateCycle.toString()}
              style={{
                width: 120,
              }}
              onChange={(value) => {
                const num = parseInt(value, 10);
                setCheckScriptUpdateCycle(num);
                systemConfig.setCheckScriptUpdateCycle(num);
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
              setEnableCloudSync(checked);
              systemConfig.setUpdateDisableScript(checked);
            }}
            checked={updateDisableScript}
          >
            {t("update_disabled_scripts")}
          </Checkbox>
          <Checkbox
            onChange={(checked) => {
              setSilenceUpdateScript(checked);
              systemConfig.setSilenceUpdateScript(checked);
            }}
            checked={silenceUpdateScript}
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
              setEnableEslint(checked);
              systemConfig.setEnableEslint(checked);
            }}
            checked={enableEslint}
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
            value={eslintConfig}
            onChange={(v) => {
              setEslintConfig(v);
            }}
            onBlur={(v) => {
              prettier
                .format(eslintConfig, {
                  parser: "json",
                  plugins: [prettierPluginEstree, babel],
                })
                .then((res) => {
                  systemConfig.setEslintConfig(v.target.value);
                })
                .catch((e) => {
                  Message.error(`${t("eslint_config_format_error")}: ${JSON.stringify(Logger.E(e))}`);
                });
            }}
          />
        </Space>
      </Card>
    </Space>
  );
}

export default Setting;
