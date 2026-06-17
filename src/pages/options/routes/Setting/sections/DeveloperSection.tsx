import { useEffect, useState } from "react";
import prettier from "prettier/standalone";
import * as babel from "prettier/parser-babel";
import prettierPluginEstree from "prettier/plugins/estree";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Switch } from "@App/pages/components/ui/switch";
import { Textarea } from "@App/pages/components/ui/textarea";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { t } from "@App/locales/locales";
import { toast } from "sonner";

function useDraft(value: string | undefined) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (value !== undefined) setDraft(value);
  }, [value]);
  return [draft, setDraft] as const;
}

export function DeveloperSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
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
        toast.success(t(formatted === "" ? resetKey : savedKey) ?? "");
        write(formatted);
      })
      .catch((e) => toast.error(`${t(errKey)}: ${String(e)}`));
  };

  return (
    <SettingCard
      id="developer"
      title={t("settings:development_tools")}
      description={t("settings:check_script_code_quality")}
      register={register}
    >
      <SettingRow label={t("settings:enable_eslint")} description={t("settings:check_script_code_quality")}>
        <Switch checked={!!enableEslint} onCheckedChange={(c) => setEnableEslint(c)} />
      </SettingRow>

      {enableEslint && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium text-foreground">{t("settings:eslint_rules")}</div>
          <Textarea
            aria-label="eslint_rules_textarea"
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
        <Textarea
          aria-label="editor_config_textarea"
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
        <Textarea
          aria-label="editor_type_definition_textarea"
          className="min-h-[120px] font-mono text-xs"
          value={typeDraft}
          onChange={(e) => setTypeDraft(e.target.value)}
          onBlur={() => {
            toast.success(
              t(typeDraft === "" ? "editor:editor_type_definition_reset" : "editor:editor_type_definition_saved") ?? ""
            );
            setTypeDef(typeDraft);
          }}
        />
      </div>
    </SettingCard>
  );
}
