import type { MessageContent, AudioBlock } from "@App/app/service/agent/core/types";
import MarkdownRenderer from "./MarkdownRenderer";
import { AttachmentImage, AttachmentFile, AttachmentAudio } from "./AttachmentRenderers";

export default function ContentBlockRenderer({ content, className }: { content: MessageContent; className?: string }) {
  if (typeof content === "string") {
    return content ? <MarkdownRenderer content={content} /> : null;
  }

  return (
    <div className={className}>
      {content.map((block, i) => {
        switch (block.type) {
          case "text":
            return block.text ? <MarkdownRenderer key={i} content={block.text} /> : null;
          case "image":
            return (
              <AttachmentImage
                key={i}
                attachment={{
                  id: block.attachmentId,
                  type: "image",
                  name: block.name || "image",
                  mimeType: block.mimeType,
                }}
              />
            );
          case "file":
            return (
              <AttachmentFile
                key={i}
                attachment={{
                  id: block.attachmentId,
                  type: "file",
                  name: block.name,
                  mimeType: block.mimeType,
                  size: block.size,
                }}
              />
            );
          case "audio":
            return <AttachmentAudio key={i} block={block as AudioBlock} />;
        }
      })}
    </div>
  );
}
