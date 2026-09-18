import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Ban, CornerUpRight, FileText, Globe, Link2, ShieldOff, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type NetworkRule, type NetworkRuleAction, type NetworkRuleCondition } from "@App/app/repo/network_rule";
import type { NetworkRuleServiceError } from "@App/app/service/service_worker/client";
import { parseRuleDomains } from "@App/pkg/utils/network_rule_condition";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@App/pages/components/ui/alert-dialog";
import { Button } from "@App/pages/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@App/pages/components/ui/sheet";
import { cn } from "@App/pkg/utils/cn";
import { ACTION_TONES } from "./RuleParts";
import RuleForm, { type RuleFormState } from "./RuleForm";
import { ALL_SITES_URL_FILTER, isAllSitesCondition } from "./rules";
import {
  ACTION_TYPE_BY_TEMPLATE,
  actionDraftFrom,
  buildAction,
  CSP_RESOURCE_TYPES,
  detectTemplate,
  emptyActionDraft,
  hasActionDraftError,
  validateActionDraft,
  type RuleTemplateId,
} from "./templates";

export type NetworkRuleFormValue = { name: string; condition: NetworkRuleCondition; action: NetworkRuleAction };
export type NetworkRuleSaveResult = true | false | NetworkRuleServiceError;

type RuleSheetProps = {
  open: boolean;
  rule?: NetworkRule;
  /** 从空态的场景入口进来时直接落到第二步，跳过选模板。 */
  initialTemplate?: RuleTemplateId;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: NetworkRuleFormValue) => Promise<NetworkRuleSaveResult>;
};

const TEMPLATE_ICONS: Record<RuleTemplateId, LucideIcon> = {
  csp: ShieldOff,
  userAgent: Smartphone,
  referer: Link2,
  responseHeaders: FileText,
  block: Ban,
  redirect: CornerUpRight,
  custom: Globe,
};

/** 每个模板名都用字面量 key 调用 t()，i18n-usage 的静态校验才能覆盖到。 */
export function useTemplateLabels(): Record<RuleTemplateId, { title: string; description: string }> {
  const { t } = useTranslation();
  return {
    csp: { title: t("tools:network_rule_template_csp"), description: t("tools:network_rule_template_csp_desc") },
    userAgent: {
      title: t("tools:network_rule_template_user_agent"),
      description: t("tools:network_rule_template_user_agent_desc"),
    },
    referer: {
      title: t("tools:network_rule_template_referer"),
      description: t("tools:network_rule_template_referer_desc"),
    },
    responseHeaders: {
      title: t("tools:network_rule_template_response_headers"),
      description: t("tools:network_rule_template_response_headers_desc"),
    },
    block: { title: t("tools:network_rule_template_block"), description: t("tools:network_rule_template_block_desc") },
    redirect: {
      title: t("tools:network_rule_template_redirect"),
      description: t("tools:network_rule_template_redirect_desc"),
    },
    custom: {
      title: t("tools:network_rule_template_custom"),
      description: t("tools:network_rule_template_custom_desc"),
    },
  };
}

function initialState(rule: NetworkRule | undefined, template: RuleTemplateId): RuleFormState {
  const condition = rule?.condition;
  const allSites = condition !== undefined && isAllSitesCondition(condition);
  // 编辑既有规则时资源类型一律照搬原值；只有新建才套模板预设，与 chooseTemplate 保持一致。
  const presetResourceTypes = template === "csp" ? [...CSP_RESOURCE_TYPES] : [];
  return {
    websites: (allSites ? undefined : condition?.requestDomains)?.join("\n") ?? "",
    allSites,
    name: rule?.name ?? "",
    draft: rule ? actionDraftFrom(rule.action) : emptyActionDraft(template),
    resourceTypes: rule ? (condition?.resourceTypes ?? []) : presetResourceTypes,
    requestMethods: condition?.requestMethods ?? [],
    excludedWebsites: condition?.excludedRequestDomains?.join("\n") ?? "",
    tryUrl: "",
  };
}

