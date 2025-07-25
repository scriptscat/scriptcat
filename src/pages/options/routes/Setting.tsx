import { useEffect, useState } from "react";
import { Button, Card, Checkbox, ColorPicker, Input, Message, Select, Space } from "@arco-design/web-react";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";
import prettier from "prettier/standalone";
import * as babel from "prettier/parser-babel";
import prettierPluginEstree from "prettier/plugins/estree";
import GMApiSetting from "@App/pages/components/GMApiSetting";
import { systemConfig } from "@App/pages/store/global";
import i18n from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import Logger from "@App/app/logger/logger";
import type { FileSystemType } from "@Packages/filesystem/factory";
import FileSystemFactory from "@Packages/filesystem/factory";
import FileSystemParams from "@App/pages/components/FileSystemParams";
import { parsePatternMatchesURL } from "@App/pkg/utils/match";

function Setting() {
  const [syncDelete, setSyncDelete] = useState<boolean>();
  const [syncScriptStatus, setSyncScriptStatus] = useState<boolean>();
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
  const [blacklist, setBlacklist] = useState<string>("");
  const [badgeNumberType, setBadgeNumberType] = useState<"none" | "run_count" | "script_count">("run_count");
  const [badgeBackgroundColor, setBadgeBackgroundColor] = useState("#4e5969");
  const [badgeTextColor, setBadgeTextColor] = useState("#ffffff");
  const [scriptMenuDisplayType, setScriptMenuDisplayType] = useState<"none" | "no_browser" | "all">("all");
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
        blacklist,
        badgeNumberType,
        badgeBackgroundColor,
        badgeTextColor,
        scriptMenuDisplayType,
      ] = await Promise.all([
        systemConfig.getCloudSync(),
        systemConfig.getMenuExpandNum(),
        systemConfig.getCheckScriptUpdateCycle(),
        systemConfig.getUpdateDisableScript(),
        systemConfig.getSilenceUpdateScript(),
        systemConfig.getEslintConfig(),
        systemConfig.getEnableEslint(),
        systemConfig.getLanguage(),
        systemConfig.getBlacklist(),
        systemConfig.getBadgeNumberType(),
        systemConfig.getBadgeBackgroundColor(),
        systemConfig.getBadgeTextColor(),
        systemConfig.getScriptMenuDisplayType(),
      ]);

      setSyncDelete(cloudSync.syncDelete);
      setSyncScriptStatus(cloudSync.syncStatus);
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
      setBlacklist(blacklist);
      setBadgeNumberType(badgeNumberType);
      setBadgeBackgroundColor(badgeBackgroundColor);
      setBadgeTextColor(badgeTextColor);
      setScriptMenuDisplayType(scriptMenuDisplayType);
    };

    loadConfigs();
  }, []);

  return (
    <Space className="setting w-full h-full overflow-auto relative" direction="vertical">
      {/* 基本设置 */}
      <Card title={t("general")} bordered={false}>
        <div className="flex items-center justify-between min-h-10">
          <div className="flex items-center gap-4 flex-1">
            <span className="min-w-20 font-medium">{t("language")}</span>
            <Select
              value={language}
              className="w-50 max-w-75"
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
          </div>
          <span className="text-xs ml-6 flex-shrink-0">{t("select_interface_language")}</span>
        </div>
      </Card>

      {/* 界面外观 */}
      <Card title={t("interface_settings")} bordered={false}>
        <Space direction="vertical" size={16} className="w-full">
          {/* 扩展图标徽标 */}
          <div>
            <div className="text-sm font-medium mb-3">{t("extension_icon_badge")}</div>
            <Space direction="vertical" size={12} className="w-full">
              <div className="flex items-center justify-between min-h-9">
                <div className="flex items-center gap-4 flex-1">
                  <span className="min-w-20">{t("display_type")}</span>
                  <Select
                    value={badgeNumberType}
                    className="w-40 max-w-50"
                    onChange={(value) => {
                      setBadgeNumberType(value);
                      systemConfig.setBadgeNumberType(value);
                    }}
                  >
                    <Select.Option value="none">{t("badge_type_none")}</Select.Option>
                    <Select.Option value="run_count">{t("badge_type_run_count")}</Select.Option>
                    <Select.Option value="script_count">{t("badge_type_script_count")}</Select.Option>
                  </Select>
                </div>
                <span className="text-xs ml-6 flex-shrink-0">{t("extension_icon_badge_type")}</span>
              </div>
              <div className="flex items-center justify-between min-h-9">
                <div className="flex items-center gap-4 flex-1">
                  <span className="min-w-20">{t("background_color")}</span>
                  <ColorPicker
                    value={badgeBackgroundColor}
                    onChange={(value) => {
                      const colorValue = typeof value === "string" ? value : value[0]?.color || "#4e5969";
                      setBadgeBackgroundColor(colorValue);
                      systemConfig.setBadgeBackgroundColor(colorValue);
                    }}
                    showText
                    disabledAlpha
                    className="w-50 max-w-62.5"
                  />
                </div>
                <span className="text-xs ml-6 flex-shrink-0">{t("badge_background_color_desc")}</span>
              </div>
              <div className="flex items-center justify-between min-h-9">
                <div className="flex items-center gap-4 flex-1">
                  <span className="min-w-20">{t("text_color")}</span>
                  <ColorPicker
                    value={badgeTextColor}
                    onChange={(value) => {
                      const colorValue = typeof value === "string" ? value : value[0]?.color || "#ffffff";
                      setBadgeTextColor(colorValue);
                      systemConfig.setBadgeTextColor(colorValue);
                    }}
                    showText
                    disabledAlpha
                    className="w-50 max-w-62.5"
                  />
                </div>
                <span className="text-xs ml-6 flex-shrink-0">{t("badge_text_color_desc")}</span>
              </div>
            </Space>
          </div>

          {/* 脚本菜单 */}
          <div>
            <div className="text-sm font-medium mb-3">{t("script_menu")}</div>
            <Space direction="vertical" size={12} className={"w-full"}>
              <div className="flex items-center justify-between min-h-9">
                <div className="flex items-center gap-4 flex-1">
                  <span className="min-w-20">{t("menu_display")}</span>
                  <Select
                    value={scriptMenuDisplayType}
                    className="w-45 max-w-55"
                    onChange={(value) => {
                      setScriptMenuDisplayType(value);
                      systemConfig.setScriptMenuDisplayType(value);
                    }}
                  >
                    <Select.Option value="none">{t("menu_display_none")}</Select.Option>
                    <Select.Option value="no_browser">{t("menu_display_no_browser")}</Select.Option>
                    <Select.Option value="all">{t("menu_display_all")}</Select.Option>
                  </Select>
                </div>
                <span className="text-xs ml-6 flex-shrink-0">{t("control_menu_display_position")}</span>
              </div>
              <div className="flex items-center justify-between min-h-9">
                <div className="flex items-center gap-4 flex-1">
                  <span className="min-w-20">{t("expand_count")}</span>
                  <Input
                    className="w-25 max-w-30"
                    type="number"
                    value={menuExpandNum.toString()}
                    onChange={(val) => {
                      const num = parseInt(val, 10);
                      setMenuExpandNum(num);
                      systemConfig.setMenuExpandNum(num);
                    }}
                  />
                </div>
                <span className="text-xs ml-6 flex-shrink-0">{t("auto_collapse_when_exceeds")}</span>
              </div>
            </Space>
          </div>
        </Space>
      </Card>
      <Card className="sync" title={t("script_sync")} bordered={false}>
        <Space direction="vertical" className={"w-full"}>
          <Space direction="horizontal" className={"w-full"}>
            <Checkbox
              checked={syncDelete}
              onChange={(checked) => {
                setSyncDelete(checked);
              }}
            >
              {t("sync_delete")}
            </Checkbox>
            <Checkbox
              checked={syncScriptStatus}
              onChange={(checked) => {
                setSyncScriptStatus(checked);
              }}
            >
              {t("sync_status")}
            </Checkbox>
          </Space>
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
                    syncStatus: syncScriptStatus || false,
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
      {/* 脚本更新设置 */}
      <Card title={t("update")} bordered={false}>
        <Space direction="vertical" size={20} className="w-full">
          <div className="flex items-center justify-between min-h-9">
            <div className="flex items-center gap-4 flex-1">
              <span className="min-w-20 font-medium">{t("check_frequency")}</span>
              <Select
                value={checkScriptUpdateCycle.toString()}
                className="w-35 max-w-45"
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
            </div>
            <span className="text-xs ml-6 flex-shrink-0">{t("script_auto_update_frequency")}</span>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-3 flex-1">
              <span className="font-medium mb-1">{t("update_options")}</span>
              <Checkbox
                onChange={(checked) => {
                  setUpdateDisableScript(checked);
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
            </div>
            <span className="text-xs max-w-50 text-right ml-6 flex-shrink-0">
              {t("control_script_update_behavior")}
            </span>
          </div>
        </Space>
      </Card>
      <GMApiSetting />
      {/* 安全设置 */}
      <Card title={t("security")} bordered={false}>
        <div>
          <div className="flex items-start justify-between mb-3">
            <span className="font-medium min-w-20">{t("blacklist_pages")}</span>
            <span className="text-xs max-w-60 text-right">{t("blacklist_pages_desc")}</span>
          </div>
          <Input.TextArea
            placeholder={t("blacklist_placeholder")}
            autoSize={{
              minRows: 4,
              maxRows: 8,
            }}
            value={blacklist}
            onChange={(v) => {
              setBlacklist(v);
            }}
            onBlur={(v) => {
              // 校验黑名单格式
              const lines = v.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line);
              for (const line of lines) {
                if (line && !parsePatternMatchesURL(line)) {
                  Message.error(`${t("expression_format_error")}: ${line}`);
                  return;
                }
              }
              systemConfig.setBlacklist(v.target.value);
            }}
          />
        </div>
      </Card>
      {/* 开发工具 */}
      <Card title={t("development_tools")} bordered={false}>
        <Space direction="vertical" size={20} className={"w-full"}>
          <div className="flex items-center justify-between min-h-9">
            <div className="flex items-center gap-4 flex-1">
              <Checkbox
                onChange={(checked) => {
                  setEnableEslint(checked);
                  systemConfig.setEnableEslint(checked);
                }}
                checked={enableEslint}
              >
                <span className="font-medium">{t("enable_eslint")}</span>
              </Checkbox>
              <Button
                type="text"
                size="small"
                className="p-1"
                icon={<IconQuestionCircleFill />}
                href="https://eslint.org/play/"
                target="_blank"
              />
            </div>
            <span className="text-xs ml-6 flex-shrink-0">{t("check_script_code_quality")}</span>
          </div>

          {enableEslint && (
            <div>
              <div className="flex items-start justify-between mb-3">
                <span className="font-medium min-w-20">{t("eslint_rules")}</span>
                <span className="text-xs max-w-60 text-right ml-6 flex-shrink-0">
                  {t("custom_eslint_rules_config")}
                </span>
              </div>
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
                    .then(() => {
                      systemConfig.setEslintConfig(v.target.value);
                    })
                    .catch((e) => {
                      Message.error(`${t("eslint_config_format_error")}: ${JSON.stringify(Logger.E(e))}`);
                    });
                }}
              />
            </div>
          )}
        </Space>
      </Card>
    </Space>
  );
}

export default Setting;
