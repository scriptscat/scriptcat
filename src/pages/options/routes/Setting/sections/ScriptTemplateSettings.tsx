import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { SegmentedControl, type SegmentedControlOption } from "@App/pages/components/ui/segmented-control";
import { notify } from "@App/pages/components/ui/toast";
import {
  DEFAULT_SCRIPT_TEMPLATES,
  SCRIPT_TEMPLATE_TYPES,
  resolveScriptTemplate,
  validateScriptTemplate,
  type ScriptTemplateType,
} from "@App/pkg/utils/script_template";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { DeveloperMonacoEditor } from "./DeveloperMonacoEditor";

export function ScriptTemplateSettings() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useSystemConfig("script_templates");
  const [type, setType] = useState<ScriptTemplateType>("normal");
  const [error, setError] = useState<string | null>(null);

  // 占位符本身不翻译，也不能进 i18n 文案：花括号会被 i18next 当成插值
  const variables = [
    { placeholder: "{{name}}", description: t("settings:script_template_var_name") },
    { placeholder: "{{match}}", description: t("settings:script_template_var_match") },
    { placeholder: "{{icon}}", description: t("settings:script_template_var_icon") },
    { placeholder: "{{domain}}", description: t("settings:script_template_var_domain") },
    { placeholder: "{{title}}", description: t("settings:script_template_var_title") },
    { placeholder: "{{date:YYYY-MM-DD}}", description: t("settings:script_template_var_date") },
  ];
  const typeLabels: Record<ScriptTemplateType, string> = {
    normal: t("script:normal_script"),
    background: t("script:background_script"),
    crontab: t("script:scheduled_script"),
  };

  const saved = resolveScriptTemplate(templates, type);
  // 切换类型或配置加载完成时，于渲染期把编辑器内容同步为该类型的模板
  const [draft, setDraft] = useState(saved);
  const [prevSaved, setPrevSaved] = useState(saved);
  if (saved !== prevSaved) {
    setPrevSaved(saved);
    setDraft(saved);
  }

  const writeOverrides = (next: string | undefined) => {
    const overrides = { ...templates };
    if (next === undefined) delete overrides[type];
    else overrides[type] = next;
    setTemplates(overrides);
  };

  const save = () => {
    if (draft === saved) return;
    const err = validateScriptTemplate(type, draft);
    if (err) {
      setError(err);
      notify.error(err);
      return;
    }
    setError(null);
    writeOverrides(draft === DEFAULT_SCRIPT_TEMPLATES[type] ? undefined : draft);
    notify.success(t("settings:script_template_saved"));
  };

  const reset = () => {
    setError(null);
    setDraft(DEFAULT_SCRIPT_TEMPLATES[type]);
    writeOverrides(undefined);
    notify.success(t("settings:script_template_reset"));
  };

  const isCustomized = (target: ScriptTemplateType) =>
    resolveScriptTemplate(templates, target) !== DEFAULT_SCRIPT_TEMPLATES[target];

  const options = SCRIPT_TEMPLATE_TYPES.map<SegmentedControlOption<ScriptTemplateType>>((value) => ({
    value,
    testId: `script_template_tab_${value}`,
    label: (
      <span className="flex items-center justify-center gap-1.5">
        {typeLabels[value]}
        {isCustomized(value) && (
          <span className="rounded-full bg-primary-light px-1.5 py-px text-[10px] text-primary">
            {t("settings:script_template_modified")}
          </span>
        )}
      </span>
    ),
  }));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[13px] font-medium text-foreground">{t("settings:script_templates")}</div>
        <div className="text-xs text-muted-foreground">{t("settings:script_templates_description")}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<ScriptTemplateType>
          aria-label={t("settings:script_templates")}
          className="w-auto max-w-full"
          value={type}
          options={options}
          onValueChange={(next) => {
            setError(null);
            setType(next);
          }}
        />
        <Button variant="outline" size="sm" disabled={draft === DEFAULT_SCRIPT_TEMPLATES[type]} onClick={reset}>
          {t("editor:restore_default_values")}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <DeveloperMonacoEditor
        id={`developer-script-template-${type}`}
        data-testid="script_template_editor"
        ariaLabel={t("settings:script_templates")}
        language="javascript"
        className={error ? "border-destructive" : undefined}
        value={draft}
        onChange={setDraft}
        onBlur={save}
      />

      <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">{t("settings:script_template_variables")}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {variables.map(({ placeholder, description }) => (
            <span key={placeholder} className="flex items-center gap-1.5">
              <code className="rounded-sm bg-primary-light px-1 font-mono text-primary">{placeholder}</code>
              {description}
            </span>
          ))}
        </div>
        <div>{t("settings:script_template_variables_hint")}</div>
      </div>
    </div>
  );
}
