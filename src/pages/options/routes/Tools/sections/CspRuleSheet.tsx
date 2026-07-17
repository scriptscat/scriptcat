import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CspRule, CspRuleTarget } from "@App/app/repo/csp_rule";
import { parseCspDomains, type CspDomainParseResult } from "@App/pkg/utils/csp_domain";
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
import { Badge } from "@App/pages/components/ui/badge";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@App/pages/components/ui/collapsible";
import { Input } from "@App/pages/components/ui/input";
import { Label } from "@App/pages/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@App/pages/components/ui/sheet";
import { Switch } from "@App/pages/components/ui/switch";
import { Textarea } from "@App/pages/components/ui/textarea";

export type CspRuleFormValue = {
  name: string;
  enabled: boolean;
  target: CspRuleTarget;
};

type CspRuleSheetProps = {
  open: boolean;
  rule: CspRule | undefined;
  baseRevision: number;
  existingRules: CspRule[];
  onOpenChange: (open: boolean) => void;
  onSave: (value: CspRuleFormValue) => Promise<boolean>;
};

function errorText(t: (key: string) => string, messageKey: string): string {
  return t(`tools:csp_error_${messageKey}`);
}

export function CspRuleSheet({ open, rule, existingRules, onOpenChange, onSave }: CspRuleSheetProps) {
  const { t } = useTranslation();
  const initialTarget = rule?.target;
  const initialDomainTarget = initialTarget && initialTarget.type === "domains" ? initialTarget : undefined;
  const [websites, setWebsites] = useState(() => initialDomainTarget?.domains.join("\n") ?? "");
  const [name, setName] = useState(() => rule?.name ?? "");
  const [enabled, setEnabled] = useState(() => rule?.enabled ?? true);
  const [allSites, setAllSites] = useState(() => initialTarget?.type === "allSites");
  const [scopeOpen, setScopeOpen] = useState(() => initialTarget?.type === "allSites");
  const [domainResult, setDomainResult] = useState<CspDomainParseResult>(() => ({
    domains: initialDomainTarget?.domains ?? [],
    errors: [],
  }));
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [pendingAllSites, setPendingAllSites] = useState<CspRuleFormValue | undefined>();

  const duplicateDomains = useMemo(() => {
    if (allSites || domainResult.domains.length === 0) return [];
    const existing = new Set(
      existingRules
        .filter((item) => item.id !== rule?.id)
        .flatMap((item) => (item.target.type === "domains" ? item.target.domains : []))
    );
    return domainResult.domains.filter((domain) => existing.has(domain));
  }, [allSites, domainResult.domains, existingRules, rule?.id]);

  const validateDomains = (value: string) => {
    const result = parseCspDomains(value);
    setDomainResult(result);
    return result;
  };

  const submit = async (value: CspRuleFormValue) => {
    const saved = await onSave(value);
    if (!saved) setSubmitError(t("tools:csp_storage_error"));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    setSubmitError("");
    const result = allSites ? { domains: [], errors: [] } : validateDomains(websites);
    if (!allSites && result.errors.length > 0) return;
    if (!allSites && result.domains.length > 100) {
      setDomainResult({
        domains: result.domains,
        errors: [{ tokenIndex: 0, input: websites, messageKey: "domain_count_invalid" }],
      });
      return;
    }
    const value: CspRuleFormValue = {
      name,
      enabled,
      target: allSites ? { type: "allSites" } : { type: "domains", domains: result.domains },
    };
    if (value.target.type === "allSites" && value.enabled) {
      setPendingAllSites(value);
      return;
    }
    void submit(value);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex h-full w-full flex-col p-0 sm:max-w-[480px]">
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader className="shrink-0 border-b border-border px-6 py-5 pr-14 text-left">
              <SheetTitle>{rule ? t("tools:csp_edit_title") : t("tools:csp_add_title")}</SheetTitle>
              <SheetDescription>{t("tools:csp_rules_description")}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="space-y-2">
                <Label htmlFor="csp-websites">{t("tools:csp_websites")}</Label>
                <Textarea
                  id="csp-websites"
                  aria-label={t("tools:csp_websites")}
                  value={websites}
                  disabled={allSites}
                  placeholder="example.com"
                  onChange={(event) => {
                    setWebsites(event.target.value);
                    if (touched) validateDomains(event.target.value);
                  }}
                  onBlur={() => {
                    setTouched(true);
                    if (!allSites) validateDomains(websites);
                  }}
                  aria-invalid={touched && domainResult.errors.length > 0}
                />
                <p className="text-xs text-muted-foreground">{t("tools:csp_websites_help")}</p>
                {domainResult.domains.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label={t("tools:csp_websites") + " normalized"}>
                    {domainResult.domains.map((domain) => (
                      <Badge key={domain} variant="secondary">
                        {domain}
                      </Badge>
                    ))}
                  </div>
                )}
                {touched && domainResult.errors.length > 0 && (
                  <div className="space-y-1 text-sm text-destructive" role="alert">
                    {domainResult.errors.map((error) => (
                      <p key={`${error.tokenIndex}-${error.messageKey}`}>{errorText(t, error.messageKey)}</p>
                    ))}
                  </div>
                )}
                {duplicateDomains.length > 0 && (
                  <p className="text-sm text-warning-fg">{t("tools:csp_duplicate_domain_notice")}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="csp-rule-name">
                  {t("tools:csp_rule_name")}{" "}
                  <span className="font-normal text-muted-foreground">
                    {"("}
                    {t("tools:csp_optional")}
                    {")"}
                  </span>
                </Label>
                <Input
                  id="csp-rule-name"
                  aria-label={t("tools:csp_rule_name")}
                  value={name}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="csp-rule-enabled">{t("tools:csp_enabled_field")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {enabled ? t("tools:csp_enabled") : t("tools:csp_disabled")}
                  </p>
                </div>
                <Switch
                  id="csp-rule-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  aria-label={t("tools:csp_enabled_field")}
                />
              </div>

              <Collapsible open={scopeOpen} onOpenChange={setScopeOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="w-full justify-between px-2">
                    {t("tools:csp_advanced_scope")}
                    <ChevronDown className="size-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
                    <Checkbox checked={allSites} onCheckedChange={(checked) => setAllSites(checked === true)} />
                    <span className="space-y-1">
                      <span className="block font-medium">{t("tools:csp_all_websites")}</span>
                      <span className="block text-xs text-muted-foreground">{t("tools:csp_all_sites_warning")}</span>
                    </span>
                  </label>
                  {allSites && (
                    <div className="flex gap-2 rounded-md border border-warning-bg bg-warning-bg/20 p-3 text-sm text-warning-fg">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>{t("tools:csp_all_sites_warning")}</span>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {submitError && (
                <p className="text-sm text-destructive" role="alert">
                  {submitError}
                </p>
              )}
            </div>
            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background px-6 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("tools:csp_cancel")}
              </Button>
              <Button type="submit">{t("tools:csp_save_rule")}</Button>
            </footer>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingAllSites !== undefined}
        onOpenChange={(value) => !value && setPendingAllSites(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tools:csp_confirm_all_sites_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("tools:csp_confirm_all_sites_description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAllSites(undefined)}>{t("tools:csp_cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingAllSites) void submit(pendingAllSites);
                setPendingAllSites(undefined);
              }}
            >
              {t("tools:csp_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
