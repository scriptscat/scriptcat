import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";

const secondsLeft = (expiresAt: number) => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));

/**
 * 顶栏 TTL 倒计时胶囊：外部接入的确认操作在 op.expiresAt 后作废（设计 §7 审批窗口 ~几十秒 ~5min）。
 * 每秒刷新，归零后置灰——提示用户该请求已到时。
 */
export function CountdownChip({ expiresAt }: { expiresAt: number }) {
  const { t } = useTranslation("external_access");
  const [remaining, setRemaining] = useState(() => secondsLeft(expiresAt));

  // 初值由 useState initializer 给出；这里只订阅每秒的外部时钟 tick（setState 在回调里，非同步）。
  useEffect(() => {
    const id = setInterval(() => setRemaining(secondsLeft(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span
      data-testid="external-access-confirm-countdown"
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground",
        remaining === 0 && "opacity-60"
      )}
    >
      <Timer className="size-3.5" aria-hidden />
      {t("external_access:confirm_countdown", { seconds: remaining })}
    </span>
  );
}
