import { useState } from "react";
import { useTranslation } from "react-i18next";
import prettier from "prettier/standalone";
import * as babel from "prettier/parser-babel";
import prettierPluginEstree from "prettier/plugins/estree";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Switch } from "@App/pages/components/ui/switch";
import { Slider } from "@App/pages/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@App/pages/components/ui/tabs";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { notify } from "@App/pages/components/ui/toast";
import { DeveloperMonacoEditor } from "./DeveloperMonacoEditor";
import { DEFAULT_EDITOR_PREFERENCES, type EditorPreferences } from "@App/pkg/config/config";

const JSCONFIG_DOC_URL = "https://code.visualstudio.com/docs/languages/jsconfig";

function useDraft(value: string | undefined) {
  const [draft, setDraft] = useState("");
  // 当外部加载到的 value 变化时，于渲染期同步 draft（React 推荐的「prop 变化重置 state」模式，避免 effect 触发级联渲染）
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== undefined) setDraft(value);
  }
  return [draft, setDraft] as const;
}

export function DeveloperSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [enableEslint, setEnableEslint] = useSystemConfig("enable_eslint");
  const [eslintCfg, setEslintCfg] = useSystemConfig("eslint_config");
  const [editorCfg, setEditorCfg] = useSystemConfig("editor_config");
  const [editorPreferences, setEditorPreferences] = useSystemConfig("editor_preferences");
  const [typeDef, setTypeDef] = useSystemConfig("editor_type_definition");

  const [eslintDraft, setEslintDraft] = useDraft(eslintCfg);
  const [editorDraft, setEditorDraft] = useDraft(editorCfg);
  const [typeDraft, setTypeDraft] = useDraft(typeDef);
  const resolvedEditorPreferences = editorPreferences ?? DEFAULT_EDITOR_PREFERENCES;

  const updateEditorPreferences = (patch: Partial<Omit<EditorPreferences, "version">>) => {
    setEditorPreferences({ ...resolvedEditorPreferences, ...patch, version: 1 });
  };

  const saveJson = (val: string, write: (v: string) => void, resetKey: string, savedKey: string, errKey: string) => {
    prettier
      .format(val, { parser: "json", plugins: [prettierPluginEstree, babel] })
      .then((formatted) => {
        notify.success(t(formatted === "" ? resetKey : savedKey) ?? "");
        write(formatted);
      })
      .catch((e) => notify.error(`${t(errKey)}: ${String(e)}`));
  };

  return (
    <SettingCard id="developer" title={t("settings:development_tools")} register={register}>
      <Tabs defaultValue="eslint" className="flex flex-col gap-3">
        <TabsList className="max-w-full self-start justify-start overflow-x-auto">
          <TabsTrigger value="eslint">{t("settings:eslint_rules")}</TabsTrigger>
          <TabsTrigger value="editor-config">{t("editor:editor_config")}</TabsTrigger>
          <TabsTrigger value="type-definition">{t("editor:editor_type_definition")}</TabsTrigger>
        </TabsList>

        <TabsContent value="eslint" className="mt-0 flex flex-col gap-3">
          <SettingRow label={t("settings:enable_eslint")} description={t("settings:check_script_code_quality")}>
            <Switch checked={!!enableEslint} onCheckedChange={(c) => setEnableEslint(c)} />
          </SettingRow>

          {enableEslint && (
            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-medium text-foreground">{t("settings:eslint_rules")}</div>
              <div className="text-xs text-muted-foreground">{t("settings:custom_eslint_rules_config")}</div>
              <DeveloperMonacoEditor
                id="developer-eslint-config-editor"
                data-testid="eslint_rules_editor"
                ariaLabel={t("settings:eslint_rules")}
                language="json"
                value={eslintDraft}
                onChange={setEslintDraft}
                onBlur={() =>
                  saveJson(
                    eslintDraft,
                    (v) => setEslintCfg(v),
                    "editor:eslint_rules_reset",
                    "editor:eslint_rules_saved",
                    "editor:eslint_config_format_error"
                  )
                }
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="editor-config" className="mt-0 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <SettingRow label={t("editor:font_size")} description={t("editor:font_size_description")}>
              <div className="flex w-72 max-w-full items-center gap-3">
                <Slider
                  aria-label={t("editor:font_size")}
                  value={[resolvedEditorPreferences.fontSize]}
                  min={10}
                  max={28}
                  step={1}
                  onValueChange={([fontSize]) => {
                    if (fontSize === undefined) return;
                    updateEditorPreferences({ fontSize });
                  }}
                />
                <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                  {`${resolvedEditorPreferences.fontSize}px`}
                </span>
              </div>
            </SettingRow>

            <SettingRow
              label={t("editor:mouse_wheel_scroll_sensitivity")}
              description={t("editor:mouse_wheel_scroll_sensitivity_description")}
            >
              <div className="flex w-72 max-w-full items-center gap-3">
                <Slider
                  aria-label={t("editor:mouse_wheel_scroll_sensitivity")}
                  value={[resolvedEditorPreferences.mouseWheelScrollSensitivity]}
                  min={0.25}
                  max={5}
                  step={0.25}
                  onValueChange={([mouseWheelScrollSensitivity]) => {
                    if (mouseWheelScrollSensitivity === undefined) return;
                    updateEditorPreferences({ mouseWheelScrollSensitivity });
                  }}
                />
                <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                  {`${resolvedEditorPreferences.mouseWheelScrollSensitivity}x`}
                </span>
              </div>
            </SettingRow>

            <SettingRow label={t("editor:smooth_scrolling")} description={t("editor:smooth_scrolling_description")}>
              <Switch
                aria-label={t("editor:smooth_scrolling")}
                checked={resolvedEditorPreferences.smoothScrolling}
                onCheckedChange={(smoothScrolling) => updateEditorPreferences({ smoothScrolling })}
              />
            </SettingRow>
          </div>

          <div className="text-[13px] font-medium text-foreground">{t("editor:editor_config")}</div>
          <div className="text-xs text-muted-foreground">
            {t("editor:editor_config_description")}{" "}
            <a className="text-primary hover:underline" href={JSCONFIG_DOC_URL} target="_blank" rel="noreferrer">
              {"jsconfig.js"}
            </a>
          </div>
          <DeveloperMonacoEditor
            id="developer-editor-config-editor"
            data-testid="editor_config_editor"
            ariaLabel={t("editor:editor_config")}
            language="json"
            value={editorDraft}
            onChange={setEditorDraft}
            onBlur={() =>
              saveJson(
                editorDraft,
                (v) => setEditorCfg(v),
                "editor:editor_config_reset",
                "editor:editor_config_saved",
                "editor:editor_config_format_error"
              )
            }
          />
        </TabsContent>

        <TabsContent value="type-definition" className="mt-0 flex flex-col gap-2">
          <div className="text-[13px] font-medium text-foreground">{t("editor:editor_type_definition")}</div>
          <div className="text-xs text-muted-foreground">{t("editor:editor_type_definition_description")}</div>
          <DeveloperMonacoEditor
            id="developer-editor-type-definition-editor"
            data-testid="editor_type_definition_editor"
            ariaLabel={t("editor:editor_type_definition")}
            language="typescript"
            value={typeDraft}
            onChange={setTypeDraft}
            onBlur={() => {
              notify.success(
                t(typeDraft === "" ? "editor:editor_type_definition_reset" : "editor:editor_type_definition_saved") ??
                  ""
              );
              setTypeDef(typeDraft);
            }}
          />
        </TabsContent>
      </Tabs>
    </SettingCard>
  );
}
