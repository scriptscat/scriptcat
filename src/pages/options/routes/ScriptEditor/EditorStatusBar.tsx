import { useTranslation } from "react-i18next";
import type { EditorStatus } from "./tabs/CodePane";

export interface EditorStatusBarProps {
  status: EditorStatus | null;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function EditorStatusBar({ status }: EditorStatusBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        {status && <span>{t("editor:line_col", { line: status.line, col: status.col })}</span>}
      </div>
      <div className="flex items-center gap-3">{status && <span>{formatBytes(status.size)}</span>}</div>
    </div>
  );
}
