import { useState, useEffect, useCallback } from "react";
import { IconDownload, IconEye } from "@arco-design/web-react/icon";
import type { Attachment, AudioBlock } from "@App/app/service/agent/core/types";
import { AgentChatRepo } from "@App/app/repo/agent_chat";

const repo = new AgentChatRepo();

// 图片附件组件：从 OPFS 懒加载并展示
export function AttachmentImage({ attachment }: { attachment: Attachment }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let revoked = false;
    repo.getAttachment(attachment.id).then((blob) => {
      if (blob && !revoked) {
        setBlobUrl(URL.createObjectURL(blob));
      }
    });
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id]);

  if (!blobUrl) {
    return (
      <div className="tw-w-40 tw-h-24 tw-bg-[var(--color-fill-2)] tw-rounded tw-flex tw-items-center tw-justify-center tw-text-xs tw-text-[var(--color-text-4)]">
        {"Loading..."}
      </div>
    );
  }

  return (
    <>
      <div className="tw-relative tw-inline-block tw-group tw-cursor-pointer" onClick={() => setPreview(true)}>
        <img
          src={blobUrl}
          alt={attachment.name}
          className="tw-max-w-xs tw-max-h-48 tw-rounded tw-border tw-border-solid tw-border-[var(--color-border-1)] tw-object-contain"
        />
        <div className="tw-absolute tw-inset-0 tw-bg-black/0 group-hover:tw-bg-black/20 tw-rounded tw-flex tw-items-center tw-justify-center tw-transition-colors">
          <IconEye
            className="tw-text-white tw-opacity-0 group-hover:tw-opacity-100 tw-transition-opacity"
            style={{ fontSize: 20 }}
          />
        </div>
      </div>
      {/* 全屏预览 */}
      {preview && (
        <div
          className="tw-fixed tw-inset-0 tw-z-[1000] tw-bg-black/80 tw-flex tw-items-center tw-justify-center tw-cursor-pointer"
          onClick={() => setPreview(false)}
        >
          <img
            src={blobUrl}
            alt={attachment.name}
            className="tw-max-w-[90vw] tw-max-h-[90vh] tw-object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// 文件附件组件：显示文件信息和下载按钮
export function AttachmentFile({ attachment }: { attachment: Attachment }) {
  const handleDownload = useCallback(async () => {
    const blob = await repo.getAttachment(attachment.id);
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

  const sizeText = attachment.size
    ? attachment.size < 1024
      ? `${attachment.size} B`
      : attachment.size < 1024 * 1024
        ? `${(attachment.size / 1024).toFixed(1)} KB`
        : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
    : "";

  return (
    <div
      className="tw-inline-flex tw-items-center tw-gap-2 tw-px-3 tw-py-2 tw-rounded-lg tw-bg-[var(--color-fill-1)] tw-border tw-border-solid tw-border-[var(--color-border-1)] tw-cursor-pointer hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
      onClick={handleDownload}
    >
      <IconDownload style={{ fontSize: 14 }} className="tw-text-[var(--color-text-3)]" />
      <div className="tw-flex tw-flex-col">
        <span className="tw-text-xs tw-font-medium tw-text-[var(--color-text-2)]">{attachment.name}</span>
        {sizeText && <span className="tw-text-[10px] tw-text-[var(--color-text-4)]">{sizeText}</span>}
      </div>
    </div>
  );
}

// 音频附件组件：audio 播放器
export function AttachmentAudio({ block }: { block: AudioBlock }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    repo.getAttachment(block.attachmentId).then((blob) => {
      if (blob && !revoked) {
        setBlobUrl(URL.createObjectURL(blob));
      }
    });
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.attachmentId]);

  if (!blobUrl) {
    return (
      <div className="tw-h-10 tw-bg-[var(--color-fill-2)] tw-rounded tw-flex tw-items-center tw-justify-center tw-text-xs tw-text-[var(--color-text-4)] tw-px-4">
        {"Loading audio..."}
      </div>
    );
  }

  return (
    <div className="tw-my-1">
      {block.name && <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-1 tw-block">{block.name}</span>}
      <audio controls src={blobUrl} className="tw-max-w-xs" />
    </div>
  );
}
