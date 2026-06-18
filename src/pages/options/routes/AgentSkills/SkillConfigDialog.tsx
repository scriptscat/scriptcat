import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { SkillConfigField, SkillRecord } from "@App/app/service/agent/core/types";
import { agentClient } from "@App/pages/store/features/script";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Label } from "@App/pages/components/ui/label";
import { Switch } from "@App/pages/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@App/pages/components/ui/dialog";

export function SkillConfigDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill: SkillRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["agent", "common"]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !skill?.config) return;
    setLoading(true);
    const config = skill.config;
    agentClient
      .getSkillConfigValues(skill.name)
      .then((saved) => {
        const merged: Record<string, unknown> = {};
        for (const [key, field] of Object.entries(config)) {
          merged[key] = saved[key] !== undefined ? saved[key] : (field.default ?? "");
        }
        setValues(merged);
      })
      .catch(() => {
        const defaults: Record<string, unknown> = {};
        for (const [key, field] of Object.entries(config)) {
          defaults[key] = field.default ?? "";
        }
        setValues(defaults);
      })
      .finally(() => setLoading(false));
  }, [open, skill]);

  if (!skill?.config) return null;
  const config = skill.config;

  const setValue = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await agentClient.saveSkillConfig({ name: skill.name, values });
      toast.success(t("agent:skills_config_saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const renderField = (key: string, field: SkillConfigField) => {
    const value = values[key];
    const labelText = (
      <>
        {field.title || key}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </>
    );

    if (field.type === "switch") {
      return (
        <div key={key} className="flex items-center justify-between gap-3">
          <Label className="text-sm font-medium text-foreground">{labelText}</Label>
          <Switch checked={!!value} onCheckedChange={(v) => setValue(key, v)} />
        </div>
      );
    }

    return (
      <div key={key} className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium text-foreground">{labelText}</Label>
        {field.type === "number" ? (
          <Input
            type="number"
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => setValue(key, e.target.value === "" ? undefined : Number(e.target.value))}
          />
        ) : field.type === "select" ? (
          <Select value={value ? String(value) : ""} onValueChange={(v) => setValue(key, v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(field.values || []).map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={field.secret ? "password" : "text"}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => setValue(key, e.target.value)}
          />
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{`${t("agent:skills_config")} — ${skill.name}`}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("common:loading")}</div>
        ) : (
          <div className="flex flex-col gap-3">
            {Object.entries(config).map(([key, field]) => renderField(key, field))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button disabled={saving} onClick={handleSave}>
            {t("common:save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
