import { useState } from "react";
import { SettingCard } from "../../../components/SettingCard";
import { Textarea } from "@App/pages/components/ui/textarea";
import { useSystemConfig } from "../../../hooks/useSystemConfig";
import { blackListSelfCheck } from "@App/pkg/utils/match";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";

export function SecuritySection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [blacklist, setBlacklist] = useSystemConfig("blacklist");
  const [draft, setDraft] = useState("");

  // blacklist 异步加载或被外部订阅更新时，渲染期间比较上一个值再同步到本地草稿
  const [prevBlacklist, setPrevBlacklist] = useState(blacklist);
  if (blacklist !== prevBlacklist) {
    setPrevBlacklist(blacklist);
    if (blacklist !== undefined) setDraft(blacklist as string);
  }

  const save = () => {
    const lines = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const result = blackListSelfCheck(lines);
    if (!result.ok) {
      notify.error(`${t("settings:expression_format_error")}: ${result.line}`);
      return;
    }
    setBlacklist(draft);
  };

  return (
    <SettingCard
      id="security"
      title={t("settings:security")}
      description={t("settings:blacklist_pages_desc")}
      register={register}
    >
      <div className="text-[13px] font-medium text-foreground">{t("settings:blacklist_pages")}</div>
      <Textarea
        data-testid="blacklist_textarea"
        aria-label={t("settings:blacklist_pages")}
        placeholder={t("settings:blacklist_placeholder") ?? ""}
        className="min-h-[120px] font-mono text-xs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
      />
    </SettingCard>
  );
}
