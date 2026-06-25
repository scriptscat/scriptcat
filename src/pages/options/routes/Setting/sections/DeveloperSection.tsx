import { useState } from "react";
import { useTranslation } from "react-i18next";
import prettier from "prettier/standalone";
import * as babel from "prettier/parser-babel";
import prettierPluginEstree from "prettier/plugins/estree";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Switch } from "@App/pages/components/ui/switch";
import { Textarea } from "@App/pages/components/ui/textarea";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { notify } from "@App/pages/components/ui/toast";

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
  const [typeDef, setTypeDef] = useSystemConfig("editor_type_definition");

  const [eslintDraft, setEslintDraft] = useDraft(eslintCfg);
  const [editorDraft, setEditorDraft] = useDraft(editorCfg);
  const [typeDraft, setTypeDraft] = useDraft(typeDef);

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
      <SettingRow label={t("settings:enable_eslint")} description={t("settings:check_script_code_quality")}>
        <Switch checked={!!enableEslint} onCheckedChange={(c) => setEnableEslint(c)} />
      </SettingRow>

      {enableEslint && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium text-foreground">{t("settings:eslint_rules")}</div>
          <div className="text-xs text-muted-foreground">{t("settings:custom_eslint_rules_config")}</div>
          <Textarea
            data-testid="eslint_rules_textarea"
            aria-label={t("settings:eslint_rules")}
            placeholder={t("settings:enter_eslint_rules")}
            className="min-h-[120px] font-mono text-xs"
            value={eslintDraft}
            onChange={(e) => setEslintDraft(e.target.value)}
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

      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium text-foreground">{t("editor:editor_config")}</div>
        <div className="text-xs text-muted-foreground">
          {t("editor:editor_config_description")}{" "}
          <a className="text-primary hover:underline" href={JSCONFIG_DOC_URL} target="_blank" rel="noreferrer">
            {"jsconfig.js"}
          </a>
        </div>
        <Textarea
          data-testid="editor_config_textarea"
          aria-label={t("editor:editor_config")}
          className="min-h-[120px] font-mono text-xs"
          value={editorDraft}
          onChange={(e) => setEditorDraft(e.target.value)}
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
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium text-foreground">{t("editor:editor_type_definition")}</div>
        <div className="text-xs text-muted-foreground">{t("editor:editor_type_definition_description")}</div>
        <Textarea
          data-testid="editor_type_definition_textarea"
          aria-label={t("editor:editor_type_definition")}
          className="min-h-[120px] font-mono text-xs"
          value={typeDraft}
          onChange={(e) => setTypeDraft(e.target.value)}
          onBlur={() => {
            notify.success(
              t(typeDraft === "" ? "editor:editor_type_definition_reset" : "editor:editor_type_definition_saved") ?? ""
            );
            setTypeDef(typeDraft);
          }}
        />
      </div>
    </SettingCard>
  );
}
