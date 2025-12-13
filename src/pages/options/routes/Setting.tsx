import { Button, Card, Checkbox, ColorPicker, Input, Message, Select, Space } from "@arco-design/web-react";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";
import prettier from "prettier/standalone";
import * as babel from "prettier/parser-babel";
import prettierPluginEstree from "prettier/plugins/estree";
import RuntimeSetting from "@App/pages/components/RuntimeSetting";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import Logger from "@App/app/logger/logger";
import FileSystemFactory from "@Packages/filesystem/factory";
import FileSystemParams from "@App/pages/components/FileSystemParams";
import { blackListSelfCheck } from "@App/pkg/utils/match";
import { obtainBlackList } from "@App/pkg/utils/utils";
import CustomTrans from "@App/pages/components/CustomTrans";
import { useSystemConfig } from "./utils";
import { useMemo } from "react";
import { systemConfig } from "@App/pages/store/global";
import { initRegularUpdateCheck } from "@App/app/service/service_worker/regular_updatecheck";

function Setting() {
  const [editorConfig, setEditorConfig, submitEditorConfig] = useSystemConfig("editor_config");
  const [cloudSync, setCloudSync, submitCloudSync] = useSystemConfig("cloud_sync");
  const [language, , submitLanguage] = useSystemConfig("language");
  const [menuExpandNum, , submitMenuExpandNum] = useSystemConfig("menu_expand_num");
  const [checkScriptUpdateCycle, , submitCheckScriptUpdateCycle] = useSystemConfig("check_script_update_cycle");
  const [updateDisableScript, , submitUpdateDisableScript] = useSystemConfig("update_disable_script");
  const [silenceUpdateScript, , submitSilenceUpdateScript] = useSystemConfig("silence_update_script");
  const [enableEslint, , submitEnableEslint] = useSystemConfig("enable_eslint");
  const [eslintConfig, setEslintConfig, submitEslintConfig] = useSystemConfig("eslint_config");
  const [blacklist, setBlacklist, submitBlacklist] = useSystemConfig("blacklist");
  const [badgeNumberType, , submitBadgeNumberType] = useSystemConfig("badge_number_type");
  const [badgeBackgroundColor, , submitBadgeBackgroundColor] = useSystemConfig("badge_background_color");
  const [badgeTextColor, , submitBadgeTextColor] = useSystemConfig("badge_text_color");
  const [scriptMenuDisplayType, , submitScriptMenuDisplayType] = useSystemConfig("script_menu_display_type");

  const [editorTypeDefinition, setEditorTypeDefinition, submitEditorTypeDefinition] =
    useSystemConfig("editor_type_definition");

  const { t } = useTranslation();
  const languageList = useMemo(() => {
    const languageList: { key: string; title: string }[] = [];
    const i18nStoreData = i18n.store.data;
    for (const key of Object.keys(i18nStoreData)) {
      if (key === "ach-UG") {
        continue;
      }
      languageList.push({
        key,
        title: `${i18nStoreData[key].title}`,
      });
    }
    languageList.push({
      key: "help",
      title: t("help_translate"),
    });
    return languageList;
  }, [t]);

  return (
    <Space className="setting tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      {/* 基本设置 */}
      <Card title={t("general")} bordered={false}>
        <div className="tw-flex tw-items-center tw-justify-between tw-min-h-10">
          <div className="tw-flex tw-items-center tw-gap-4 tw-flex-1">
            <span className="tw-min-w-20 tw-font-medium">{t("language")}</span>
            <Select
              value={language}
              className="tw-w-50 tw-max-w-75"
              onChange={(value) => {
                if (value === "help") {
                  window.open("https://crowdin.com/project/scriptcat", "_blank");
                  return;
                }
                submitLanguage(value);
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
          <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("select_interface_language")}</span>
        </div>
      </Card>

      {/* 脚本同步 */}
      <Card className="sync" title={t("script_sync")} bordered={false}>
        <Space direction="vertical" className="tw-w-full">
          <Space direction="horizontal" className="tw-w-full">
            <Checkbox
              checked={cloudSync.syncDelete}
              onChange={(checked) => {
                setCloudSync((cloudSync) => ({ ...cloudSync, syncDelete: checked }));
              }}
            >
              {t("sync_delete")}
            </Checkbox>
            <Checkbox
              checked={cloudSync.syncStatus}
              onChange={(checked) => {
                setCloudSync((cloudSync) => ({ ...cloudSync, syncStatus: checked }));
              }}
            >
              {t("sync_status")}
            </Checkbox>
          </Space>
          <FileSystemParams
            preNode={
              <Checkbox
                checked={cloudSync.enable}
                onChange={(checked) => {
                  setCloudSync((cloudSync) => ({ ...cloudSync, enable: checked }));
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
                  if (cloudSync.enable) {
                    Message.info(t("cloud_sync_account_verification")!);
                    try {
                      await FileSystemFactory.create(cloudSync.filesystem, cloudSync.params[cloudSync.filesystem]);
                    } catch (e) {
                      Message.error(`${t("cloud_sync_verification_failed")}: ${JSON.stringify(Logger.E(e))}`);
                      return;
                    }
                  }
                  submitCloudSync();
                  Message.success(t("save_success")!);
                }}
              >
                {t("save")}
              </Button>,
            ]}
            fileSystemType={cloudSync.filesystem}
            fileSystemParams={cloudSync.params[cloudSync.filesystem] || {}}
            onChangeFileSystemType={(type) => {
              setCloudSync((cloudSync) => ({ ...cloudSync, filesystem: type }));
            }}
            onChangeFileSystemParams={(params) => {
              setCloudSync((cloudSync) => ({
                ...cloudSync,
                params: { ...cloudSync.params, [cloudSync.filesystem]: params },
              }));
            }}
          />
        </Space>
      </Card>

      {/* 界面外观 */}
      <Card title={t("interface_settings")} bordered={false}>
        <Space direction="vertical" size={16} className="tw-w-full">
          {/* 扩展图标徽标 */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-3">{t("extension_icon_badge")}</div>
            <Space direction="vertical" size={12} className="tw-w-full">
              <div className="tw-flex tw-items-center tw-justify-between tw-min-h-9">
                <div className="tw-flex tw-items-center tw-gap-4 tw-flex-1">
                  <span className="tw-min-w-20">{t("display_type")}</span>
                  <Select
                    value={badgeNumberType}
                    className="tw-w-40 tw-max-w-50"
                    onChange={(value) => {
                      submitBadgeNumberType(value);
                    }}
                  >
                    <Select.Option value="none">{t("badge_type_none")}</Select.Option>
                    <Select.Option value="run_count">{t("badge_type_run_count")}</Select.Option>
                    <Select.Option value="script_count">{t("badge_type_script_count")}</Select.Option>
                  </Select>
                </div>
                <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("extension_icon_badge_type")}</span>
              </div>
              <div className="tw-flex tw-items-center tw-justify-between tw-min-h-9">
                <div className="tw-flex tw-items-center tw-gap-4 tw-flex-1">
                  <span className="tw-min-w-20">{t("background_color")}</span>
                  <ColorPicker
                    value={badgeBackgroundColor}
                    onChange={(value) => {
                      const colorValue = typeof value === "string" ? value : value[0]?.color || "#4e5969";
                      submitBadgeBackgroundColor(colorValue);
                    }}
                    showText
                    disabledAlpha
                    className="tw-w-50 tw-max-w-62.5"
                  />
                </div>
                <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("badge_background_color_desc")}</span>
              </div>
              <div className="tw-flex tw-items-center tw-justify-between tw-min-h-9">
                <div className="tw-flex tw-items-center tw-gap-4 tw-flex-1">
                  <span className="tw-min-w-20">{t("text_color")}</span>
                  <ColorPicker
                    value={badgeTextColor}
                    onChange={(value) => {
                      const colorValue = typeof value === "string" ? value : value[0]?.color || "#ffffff";
                      submitBadgeTextColor(colorValue);
                    }}
                    showText
                    disabledAlpha
                    className="tw-w-50 tw-max-w-62.5"
                  />
                </div>
                <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("badge_text_color_desc")}</span>
              </div>
            </Space>
          </div>

          {/* 脚本菜单 */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-3">{t("script_menu")}</div>
            <Space direction="vertical" size={12} className="tw-w-full">
              <div className="tw-flex tw-items-center tw-justify-between tw-min-h-9">
                <div className="tw-flex tw-items-center tw-gap-4 tw-flex-1">
                  <Checkbox
                    checked={scriptMenuDisplayType === "all"}
                    onChange={(e) => {
                      const checked = e;
                      submitScriptMenuDisplayType(checked ? "all" : "no_browser");
                    }}
                  >
                    {t("display_right_click_menu")}
                  </Checkbox>
                </div>
                <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("display_right_click_menu_desc")}</span>
              </div>
              <div className="tw-flex tw-items-center tw-justify-between tw-min-h-9">
                <div className="tw-flex tw-items-center tw-gap-4 tw-flex-1">
                  <span className="tw-min-w-20">{t("expand_count")}</span>
                  <Input
                    className="tw-w-25 tw-max-w-30"
                    type="number"
                    value={menuExpandNum.toString()}
                    onChange={(val) => {
                      const num = parseInt(val, 10);
                      submitMenuExpandNum(num);
                    }}
                  />
                </div>
                <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("auto_collapse_when_exceeds")}</span>
              </div>
            </Space>
          </div>
        </Space>
      </Card>

      {/* 脚本更新设置 */}
      <Card title={t("update")} bordered={false}>
        <Space direction="vertical" size={20} className="tw-w-full">
          <div className="tw-flex tw-items-center tw-justify-between tw-min-h-9">
            <div className="tw-flex tw-items-center tw-gap-4 tw-flex-1">
              <span className="tw-min-w-20 tw-font-medium">{t("script_update_check_frequency")}</span>
              <Select
                value={checkScriptUpdateCycle.toString()}
                className="tw-w-35 tw-max-w-45"
                onChange={(value) => {
                  const num = parseInt(value, 10);
                  submitCheckScriptUpdateCycle(num);
                  Promise.resolve().then(() => {
                    initRegularUpdateCheck(systemConfig);
                  });
                }}
              >
                <Select.Option value="0">{t("never")}</Select.Option>
                <Select.Option value="21600">{t("6_hours")}</Select.Option>
                <Select.Option value="43200">{t("12_hours")}</Select.Option>
                <Select.Option value="86400">{t("every_day")}</Select.Option>
                <Select.Option value="604800">{t("every_week")}</Select.Option>
              </Select>
            </div>
            <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("script_auto_update_frequency")}</span>
          </div>

          <div className="tw-flex tw-items-start tw-justify-between">
            <div className="tw-flex tw-flex-col tw-gap-3 tw-flex-1">
              <span className="tw-font-medium tw-mb-1">{t("update_options")}</span>
              <Checkbox
                onChange={(checked) => {
                  submitUpdateDisableScript(checked);
                }}
                checked={updateDisableScript}
              >
                {t("update_disabled_scripts")}
              </Checkbox>
              <Checkbox
                onChange={(checked) => {
                  submitSilenceUpdateScript(checked);
                }}
                checked={silenceUpdateScript}
              >
                {t("silent_update_non_critical_changes")}
              </Checkbox>
            </div>
            <span className="tw-text-xs tw-max-w-50 tw-text-right tw-ml-6 tw-flex-shrink-0">
              {t("control_script_update_behavior")}
            </span>
          </div>
        </Space>
      </Card>

      {/* 运行时设置 */}
      <RuntimeSetting />

      {/* 安全设置 */}
      <Card title={t("security")} bordered={false}>
        <div>
          <div className="tw-flex tw-items-start tw-justify-between tw-mb-3">
            <span className="tw-font-medium tw-min-w-20">{t("blacklist_pages")}</span>
            <span className="tw-text-xs tw-max-w-60 tw-text-right">{t("blacklist_pages_desc")}</span>
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
              const val = v.target.value;
              const blacklist = obtainBlackList(val);
              const ret = blackListSelfCheck(blacklist);
              if (!ret.ok) {
                Message.error(`${t("expression_format_error")}: ${ret.line}`);
                return;
              }
              submitBlacklist(val);
            }}
          />
        </div>
      </Card>
      {/* 开发工具 */}
      <Card title={t("development_tools")} bordered={false}>
        <Space direction="vertical" size={20} className="tw-w-full">
          <div className="tw-flex tw-items-center tw-justify-between tw-min-h-9">
            <div className="tw-flex tw-items-center tw-gap-4 tw-flex-1">
              <Checkbox
                onChange={(checked) => {
                  submitEnableEslint(checked);
                }}
                checked={enableEslint}
              >
                <span className="tw-font-medium">{t("enable_eslint")}</span>
              </Checkbox>
              <Button
                type="text"
                size="small"
                className="tw-p-1"
                icon={<IconQuestionCircleFill />}
                href="https://eslint.org/play/"
                target="_blank"
              />
            </div>
            <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("check_script_code_quality")}</span>
          </div>

          {enableEslint && (
            <div>
              <div className="tw-flex tw-items-start tw-justify-between tw-mb-3">
                <span className="tw-font-medium tw-min-w-20">{t("eslint_rules")}</span>
                <span className="tw-text-xs tw-max-w-60 tw-text-right tw-ml-6 tw-flex-shrink-0">
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
                onBlur={() => {
                  prettier
                    .format(eslintConfig, {
                      parser: "json",
                      plugins: [prettierPluginEstree, babel],
                    })
                    .then((value) => {
                      if (value === "") {
                        Message.success(t("eslint_rules_reset"));
                      } else {
                        Message.success(t("eslint_rules_saved"));
                      }
                      submitEslintConfig(value);
                    })
                    .catch((e) => {
                      Message.error(`${t("eslint_config_format_error")}: ${JSON.stringify(Logger.E(e))}`);
                    });
                }}
              />
            </div>
          )}
          <div>
            <div className="tw-flex tw-items-start tw-justify-between tw-mb-3">
              <span className="tw-font-medium tw-min-w-20">{t("editor_config")}</span>
              <CustomTrans
                className="tw-text-xs tw-max-w-80 tw-text-right tw-ml-6 tw-flex-shrink-0"
                i18nKey="editor_config_description"
              />
            </div>
            <Input.TextArea
              placeholder={t("editor_config")!}
              autoSize={{
                minRows: 4,
                maxRows: 8,
              }}
              value={editorConfig}
              onChange={(v) => {
                setEditorConfig(v);
              }}
              onBlur={() => {
                prettier
                  .format(editorConfig, {
                    parser: "json",
                    plugins: [prettierPluginEstree, babel],
                  })
                  .then((value) => {
                    if (value === "") {
                      Message.success(t("editor_config_reset"));
                    } else {
                      Message.success(t("editor_config_saved"));
                    }
                    submitEditorConfig(value);
                  })
                  .catch((e) => {
                    Message.error(`${t("editor_config_format_error")}: ${JSON.stringify(Logger.E(e))}`);
                  });
              }}
            />
          </div>
          <div>
            <div className="tw-flex tw-items-start tw-justify-between tw-mb-3">
              <span className="tw-font-medium tw-min-w-20">{t("editor_type_definition")}</span>
              <span
                className="tw-text-xs tw-max-w-100 tw-text-right tw-ml-6 tw-flex-shrink-0"
                dangerouslySetInnerHTML={{
                  __html: t("editor_type_definition_description"),
                }}
              ></span>
            </div>
            <Input.TextArea
              placeholder={t("editor_type_definition")!}
              autoSize={{
                minRows: 4,
                maxRows: 8,
              }}
              value={editorTypeDefinition as string}
              onChange={(v) => {
                setEditorTypeDefinition(v);
              }}
              onBlur={() => {
                if (editorTypeDefinition === "") {
                  Message.success(t("editor_type_definition_reset"));
                } else {
                  Message.success(t("editor_type_definition_saved"));
                }
                submitEditorTypeDefinition(editorTypeDefinition as string);
              }}
            />
          </div>
        </Space>
      </Card>
    </Space>
  );
}

export default Setting;
