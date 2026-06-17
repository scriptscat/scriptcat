import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Input } from "@App/pages/components/ui/input";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { systemConfig, message } from "@App/pages/store/global";
import { SystemClient } from "@App/app/service/service_worker/client";
import { t } from "@App/locales/locales";
import { toast } from "sonner";

export function DevToolsSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const [url, setUrl] = useState("");
  const [reconnect, setReconnect] = useState(false);

  useEffect(() => {
    Promise.resolve(systemConfig.get("vscode_url")).then((v) => setUrl((v as string) ?? ""));
    Promise.resolve(systemConfig.get("vscode_reconnect")).then((v) => setReconnect(Boolean(v)));
  }, []);

  const connect = () => {
    systemConfig.set("vscode_url", url);
    systemConfig.set("vscode_reconnect", reconnect);
    const systemClient = new SystemClient(message);
    systemClient
      .connectVSCode({ url, reconnect })
      .then(() => toast.success(t("tools:connection_success")))
      .catch((e) => toast.error(`${t("tools:connection_failed")}: ${e}`));
  };

  return (
    <SettingCard
      id="dev-tools"
      title={t("tools:development_tool")}
      titleAction={
        <a
          href="https://www.bilibili.com/video/BV16q4y157CP"
          target="_blank"
          rel="noreferrer"
          aria-label="vscode_help"
          className="text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="size-4" />
        </a>
      }
      description={t("tools:vscode_url")}
      register={register}
    >
      <SettingRow label={t("tools:vscode_url")}>
        <Input
          aria-label="vscode_url_input"
          className="w-[280px]"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </SettingRow>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          aria-label="vscode_reconnect"
          checked={reconnect}
          onCheckedChange={(c) => setReconnect(c === true)}
        />
        {t("tools:auto_connect_vscode_service")}
      </label>
      <div>
        <Button aria-label="vscode_connect" size="sm" onClick={connect}>
          {t("tools:connect")}
        </Button>
      </div>
    </SettingCard>
  );
}
