import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles, Upload, Link2, Wrench, FileText } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@App/pages/components/ui/dialog";
import { useSkills } from "../AgentChat/hooks";
import { AgentPageHeader } from "../_agent/AgentPageHeader";
import { AgentEmptyState } from "../_agent/AgentEmptyState";
import { CapabilityTag } from "../_agent/tags";
import { installSkillFromZip, installSkillFromUrl } from "./skill_install";

export default function AgentSkills() {
  const { t } = useTranslation(["agent", "common"]);
  const { skills } = useSkills();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const handleZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    try {
      await installSkillFromZip(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUrl = async () => {
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    try {
      await installSkillFromUrl(value);
      setUrlOpen(false);
      setUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const importActions = (
    <>
      <Button variant="outline" data-testid="skill-import-url" onClick={() => setUrlOpen(true)}>
        <Link2 className="size-4" />
        {t("agent:skills_install_url")}
      </Button>
      <Button data-testid="skill-upload-zip" onClick={() => fileInputRef.current?.click()}>
        <Upload className="size-4" />
        {t("agent:skills_install_zip")}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        data-testid="skill-zip-input"
        className="hidden"
        onChange={handleZip}
      />
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <AgentPageHeader
        icon={Sparkles}
        title={t("agent:skills_title")}
        subtitle={t("agent:skills_subtitle")}
        actions={importActions}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* 已安装列表 / 空状态 */}
        {skills.length === 0 ? (
          <AgentEmptyState
            icon={Sparkles}
            title={t("agent:skills_empty")}
            description={t("agent:skills_empty_desc")}
            action={
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" />
                {t("agent:skills_install_zip")}
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {skills.map((s) => (
              <li key={s.name} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{s.name}</h2>
                  {s.version && (
                    <span className="rounded-md bg-input px-1.5 py-0.5 font-mono text-xs text-foreground">{`v${s.version}`}</span>
                  )}
                </div>
                {s.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <CapabilityTag tone="blue" icon={Wrench}>
                    {t("agent:skills_tools")} {s.toolNames.length}
                  </CapabilityTag>
                  <CapabilityTag tone="violet" icon={FileText}>
                    {t("agent:skills_references")} {s.referenceNames.length}
                  </CapabilityTag>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 从 URL 导入对话框 */}
      <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("agent:skills_install_url")}</DialogTitle>
          </DialogHeader>
          <Input
            data-testid="skill-url-input"
            value={url}
            placeholder={t("agent:skills_url_placeholder")}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUrl();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setUrlOpen(false)}>
              {t("common:close")}
            </Button>
            <Button data-testid="skill-url-confirm" disabled={busy} onClick={handleUrl}>
              {t("common:import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
