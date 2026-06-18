import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Blocks } from "lucide-react";
import type { SkillScriptRecord } from "@App/app/service/agent/core/types";
import { Button } from "@App/pages/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@App/pages/components/ui/dialog";
import type { SkillDetail } from "./skill_detail";

// 详情代码区共用样式：等宽字体、限高滚动、保留换行
const CODE_BOX =
  "scrollbar-custom max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-muted p-3.5 font-mono text-[13px] leading-relaxed text-fg-secondary";

export function SkillDetailDialog({
  detail,
  open,
  onOpenChange,
  onOpenConfig,
}: {
  detail: SkillDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenConfig: () => void;
}) {
  const { t } = useTranslation(["agent", "common"]);
  const [viewingTool, setViewingTool] = useState<SkillScriptRecord | null>(null);

  // 详情关闭时重置工具代码查看态
  useEffect(() => {
    if (!open) setViewingTool(null);
  }, [open]);

  if (!detail) return null;
  const { record, scripts, references } = detail;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[600px] gap-0 p-0" aria-describedby={undefined}>
          <DialogHeader className="border-b border-border px-[22px] py-4">
            <DialogTitle>{`${t("agent:skills_detail")} — ${record.name}`}</DialogTitle>
          </DialogHeader>

          <div className="scrollbar-custom flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-[22px] py-[18px]">
            {/* 身份 */}
            <div className="flex items-start gap-3">
              <div className="flex size-[42px] shrink-0 items-center justify-center rounded-[11px] bg-primary-light">
                <Sparkles className="size-5 text-primary" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[15px] font-semibold text-foreground">{record.name}</span>
                  {record.version && (
                    <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-fg-secondary">
                      {`v${record.version}`}
                    </span>
                  )}
                </div>
                {record.description && (
                  <p className="text-[13px] leading-snug text-fg-secondary">{record.description}</p>
                )}
              </div>
            </div>

            {/* 提示词 SKILL.md */}
            <section className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-fg-secondary">{`${t("agent:skills_prompt")} (SKILL.md)`}</span>
              <pre className={CODE_BOX}>{record.prompt}</pre>
            </section>

            {/* 工具（点击查看代码） */}
            {scripts.length > 0 && (
              <section className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-fg-secondary">
                  {`${t("agent:skills_tools")} (${scripts.length}) · ${t("agent:skills_click_to_view_code")}`}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {scripts.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setViewingTool(s)}
                      data-testid={`skill-tool-${s.name}`}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 font-mono text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      <Blocks className="size-3" />
                      {s.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* 参考资料 */}
            {references.length > 0 && (
              <section className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-fg-secondary">
                  {`${t("agent:skills_references")} (${references.length})`}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {references.map((r) => (
                    <span
                      key={r.name}
                      className="inline-flex items-center rounded-md bg-success-bg px-2.5 py-1 font-mono text-xs font-medium text-success-fg"
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          <DialogFooter className="border-t border-border px-[22px] py-3.5">
            {record.config && Object.keys(record.config).length > 0 && (
              <Button variant="outline" data-testid="skill-open-config" onClick={onOpenConfig}>
                {t("agent:skills_open_config", { defaultValue: "打开配置" })}
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>{t("common:close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 工具脚本代码查看弹窗 */}
      <Dialog open={!!viewingTool} onOpenChange={(o) => !o && setViewingTool(null)}>
        <DialogContent className="max-w-[720px] gap-0 p-0" aria-describedby={undefined}>
          <DialogHeader className="border-b border-border px-[22px] py-4">
            <DialogTitle>{`${t("agent:skills_tool_code")} — ${viewingTool?.name ?? ""}`}</DialogTitle>
          </DialogHeader>
          <div className="px-[22px] py-[18px]">
            <pre className={CODE_BOX + " max-h-[60vh]"}>{viewingTool?.code}</pre>
          </div>
          <DialogFooter className="border-t border-border px-[22px] py-3.5">
            <Button onClick={() => setViewingTool(null)}>{t("common:close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
