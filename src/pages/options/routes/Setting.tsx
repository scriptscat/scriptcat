import { Button, Card, Checkbox, ColorPicker, Input, Message, Popover, Select, Space } from "@arco-design/web-react";
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
import { useAppContext } from "@App/pages/store/AppContext";
import { SystemConfigChange, type SystemConfigKey } from "@App/pkg/config/config";
import { type TKeyValue } from "@Packages/message/message_queue";
import { useEffect, useMemo } from "react";
import { systemConfig } from "@App/pages/store/global";
import { initRegularUpdateCheck } from "@App/app/service/service_worker/regular_updatecheck";

function Setting() {
  const { subscribeMessage } = useAppContext();

  const [editorConfig, setEditorConfig, submitEditorConfig] = useSystemConfig("editor_config");
  const [cloudSync, setCloudSync, submitCloudSync] = useSystemConfig("cloud_sync");
  const [language, setLanguage, submitLanguage] = useSystemConfig("language");
  const [menuExpandNum, setMenuExpandNum, submitMenuExpandNum] = useSystemConfig("menu_expand_num");
  const [checkScriptUpdateCycle, setCheckScriptUpdateCycle, submitCheckScriptUpdateCycle] =
    useSystemConfig("check_script_update_cycle");
  const [updateDisableScript, setUpdateDisableScript, submitUpdateDisableScript] =
    useSystemConfig("update_disable_script");
  const [silenceUpdateScript, setSilenceUpdateScript, submitSilenceUpdateScript] =
    useSystemConfig("silence_update_script");
  const [enableEslint, setEnableEslint, submitEnableEslint] = useSystemConfig("enable_eslint");
  const [eslintConfig, setEslintConfig, submitEslintConfig] = useSystemConfig("eslint_config");
  const [blacklist, setBlacklist, submitBlacklist] = useSystemConfig("blacklist");
  const [badgeNumberType, setBadgeNumberType, submitBadgeNumberType] = useSystemConfig("badge_number_type");
  const [badgeBackgroundColor, setBadgeBackgroundColor, submitBadgeBackgroundColor] =
    useSystemConfig("badge_background_color");
  const [badgeTextColor, setBadgeTextColor, submitBadgeTextColor] = useSystemConfig("badge_text_color");
  const [scriptMenuDisplayType, setScriptMenuDisplayType, submitScriptMenuDisplayType] =
    useSystemConfig("script_menu_display_type");

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

  useEffect(() => {
    // only string / number / boolean
    const autoRefresh = {
      editor_config: setEditorConfig,
      language: setLanguage,
      menu_expand_num: setMenuExpandNum,
      check_script_update_cycle: setCheckScriptUpdateCycle,
      update_disable_script: setUpdateDisableScript,
      silence_update_script: setSilenceUpdateScript,
      enable_eslint: setEnableEslint,
      eslint_config: setEslintConfig,
      blacklist: setBlacklist,
      badge_number_type: setBadgeNumberType,
      badge_background_color: setBadgeBackgroundColor,
      badge_text_color: setBadgeTextColor,
      script_menu_display_type: setScriptMenuDisplayType,
      editor_type_definition: setEditorTypeDefinition,
    };
    const unhooks = [
      subscribeMessage<TKeyValue>(SystemConfigChange, ({ key, value: _value }: TKeyValue) => {
        const setter = autoRefresh[key as keyof typeof autoRefresh];
        if (typeof setter === "function") {
          // 异步方式，先让 systemConfig.cache 更新，再在下一个 microTask 读取 systemConfig.get 使页面的设定更新
          // 考虑React更新会对值进行新旧对比，只更新 string/number/boolean，不更新 array/object。 array/object 的话需另外处理避免过度更新。
          Promise.resolve()
            .then(() => systemConfig.get(key as SystemConfigKey))
            .then((v) => {
              const type = typeof v;
              if (type === "string" || type === "number" || type === "boolean") {
                setter(v);
              }
            });
        }
      }),
    ];
    return () => {
      for (const unhook of unhooks) unhook();
      unhooks.length = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <span className="text-xs ml-6 flex-shrink-0">{t("select_interface_language")}</span>
        </div>
      </Card>

      {/* 脚本同步 */}
      <Card className="sync" title={t("script_sync")} bordered={false}>
        <Space direction="vertical" className={"w-full"}>
          <Space direction="horizontal" className={"w-full"}>
            <Popover trigger="hover" content={t("sync_delete_desc")}>
              <Checkbox
                checked={cloudSync.syncDelete}
                onChange={(checked) => {
                  setCloudSync((cloudSync) => ({ ...cloudSync, syncDelete: checked }));
                }}
              >
                {t("sync_delete")}
              </Checkbox>
            </Popover>
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
                      submitBadgeNumberType(value);
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
                      submitBadgeBackgroundColor(colorValue);
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
                      submitBadgeTextColor(colorValue);
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
                <span className="text-xs ml-6 flex-shrink-0">{t("display_right_click_menu_desc")}</span>
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
                      submitMenuExpandNum(num);
                    }}
                  />
                </div>
                <span className="text-xs ml-6 flex-shrink-0">{t("auto_collapse_when_exceeds")}</span>
              </div>
            </Space>
          </div>
        </Space>
      </Card>

      {/* 脚本更新设置 */}
      <Card title={t("update")} bordered={false}>
        <Space direction="vertical" size={20} className="w-full">
          <div className="flex items-center justify-between min-h-9">
            <div className="flex items-center gap-4 flex-1">
              <span className="min-w-20 font-medium">{t("script_update_check_frequency")}</span>
              <Select
                value={checkScriptUpdateCycle.toString()}
                className="w-35 max-w-45"
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
            <span className="text-xs ml-6 flex-shrink-0">{t("script_auto_update_frequency")}</span>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-3 flex-1">
              <span className="font-medium mb-1">{t("update_options")}</span>
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
            <span className="text-xs max-w-50 text-right ml-6 flex-shrink-0">
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
        <Space direction="vertical" size={20} className={"w-full"}>
          <div className="flex items-center justify-between min-h-9">
            <div className="flex items-center gap-4 flex-1">
              <Checkbox
                onChange={(checked) => {
                  submitEnableEslint(checked);
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
            <div className="flex items-start justify-between mb-3">
              <span className="font-medium min-w-20">{t("editor_config")}</span>
              <CustomTrans
                className="text-xs max-w-80 text-right ml-6 flex-shrink-0"
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
            <div className="flex items-start justify-between mb-3">
              <span className="font-medium min-w-20">{t("editor_type_definition")}</span>
              <span
                className="text-xs max-w-100 text-right ml-6 flex-shrink-0"
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
