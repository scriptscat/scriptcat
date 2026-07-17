import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import type { Attachment, AudioBlock } from "@App/app/service/agent/core/types";
import { agentChatRepo } from "@App/app/repo/agent_chat";
import { ImagePreview } from "./ImagePreview";

// 图片附件组件：从 OPFS 懒加载并展示
export function AttachmentImage({ attachment }: { attachment: Attachment }) {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let url: string | null = null;
    void agentChatRepo.getAttachment(attachment.id).then((blob) => {
      if (blob && !revoked) {
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      }
    });
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id]);

  if (!blobUrl) {
    return (
      <div className="w-40 h-24 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  return (
    <ImagePreview src={blobUrl} alt={attachment.name}>
      <img
        src={blobUrl}
        alt={attachment.name}
        className="max-h-48 max-w-xs rounded border border-border object-contain"
      />
    </ImagePreview>
  );
}

// 格式化文件大小
function formatSize(size?: number): string {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// 文件附件组件：显示文件信息和下载按钮
export function AttachmentFile({ attachment }: { attachment: Attachment }) {
  const handleDownload = useCallback(async () => {
    const blob = await agentChatRepo.getAttachment(attachment.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = attachment.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [attachment.id, attachment.name]);

  const sizeText = formatSize(attachment.size);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-accent"
      onClick={handleDownload}
    >
      <Download className="size-3.5 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-foreground">{attachment.name}</span>
        {sizeText && <span className="text-[10px] text-muted-foreground">{sizeText}</span>}
      </div>
    </button>
  );
}

// 音频附件组件：audio 播放器
export function AttachmentAudio({ block }: { block: AudioBlock }) {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let url: string | null = null;
    void agentChatRepo.getAttachment(block.attachmentId).then((blob) => {
      if (blob && !revoked) {
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      }
    });
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [block.attachmentId]);

  if (!blobUrl) {
    return (
      <div className="h-10 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground px-4">
        {t("agent:chat_loading_audio")}
      </div>
    );
  }

  return (
    <div className="my-1">
      {block.name && <span className="text-xs text-muted-foreground mb-1 block">{block.name}</span>}
      <audio controls src={blobUrl} className="max-w-xs" />
    </div>
  );
}
