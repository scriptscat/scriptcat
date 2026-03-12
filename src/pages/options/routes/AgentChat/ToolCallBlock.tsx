import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IconDown, IconRight, IconCheck, IconClose, IconDownload, IconEye } from "@arco-design/web-react/icon";
import type { ToolCall, Attachment } from "@App/app/service/agent/types";
import { AgentChatRepo } from "@App/app/repo/agent_chat";

const repo = new AgentChatRepo();

// 状态图标
function StatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "running":
      return <span className="agent-tool-spinner" />;
    case "completed":
      return (
        <span className="tw-w-4 tw-h-4 tw-rounded-full tw-bg-[rgb(var(--green-1))] tw-flex tw-items-center tw-justify-center">
          <IconCheck style={{ fontSize: 10, color: "rgb(var(--green-6))" }} />
        </span>
      );
    case "error":
      return (
        <span className="tw-w-4 tw-h-4 tw-rounded-full tw-bg-[rgb(var(--red-1))] tw-flex tw-items-center tw-justify-center">
          <IconClose style={{ fontSize: 10, color: "rgb(var(--red-6))" }} />
        </span>
      );
    default:
      return <span className="tw-w-3 tw-h-3 tw-rounded-full tw-bg-[var(--color-fill-3)]" />;
  }
}

// 图片附件组件：从 OPFS 懒加载并展示
function AttachmentImage({ attachment }: { attachment: Attachment }) {
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
        Loading...
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
          <IconEye className="tw-text-white tw-opacity-0 group-hover:tw-opacity-100 tw-transition-opacity" style={{ fontSize: 20 }} />
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
function AttachmentFile({ attachment }: { attachment: Attachment }) {
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
        {sizeText && (
          <span className="tw-text-[10px] tw-text-[var(--color-text-4)]">{sizeText}</span>
        )}
      </div>
    </div>
  );
}

export default function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [toolCall, expanded]);

  const hasAttachments = toolCall.attachments && toolCall.attachments.length > 0;

  return (
    <div className="tw-my-2">
      {/* 触发器 */}
      <div
        className="tw-inline-flex tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-rounded-full tw-cursor-pointer tw-select-none tw-bg-[var(--color-fill-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors tw-border tw-border-solid tw-border-[var(--color-border-1)]"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={toolCall.status} />
        <span className="tw-text-xs tw-font-medium tw-text-[var(--color-text-2)]">{toolCall.name}</span>
        {expanded ? (
          <IconDown style={{ fontSize: 10 }} className="tw-text-[var(--color-text-4)]" />
        ) : (
          <IconRight style={{ fontSize: 10 }} className="tw-text-[var(--color-text-4)]" />
        )}
      </div>

      {/* 附件展示（始终可见，不需要展开） */}
      {hasAttachments && (
        <div className="tw-mt-2 tw-ml-2 tw-flex tw-flex-wrap tw-gap-2">
          {toolCall.attachments!.map((att) =>
            att.type === "image" ? (
              <AttachmentImage key={att.id} attachment={att} />
            ) : (
              <AttachmentFile key={att.id} attachment={att} />
            )
          )}
        </div>
      )}

      {/* 展开内容（参数和文本结果） */}
      <div
        className="agent-collapsible-content"
        style={{ maxHeight: expanded ? contentHeight + 32 : 0, opacity: expanded ? 1 : 0 }}
      >
        <div ref={contentRef} className="tw-mt-2 tw-ml-2">
          {/* 参数 */}
          <div className="tw-rounded-lg tw-overflow-hidden tw-border tw-border-solid tw-border-[var(--color-border-1)]">
            <div className="tw-px-3 tw-py-1.5 tw-bg-[var(--color-fill-2)] tw-text-xs tw-font-medium tw-text-[var(--color-text-3)]">
              {t("agent_chat_tool_arguments") || "Arguments"}
            </div>
            <pre className="tw-m-0 tw-px-3 tw-py-2 tw-whitespace-pre-wrap tw-break-all tw-text-xs tw-font-mono tw-text-[var(--color-text-2)] tw-bg-[var(--color-fill-1)] tw-max-h-[300px] tw-overflow-y-auto">
              {toolCall.arguments}
            </pre>
          </div>

          {/* 文本结果 */}
          {toolCall.result && (
            <div className="tw-rounded-lg tw-overflow-hidden tw-border tw-border-solid tw-border-[var(--color-border-1)] tw-mt-2">
              <div className="tw-px-3 tw-py-1.5 tw-bg-[var(--color-fill-2)] tw-text-xs tw-font-medium tw-text-[var(--color-text-3)]">
                {t("agent_chat_tool_result") || "Result"}
              </div>
              <pre className="tw-m-0 tw-px-3 tw-py-2 tw-whitespace-pre-wrap tw-break-all tw-text-xs tw-font-mono tw-text-[var(--color-text-2)] tw-bg-[var(--color-fill-1)] tw-max-h-[300px] tw-overflow-y-auto">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
