import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentationSite } from "@App/app/const";
import type { Export, ExportTarget } from "@App/app/repo/export";
import { ExportDAO } from "@App/app/repo/export";
import type { Script } from "@App/app/repo/scripts";
import { ScriptCodeDAO } from "@App/app/repo/scripts";
import { localePath } from "@App/locales/locales";
import { makeBlobURL } from "@App/pkg/utils/utils";
import type { ExportParams } from "@Packages/cloudscript/cloudscript";
import { parseExportCookie, parseExportValue } from "@Packages/cloudscript/cloudscript";
import CloudScriptFactory from "@Packages/cloudscript/factory";
import { createJSZip } from "@App/pkg/utils/jszip-x";
import { BookOpen } from "lucide-react";
import { notify } from "@App/pages/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@App/pages/components/ui/dialog";
import { Label } from "@App/pages/components/ui/label";
import { Textarea } from "@App/pages/components/ui/textarea";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Button } from "@App/pages/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { createPreloadableQuery } from "@App/pages/preloadable-query";

// 从脚本 metadata 读取默认导出表达式
export function cloudDefaultParams(script: Script): Pick<ExportParams, "exportValue" | "exportCookie"> {
  return {
    exportValue: script.metadata.exportvalue?.[0] ?? "",
    exportCookie: script.metadata.exportcookie?.[0] ?? "",
  };
}

const emptyParams = (): ExportParams => ({
  exportValue: "",
  exportCookie: "",
  overwriteValue: false,
  overwriteCookie: false,
});

type CloudScriptPlanData = { model: Export | undefined };

const cloudScriptPlanQuery = createPreloadableQuery<Script, CloudScriptPlanData>({
  key: (script) => `${script.uuid}:${script.updatetime ?? 0}`,
  load: async (script, signal) => {
    const model = await new ExportDAO().findByScriptID(script.uuid);
    if (signal.aborted) throw new DOMException("CloudScriptPlan preload aborted", "AbortError");
    return { model };
  },
});

export function preloadCloudScriptPlan(script: Script): Promise<CloudScriptPlanData> {
  return cloudScriptPlanQuery.preload(script);
}

export function invalidateCloudScriptPlan(script?: Script) {
  cloudScriptPlanQuery.invalidate(script);
}

export interface CloudScriptPlanProps {
  script: Script;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CloudScriptPlan({ script, open, onOpenChange }: CloudScriptPlanProps) {
  const { t } = useTranslation();
  const query = cloudScriptPlanQuery.useQuery(script, { enabled: open });

  useEffect(() => () => invalidateCloudScriptPlan(script), [script]);
  useEffect(() => {
    if (!query.isError) return;
    notify.error(
      `${t("script:operation_failed")}: ${query.error instanceof Error ? query.error.message : query.error}`
    );
    query.setData({ model: undefined });
  }, [query, t]);

  if (!query.data) return null;
  return (
    <CloudScriptPlanContent
      key={script.uuid}
      script={script}
      open={open}
      onOpenChange={onOpenChange}
      initialModel={query.data.model}
      onPlanChange={(model) => query.setData({ model })}
    />
  );
}

function CloudScriptPlanContent({
  script,
  open,
  onOpenChange,
  initialModel,
  onPlanChange,
}: CloudScriptPlanProps & { initialModel: Export | undefined; onPlanChange: (model: Export) => void }) {
  const { t } = useTranslation();
  const initialTarget = initialModel?.target ?? "local";
  const [cloudScriptType, setCloudScriptType] = useState<ExportTarget>(initialTarget);
  const [model, setModel] = useState<Export | undefined>(initialModel);
  const [params, setParams] = useState<ExportParams>(() => {
    const saved = initialModel?.params[initialTarget];
    return { ...emptyParams(), ...(saved ?? cloudDefaultParams(script)) };
  });

  const setField = <K extends keyof ExportParams>(key: K, value: ExportParams[K]) =>
    setParams((prev) => ({ ...prev, [key]: value }));

  const handleConfirm = async () => {
    // 保存导出计划
    const dao = new ExportDAO();
    const next: Export = {
      ...(model ?? { uuid: script.uuid, target: "local", params: {} }),
      target: cloudScriptType,
      params: { ...(model?.params ?? {}), [cloudScriptType]: params },
    };
    setModel(next);
    onPlanChange(next);
    dao.save(next).catch((err) => notify.error(`${t("editor:save_failed")}: ${err}`));

    notify.info(t("editor:exporting"));
    const values = await parseExportValue(script, params.exportValue);
    const cookies = await parseExportCookie(params.exportCookie);

    if (cloudScriptType === "local") {
      const zipFile = createJSZip();
      const cloudScript = CloudScriptFactory.create("local", { zip: zipFile, ...params });
      const code = await new ScriptCodeDAO().findByUUID(script.uuid);
      if (!code) {
        notify.error(t("editor:invalid_script_code"));
        return;
      }
      cloudScript.exportCloud(script, code.code, values, cookies);
      const zipOutput = await zipFile.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
        comment: "Created by Scriptcat",
      });
      const url = makeBlobURL({ blob: zipOutput, persistence: false }) as string;
      chrome.downloads.download({ url, saveAs: true, filename: `${script.uuid}.zip` });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* 标题区：「上传到云端」+ 文档链接 同行，脚本名副标题在下，底部分隔线 */}
        <DialogHeader className="gap-0.5 border-b border-border px-5 py-4 text-left">
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="text-base font-semibold">{t("editor:upload_to_cloud")}</DialogTitle>
            <a
              href={`${DocumentationSite}${localePath}/docs/dev/cloudcat/`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-primary hover:text-primary/80"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </a>
          </div>
          <DialogDescription className="truncate text-xs">{script.name}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t("editor:upload_to")}</Label>
            <Select value={cloudScriptType} onValueChange={(v) => setCloudScriptType(v as ExportTarget)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">{t("settings:local")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t("editor:value_export_expression")}</Label>
            <Textarea rows={2} value={params.exportValue} onChange={(e) => setField("exportValue", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={params.overwriteValue} onCheckedChange={(c) => setField("overwriteValue", c === true)} />
            <span className="text-sm">{t("editor:overwrite_original_value_on_import")}</span>
          </label>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t("editor:cookie_export_expression")}</Label>
            <Textarea rows={2} value={params.exportCookie} onChange={(e) => setField("exportCookie", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={params.overwriteCookie}
              onCheckedChange={(c) => setField("overwriteCookie", c === true)}
            />
            <span className="text-sm">{t("editor:overwrite_original_cookie_on_import")}</span>
          </label>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3 sm:justify-between">
          <Button variant="outline" onClick={() => setParams((prev) => ({ ...prev, ...cloudDefaultParams(script) }))}>
            {t("editor:restore_default_values")}
          </Button>
          <Button onClick={handleConfirm}>{t("export")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