export default function RuleSheet({ open, rule, initialTemplate, saving, onOpenChange, onSave }: RuleSheetProps) {
  const { t } = useTranslation();
  const templateLabels = useTemplateLabels();
  const initial = rule ? detectTemplate(rule.action) : (initialTemplate ?? "csp");
  const [step, setStep] = useState<"template" | "form">(rule || initialTemplate ? "form" : "template");
  const [template, setTemplate] = useState<RuleTemplateId>(initial);
  const [state, setState] = useState<RuleFormState>(() => initialState(rule, initial));
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [pendingValue, setPendingValue] = useState<NetworkRuleFormValue>();

  const scope = useMemo(() => parseRuleDomains(state.websites), [state.websites]);
  const excluded = useMemo(() => parseRuleDomains(state.excludedWebsites), [state.excludedWebsites]);
  const actionErrors = useMemo(() => validateActionDraft(template, state.draft), [template, state.draft]);

  const scopeInvalid = !state.allSites && (scope.errors.length > 0 || !state.websites.trim());
  const excludedInvalid = state.excludedWebsites.trim() !== "" && excluded.errors.length > 0;
  const canSave = !scopeInvalid && !excludedInvalid && !hasActionDraftError(actionErrors);

  const change = (patch: Partial<RuleFormState>) => setState((current) => ({ ...current, ...patch }));

  // 更换类型只重置动作字段与资源类型：应用范围、排除域名与名称是与场景无关的输入，按设计稿保留。
  const chooseTemplate = (next: RuleTemplateId) => {
    setTemplate(next);
    setStep("form");
    setSubmitError("");
    if (next === template && step === "form") return;
    change({
      draft: emptyActionDraft(next),
      resourceTypes: next === "csp" ? [...CSP_RESOURCE_TYPES] : [],
    });
  };

  const condition = useMemo<NetworkRuleCondition>(
    () => ({
      ...(state.allSites ? { urlFilter: ALL_SITES_URL_FILTER } : { requestDomains: scope.domains }),
      ...(excluded.domains.length > 0 && !state.allSites ? { excludedRequestDomains: excluded.domains } : {}),
      ...(state.resourceTypes.length > 0 ? { resourceTypes: state.resourceTypes } : {}),
      ...(state.requestMethods.length > 0 ? { requestMethods: state.requestMethods } : {}),
    }),
    [state.allSites, state.resourceTypes, state.requestMethods, scope.domains, excluded.domains]
  );

  const submit = async (value: NetworkRuleFormValue) => {
    const saved = await onSave(value);
    if (saved === true) return;
    setSubmitError(
      saved !== false && saved.code === "revision_conflict"
        ? t("tools:network_rules_revision_conflict")
        : t("tools:network_rules_storage_error")
    );
  };

  const handleSubmit = () => {
    setTouched(true);
    setSubmitError("");
    if (!canSave) return;
    const value: NetworkRuleFormValue = {
      name: state.name.trim(),
      condition,
      action: buildAction(template, state.draft),
    };
    // 已经是「所有网站」的规则再次保存不必重复确认，只有创建与「编辑切入」才是新增的风险。
    const wasAllSites = rule !== undefined && isAllSitesCondition(rule.condition);
    if (state.allSites && !wasAllSites) {
      setPendingValue(value);
      return;
    }
    void submit(value);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
        <SheetContent
          side="right"
          aria-describedby={undefined}
          className="flex h-full w-full flex-col p-0 sm:max-w-[520px]"
        >
          <SheetHeader className="shrink-0 border-b border-border px-6 py-5 pr-14 text-left">
            <SheetTitle className="flex items-center gap-2">
              {step === "form" && !rule && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("tools:network_rules_back_to_templates")}
                  onClick={() => setStep("template")}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              )}
              {rule ? t("tools:network_rules_edit_title") : t("tools:network_rules_new_rule")}
            </SheetTitle>
          </SheetHeader>

          {step === "template" ? (
            <div className="flex-1 overflow-y-auto scrollbar-custom px-6 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(["csp", "userAgent", "referer", "responseHeaders", "block", "redirect"] as const).map((id) => (
                  <TemplateCard key={id} id={id} labels={templateLabels[id]} onSelect={chooseTemplate} />
                ))}
                <TemplateCard
                  id="custom"
                  labels={templateLabels.custom}
                  className="sm:col-span-2"
                  onSelect={chooseTemplate}
                />
              </div>
            </div>
          ) : (
            <RuleForm
              template={template}
              templateLabel={templateLabels[template].title}
              state={state}
              scope={scope}
              excluded={excluded}
              actionErrors={actionErrors}
              condition={condition}
              touched={touched}
              saving={saving}
              canSave={canSave}
              submitError={submitError}
              onChange={change}
              onBlurScope={() => setTouched(true)}
              onChangeTemplate={() => setStep("template")}
              onCancel={() => onOpenChange(false)}
              onSubmit={handleSubmit}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={pendingValue !== undefined} onOpenChange={(next) => !next && setPendingValue(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tools:network_rules_confirm_all_sites_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("tools:network_rules_confirm_all_sites_description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving} onClick={() => setPendingValue(undefined)}>
              {t("tools:network_rules_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => {
                if (pendingValue) void submit(pendingValue);
                setPendingValue(undefined);
              }}
            >
              {t("tools:network_rules_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TemplateCard({
  id,
  labels,
  className,
  onSelect,
}: {
  id: RuleTemplateId;
  labels: { title: string; description: string };
  className?: string;
  onSelect: (id: RuleTemplateId) => void;
}) {
  const Icon = TEMPLATE_ICONS[id];
  // 「自定义」不绑定动作，动作要到表单里才选出来，所以它没有动作色。
  const tone = id === "custom" ? "bg-muted text-muted-foreground" : ACTION_TONES[ACTION_TYPE_BY_TEMPLATE[id]];
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        "flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span className={cn("flex size-8 items-center justify-center rounded-md", tone)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="text-sm font-medium text-foreground">{labels.title}</span>
      <span className="text-xs text-muted-foreground">{labels.description}</span>
    </button>
  );
}
