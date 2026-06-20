import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Config, ConfigGroup, ConfigType, Script, UserConfig } from "@App/app/repo/scripts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@App/pages/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@App/pages/components/ui/tabs";
import { Input } from "@App/pages/components/ui/input";
import { Textarea } from "@App/pages/components/ui/textarea";
import { Switch } from "@App/pages/components/ui/switch";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Label } from "@App/pages/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { Button } from "@App/pages/components/ui/button";
import { valueClient } from "@App/pages/store/features/script";
import { encodeRValue, type TKeyValuePair } from "@App/pkg/utils/message_value";
import { localePath } from "@App/locales/locales";
import { DocumentationSite } from "@App/app/const";
import { BookOpen } from "lucide-react";
import { notify } from "@App/pages/components/ui/toast";

// 根据配置项推断控件类型（与 @grant 用户配置规则一致：显式 type 优先，否则按 default/values 推断）
export function resolveConfigType(item: Config): ConfigType {
  if (item.type) return item.type;
  if (typeof item.default === "boolean") return "checkbox";
  if (item.values) return typeof item.values === "object" ? "mult-select" : "select";
  if (typeof item.default === "number") return "number";
  return "text";
}

export interface UserConfigPanelProps {
  script: Script;
  userConfig: UserConfig;
  values: { [key: string]: any };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FormState = { [fullKey: string]: any };

// 单个配置项控件
function ConfigField({
  fullKey,
  item,
  value,
  options,
  onChange,
}: {
  fullKey: string;
  item: Config;
  value: any;
  options: any[];
  onChange: (fullKey: string, value: any) => void;
}) {
  const type = resolveConfigType(item);

  switch (type) {
    case "number":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{item.title}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder={item.description}
              min={item.min}
              max={item.max}
              value={value ?? ""}
              onChange={(e) => onChange(fullKey, e.target.value === "" ? undefined : Number(e.target.value))}
            />
            {item.unit && <span className="text-xs text-muted-foreground shrink-0">{item.unit}</span>}
          </div>
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={!!value} onCheckedChange={(c) => onChange(fullKey, c === true)} />
          <span className="text-sm">{item.title || item.description}</span>
        </label>
      );
    case "switch":
      return (
        <div className="flex items-center justify-between">
          <Label className="text-sm">{item.title || item.description}</Label>
          <Switch checked={!!value} onCheckedChange={(c) => onChange(fullKey, c)} />
        </div>
      );
    case "select":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{item.title}</Label>
          <Select value={value === undefined ? undefined : String(value)} onValueChange={(v) => onChange(fullKey, v)}>
            <SelectTrigger>
              <SelectValue placeholder={item.description} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={String(opt)} value={String(opt)}>
                  {String(opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "mult-select": {
      const selected: any[] = Array.isArray(value) ? value : [];
      const toggle = (opt: any, checked: boolean) => {
        const next = checked ? [...selected, opt] : selected.filter((s) => s !== opt);
        onChange(fullKey, next);
      };
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{item.title}</Label>
          <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
            {options.map((opt) => (
              <label key={String(opt)} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={selected.includes(opt)} onCheckedChange={(c) => toggle(opt, c === true)} />
                <span className="text-sm">{String(opt)}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }
    case "textarea":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{item.title}</Label>
          <Textarea
            placeholder={item.description}
            rows={item.rows || 3}
            value={value ?? ""}
            onChange={(e) => onChange(fullKey, e.target.value)}
          />
        </div>
      );
    case "text":
    default:
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{item.title}</Label>
          <Input
            type={item.password ? "password" : "text"}
            placeholder={item.description}
            maxLength={item.max}
            value={value ?? ""}
            onChange={(e) => onChange(fullKey, e.target.value)}
          />
        </div>
      );
  }
}

export default function UserConfigPanel({ script, userConfig, values, open, onOpenChange }: UserConfigPanelProps) {
  const { t } = useTranslation();
  // 过滤 #options，按 sort 顺序得到分组列表
  const groupKeys = useMemo(
    () => (userConfig["#options"]?.sort || Object.keys(userConfig)).filter((k) => k !== "#options"),
    [userConfig]
  );

  const [tab, setTab] = useState(groupKeys[0] ?? "");
  const [form, setForm] = useState<FormState>(values);

  // 打开/切换脚本时，重置表单与激活分组
  useEffect(() => {
    setForm(values);
    setTab(groupKeys[0] ?? "");
  }, [values, groupKeys]);

  const setField = (fullKey: string, value: any) => setForm((prev) => ({ ...prev, [fullKey]: value }));

  // 取下拉选项（支持 bind 绑定到另一个值）
  const optionsOf = (item: Config): any[] => {
    if (item.bind) {
      const bindKey = item.bind.substring(1);
      return form[bindKey] ?? values[bindKey] ?? [];
    }
    return item.values ?? [];
  };

  const sortedItems = (group: ConfigGroup): [string, Config][] =>
    Object.keys(group)
      .sort((a, b) => (group[a].index || 0) - (group[b].index || 0))
      .map((k) => [k, group[k]]);

  // 仅保存当前分组的值
  const handleSave = () => {
    const group = userConfig[tab] as ConfigGroup | undefined;
    if (!group) return;
    const keyValuePairs: TKeyValuePair[] = [];
    for (const key of Object.keys(group)) {
      const fullKey = `${tab}.${key}`;
      const v = form[fullKey];
      if (v === undefined) continue;
      keyValuePairs.push([fullKey, encodeRValue(v)]);
    }
    valueClient.setScriptValues({ uuid: script.uuid, keyValuePairs, isReplace: false, ts: Date.now() });
    notify.success(t("save_success"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* 标题区：脚本名 + 「用户配置」副标题竖向堆叠，底部分隔线 */}
        <DialogHeader className="shrink-0 gap-0.5 border-b border-border px-5 py-4 text-left">
          <DialogTitle className="truncate pr-8 text-base font-semibold">{script.name}</DialogTitle>
          {/* 副标题「用户配置」+ 文档链接同行 */}
          <div className="flex items-center gap-1.5">
            <DialogDescription className="text-xs">{t("editor:user_config")}</DialogDescription>
            <a
              href={`${DocumentationSite}${localePath}/docs/dev/config/`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-primary hover:text-primary/80"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </a>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 w-full flex-1 flex-col">
          {groupKeys.length > 1 && (
            <div className="shrink-0 px-5 pt-3">
              <TabsList>
                {groupKeys.map((gk) => (
                  <TabsTrigger key={gk} value={gk}>
                    {gk}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}
          {groupKeys.map((gk) => (
            <TabsContent key={gk} value={gk} className="mt-0 min-h-0 flex-1 overflow-y-auto scrollbar-custom">
              <div className="flex flex-col gap-4 px-5 py-4">
                {sortedItems((userConfig[gk] as ConfigGroup) || {}).map(([key, item]) => (
                  <ConfigField
                    key={key}
                    fullKey={`${gk}.${key}`}
                    item={item}
                    value={form[`${gk}.${key}`]}
                    options={optionsOf(item)}
                    onChange={setField}
                  />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* 底部：取消 / 保存，顶部分隔线 */}
        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("editor:cancel")}
          </Button>
          <Button onClick={handleSave} title={t("settings:save_only_current_group")}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
