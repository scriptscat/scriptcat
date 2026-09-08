import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, Plus, X } from "lucide-react";
import {
  CSP_RESPONSE_HEADERS,
  MAX_RULE_HEADERS,
  X_FRAME_OPTIONS_HEADER,
  MAX_RULE_NAME_LENGTH,
  type NetworkRuleAction,
  type NetworkRuleActionType,
  type NetworkRuleCondition,
} from "@App/app/repo/network_rule";
import {
  NETWORK_RULE_REQUEST_METHODS,
  NETWORK_RULE_RESOURCE_TYPES,
  type NetworkRuleRequestMethod,
  type NetworkRuleResourceType,
  type RuleDomainMessageKey,
  type RuleDomainParseResult,
} from "@App/pkg/utils/network_rule_condition";
import { matchRuleUrl } from "@App/pkg/utils/network_rule_match";
import { Badge } from "@App/pages/components/ui/badge";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@App/pages/components/ui/collapsible";
import { Input } from "@App/pages/components/ui/input";
import { Label } from "@App/pages/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { Textarea } from "@App/pages/components/ui/textarea";
import { cn } from "@App/pkg/utils/cn";
import { ACTION_TONES, useActionLabels, useResourceTypeLabels } from "./RuleParts";
import {
  ACTION_TYPE_BY_TEMPLATE,
  buildAction,
  editsHeaderList,
  editsRequestHeaders,
  USER_AGENT_PRESETS,
  type ActionDraft,
  type ActionDraftErrors,
  type DraftErrorKey,
  type HeaderDraft,
  type RuleTemplateId,
} from "./templates";

export type RuleFormState = {
  websites: string;
  allSites: boolean;
  name: string;
  draft: ActionDraft;
  resourceTypes: NetworkRuleResourceType[];
  requestMethods: NetworkRuleRequestMethod[];
  excludedWebsites: string;
  tryUrl: string;
};

type RuleFormProps = {
  template: RuleTemplateId;
  templateLabel: string;
  state: RuleFormState;
  scope: RuleDomainParseResult;
  excluded: RuleDomainParseResult;
  actionErrors: ActionDraftErrors;
  condition: NetworkRuleCondition;
  touched: boolean;
  saving: boolean;
  canSave: boolean;
  submitError: string;
  onChange: (patch: Partial<RuleFormState>) => void;
  onBlurScope: () => void;
  onChangeTemplate: () => void;
  onCancel: () => void;
  onSubmit: () => void;
};

const HEADER_OPERATION_ORDER = ["set", "append", "remove"] as const;

/** 域名与草稿的错误文案都用字面量 key 调用 t()，i18n-usage 的静态校验才能覆盖到。 */
function useDomainErrorLabels(): Record<RuleDomainMessageKey, string> {
  const { t } = useTranslation();
  return {
    domain_required: t("tools:network_rules_error_domain_required"),
    domain_invalid: t("tools:network_rules_error_domain_invalid"),
    domain_credentials: t("tools:network_rules_error_domain_credentials"),
    domain_wildcard: t("tools:network_rules_error_domain_wildcard"),
    domain_single_label: t("tools:network_rules_error_domain_single_label"),
    domain_too_long: t("tools:network_rules_error_domain_too_long"),
    domain_count_invalid: t("tools:network_rules_error_domain_count_invalid"),
  };
}

function useDraftErrorLabels(): Record<DraftErrorKey, string> {
  const { t } = useTranslation();
  return {
    required: "",
    header_name_invalid: t("tools:network_rules_error_header_name_invalid"),
    header_denied: t("tools:network_rules_error_header_denied"),
    header_value_required: t("tools:network_rules_error_header_value_required"),
    redirect_url_invalid: t("tools:network_rules_error_redirect_url_invalid"),
  };
}

/**
 * 「试一试」只回答匹配与否，用户还是不知道匹配之后会发生什么——而那正是这一栏要确认的。
 * 文案由 buildAction 的结果生成，与保存下去的动作是同一份数据。
 */
function useActionEffectLabel(action: NetworkRuleAction): string {
  const { t } = useTranslation();
  switch (action.type) {
    case "removeResponseHeaders":
      return t("tools:network_rules_try_effect_remove_response_headers", { count: action.headers.length });
    case "modifyRequestHeaders":
      return t("tools:network_rules_try_effect_modify_request_headers", { count: action.headers.length });
    case "modifyResponseHeaders":
      return t("tools:network_rules_try_effect_modify_response_headers", { count: action.headers.length });
    case "block":
      return t("tools:network_rules_try_effect_block");
    case "redirect":
      return t("tools:network_rules_try_effect_redirect", { url: action.url });
    case "allow":
      return t("tools:network_rules_try_effect_allow");
  }
}

function useHeaderOperationLabels(): Record<(typeof HEADER_OPERATION_ORDER)[number], string> {
  const { t } = useTranslation();
  return {
    set: t("tools:network_rules_header_op_set"),
    append: t("tools:network_rules_header_op_append"),
    remove: t("tools:network_rules_header_op_remove"),
  };
}

export default function RuleForm({
  template,
  templateLabel,
  state,
  scope,
  excluded,
  actionErrors,
  condition,
  touched,
  saving,
  canSave,
  submitError,
  onChange,
  onBlurScope,
  onChangeTemplate,
  onCancel,
  onSubmit,
}: RuleFormProps) {
  const { t } = useTranslation();
  const domainErrors = useDomainErrorLabels();
  const draftErrors = useDraftErrorLabels();
  const resourceTypeLabels = useResourceTypeLabels();
  const showScopeErrors = touched && !state.allSites && state.websites.trim() !== "";
  const match = useMemo(
    () => (state.tryUrl.trim() ? matchRuleUrl(condition, state.tryUrl) : undefined),
    [condition, state.tryUrl]
  );
  const action = useMemo(() => buildAction(template, state.draft), [template, state.draft]);
  const effect = useActionEffectLabel(action);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex-1 space-y-5 overflow-y-auto scrollbar-custom px-6 py-5">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className={ACTION_TONES[action.type]}>
            {templateLabel}
          </Badge>
          <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={onChangeTemplate}>
            {t("tools:network_rules_change_template")}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="network-rule-scope">{t("tools:network_rules_field_scope")}</Label>
          <Textarea
            id="network-rule-scope"
            value={state.websites}
            disabled={state.allSites || saving}
            placeholder="example.com"
            aria-invalid={showScopeErrors && scope.errors.length > 0}
            onChange={(event) => onChange({ websites: event.target.value })}
            onBlur={onBlurScope}
          />
          <p className="text-xs text-muted-foreground">{t("tools:network_rules_scope_help")}</p>
          {!state.allSites && scope.domains.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {scope.domains.map((domain) => (
                <Badge key={domain} variant="secondary" className="font-mono font-normal">
                  {domain}
                </Badge>
              ))}
            </div>
          )}
          {showScopeErrors && scope.errors.length > 0 && (
            <div className="space-y-1 text-sm text-destructive" role="alert">
              {scope.errors.map((error) => (
                <p key={`${error.tokenIndex}-${error.messageKey}`}>{domainErrors[error.messageKey]}</p>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
            <Checkbox
              checked={state.allSites}
              disabled={saving}
              aria-label={t("tools:network_rules_all_websites")}
              onCheckedChange={(checked) => onChange({ allSites: checked === true })}
            />
            <span className="space-y-1">
              <span className="block font-medium">{t("tools:network_rules_all_websites")}</span>
              <span className="flex items-center gap-1 text-xs text-warning-fg">
                <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                {t("tools:network_rules_all_sites_warning")}
              </span>
            </span>
          </label>
        </div>

        <ActionFields
          template={template}
          state={state}
          errors={actionErrors}
          errorLabels={draftErrors}
          saving={saving}
          onChange={onChange}
        />

        <div className="space-y-2">
          <Label htmlFor="network-rule-name">
            {t("tools:network_rules_field_name")}{" "}
            <span className="font-normal text-muted-foreground">{t("tools:network_rules_optional")}</span>
          </Label>
          <Input
            id="network-rule-name"
            value={state.name}
            disabled={saving}
            maxLength={MAX_RULE_NAME_LENGTH}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <Label htmlFor="network-rule-try">{t("tools:network_rules_try_it")}</Label>
          <Input
            id="network-rule-try"
            value={state.tryUrl}
            disabled={saving}
            placeholder="https://example.com/page"
            onChange={(event) => onChange({ tryUrl: event.target.value })}
          />
          {match && (
            <p role="status" className={cn("text-xs", match === "match" ? "text-success-fg" : "text-muted-foreground")}>
              {match === "match" && t("tools:network_rules_try_match_effect", { effect })}
              {match === "scope-only" && t("tools:network_rules_try_scope_only")}
              {match === "no-match" && t("tools:network_rules_try_no_match")}
              {match === "invalid" && t("tools:network_rules_try_invalid")}
            </p>
          )}
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="w-full justify-between px-2" disabled={saving}>
              {t("tools:network_rules_advanced")}
              <ChevronDown className="size-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            <CheckboxGrid
              label={t("tools:network_rules_field_resource_types")}
              options={NETWORK_RULE_RESOURCE_TYPES}
              optionLabel={(type) => resourceTypeLabels[type]}
              selected={state.resourceTypes}
              disabled={saving}
              onToggle={(value, checked) =>
                onChange({
                  resourceTypes: checked
                    ? [...state.resourceTypes, value]
                    : state.resourceTypes.filter((item) => item !== value),
                })
              }
            />
            <CheckboxGrid
              label={t("tools:network_rules_field_request_methods")}
              options={NETWORK_RULE_REQUEST_METHODS}
              optionLabel={(method) => method.toUpperCase()}
              selected={state.requestMethods}
              disabled={saving}
              onToggle={(value, checked) =>
                onChange({
                  requestMethods: checked
                    ? [...state.requestMethods, value]
                    : state.requestMethods.filter((item) => item !== value),
                })
              }
            />
            <div className="space-y-2">
              <Label htmlFor="network-rule-excluded">{t("tools:network_rules_field_excluded_domains")}</Label>
              <Textarea
                id="network-rule-excluded"
                value={state.excludedWebsites}
                disabled={state.allSites || saving}
                onChange={(event) => onChange({ excludedWebsites: event.target.value })}
              />
              {excluded.errors.length > 0 && state.excludedWebsites.trim() !== "" && (
                <div className="space-y-1 text-sm text-destructive" role="alert">
                  {excluded.errors.map((error) => (
                    <p key={`${error.tokenIndex}-${error.messageKey}`}>{domainErrors[error.messageKey]}</p>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {submitError && (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        )}
      </div>

      <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {t("tools:network_rules_cancel")}
        </Button>
        <Button type="submit" disabled={saving || !canSave}>
          {t("tools:network_rules_save")}
        </Button>
      </footer>
    </form>
  );
}

function CheckboxGrid<T extends string>({
  label,
  options,
  optionLabel,
  selected,
  disabled,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  optionLabel: (option: T) => string;
  selected: T[];
  disabled: boolean;
  onToggle: (value: T, checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={selected.includes(option)}
              disabled={disabled}
              aria-label={optionLabel(option)}
              onCheckedChange={(checked) => onToggle(option, checked === true)}
            />
            <span>{optionLabel(option)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ActionFields({
  template,
  state,
  errors,
  errorLabels,
  saving,
  onChange,
}: {
  template: RuleTemplateId;
  state: RuleFormState;
  errors: ActionDraftErrors;
  errorLabels: Record<DraftErrorKey, string>;
  saving: boolean;
  onChange: (patch: Partial<RuleFormState>) => void;
}) {
  const { t } = useTranslation();
  const actionLabels = useActionLabels();
  const { draft } = state;
  const patchDraft = (patch: Partial<ActionDraft>) => onChange({ draft: { ...draft, ...patch } });
  const actionError = errors.action && errorLabels[errors.action];

  if (template === "csp") {
    const cspTone = ACTION_TONES[ACTION_TYPE_BY_TEMPLATE.csp];
    return (
      <div className="space-y-2">
        <Label>{t("tools:network_rules_field_removed_headers")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {CSP_RESPONSE_HEADERS.map((header) => (
            <Badge key={header} variant="secondary" className={cn("font-mono font-normal", cspTone)}>
              {header}
            </Badge>
          ))}
          {draft.includeXFrameOptions && (
            <Badge variant="secondary" className={cn("font-mono font-normal", cspTone)}>
              {X_FRAME_OPTIONS_HEADER}
            </Badge>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={draft.includeXFrameOptions}
            disabled={saving}
            onCheckedChange={(checked) => patchDraft({ includeXFrameOptions: checked === true })}
          />
          {t("tools:network_rules_csp_include_xfo")}
        </label>
      </div>
    );
  }

  if (template === "userAgent") {
    return (
      <div className="space-y-2">
        <Label htmlFor="network-rule-user-agent">{t("tools:network_rules_field_user_agent")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: t("tools:network_rules_ua_preset_iphone"), value: USER_AGENT_PRESETS.iphone },
            { label: t("tools:network_rules_ua_preset_android"), value: USER_AGENT_PRESETS.android },
            { label: t("tools:network_rules_ua_preset_windows"), value: USER_AGENT_PRESETS.windows },
          ].map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="outline"
              size="xs"
              disabled={saving}
              onClick={() => patchDraft({ userAgent: preset.value })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Textarea
          id="network-rule-user-agent"
          value={draft.userAgent}
          disabled={saving}
          onChange={(event) => patchDraft({ userAgent: event.target.value })}
        />
      </div>
    );
  }

  if (template === "referer") {
    return (
      <div className="space-y-2">
        <Label>{t("tools:network_rules_field_referer")}</Label>
        <Select
          value={draft.refererOperation}
          disabled={saving}
          onValueChange={(value: "set" | "remove") => patchDraft({ refererOperation: value })}
        >
          <SelectTrigger aria-label={t("tools:network_rules_field_referer")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="set">{t("tools:network_rules_referer_set")}</SelectItem>
            <SelectItem value="remove">{t("tools:network_rules_referer_remove")}</SelectItem>
          </SelectContent>
        </Select>
        {draft.refererOperation === "set" && (
          <Input
            value={draft.referer}
            disabled={saving}
            placeholder="https://example.com/"
            aria-label={t("tools:network_rules_referer_set")}
            onChange={(event) => patchDraft({ referer: event.target.value })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {template === "custom" && (
        <div className="space-y-2">
          <Label>{t("tools:network_rules_field_action_type")}</Label>
          <Select
            value={draft.actionType}
            disabled={saving}
            onValueChange={(value: NetworkRuleActionType) => patchDraft({ actionType: value })}
          >
            <SelectTrigger aria-label={t("tools:network_rules_field_action_type")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                [
                  "removeResponseHeaders",
                  "modifyRequestHeaders",
                  "modifyResponseHeaders",
                  "block",
                  "redirect",
                  "allow",
                ] as const
              ).map((type) => (
                <SelectItem key={type} value={type}>
                  {actionLabels[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {draft.actionType === "redirect" && (
        <div className="space-y-2">
          <Label htmlFor="network-rule-redirect">{t("tools:network_rules_field_redirect_url")}</Label>
          <Input
            id="network-rule-redirect"
            value={draft.redirectUrl}
            disabled={saving}
            placeholder="https://example.com/replacement.js"
            aria-invalid={errors.action === "redirect_url_invalid"}
            onChange={(event) => patchDraft({ redirectUrl: event.target.value })}
          />
          {actionError && (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}
        </div>
      )}

      {editsHeaderList(draft.actionType) && (
        <HeaderRows
          actionType={draft.actionType}
          headers={draft.headers}
          errors={errors.headers}
          errorLabels={errorLabels}
          saving={saving}
          onChange={(headers) => patchDraft({ headers })}
        />
      )}
    </div>
  );
}

function HeaderRows({
  actionType,
  headers,
  errors,
  errorLabels,
  saving,
  onChange,
}: {
  actionType: NetworkRuleActionType;
  headers: HeaderDraft[];
  errors: (DraftErrorKey | undefined)[];
  errorLabels: Record<DraftErrorKey, string>;
  saving: boolean;
  onChange: (headers: HeaderDraft[]) => void;
}) {
  const { t } = useTranslation();
  const operationLabels = useHeaderOperationLabels();
  const withValues = actionType !== "removeResponseHeaders";
  const patchRow = (index: number, patch: Partial<HeaderDraft>) =>
    onChange(headers.map((row, current) => (current === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      <Label>
        {actionType === "removeResponseHeaders"
          ? t("tools:network_rules_field_removed_headers")
          : editsRequestHeaders(actionType)
            ? t("tools:network_rules_field_request_headers")
            : t("tools:network_rules_field_response_headers")}
      </Label>
      {/* 黑名单是这一栏的固有约束，等用户敲完再报错等于让他白填一次。 */}
      {editsRequestHeaders(actionType) && (
        <p className="text-xs text-muted-foreground">{t("tools:network_rules_header_denied_note")}</p>
      )}
      {headers.map((row, index) => {
        const error = errors[index];
        const message = error ? errorLabels[error] : "";
        return (
          <div key={index} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-[140px] flex-1 font-mono"
                value={row.header}
                disabled={saving}
                placeholder="x-example"
                aria-label={t("tools:network_rules_header_name")}
                aria-invalid={message !== ""}
                onChange={(event) => patchRow(index, { header: event.target.value })}
              />
              {withValues && (
                <Select
                  value={row.operation}
                  disabled={saving}
                  onValueChange={(value: HeaderDraft["operation"]) => patchRow(index, { operation: value })}
                >
                  <SelectTrigger className="w-[104px]" aria-label={t("tools:network_rules_header_operation")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEADER_OPERATION_ORDER.map((operation) => (
                      <SelectItem key={operation} value={operation}>
                        {operationLabels[operation]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {withValues && row.operation !== "remove" && (
                <Input
                  className="min-w-[140px] flex-1"
                  value={row.value}
                  disabled={saving}
                  aria-label={t("tools:network_rules_header_value")}
                  onChange={(event) => patchRow(index, { value: event.target.value })}
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={saving || headers.length === 1}
                aria-label={t("tools:network_rules_remove_header")}
                onClick={() => onChange(headers.filter((_, current) => current !== index))}
              >
                <X className="size-4" />
              </Button>
            </div>
            {message && (
              <p className="text-sm text-destructive" role="alert">
                {message}
              </p>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saving || headers.length >= MAX_RULE_HEADERS}
        onClick={() => onChange([...headers, { header: "", operation: withValues ? "set" : "remove", value: "" }])}
      >
        <Plus className="size-4" />
        {t("tools:network_rules_add_header")}
      </Button>
    </div>
  );
}
