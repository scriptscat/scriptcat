import { useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ResourceChunk, ResourceListItem } from "@App/app/repo/resource";
import { resourceClient } from "@App/pages/store/features/script";
import { formatBytes } from "@App/pkg/utils/utils";
import { Badge } from "@App/pages/components/ui/badge";
import { Button } from "@App/pages/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@App/pages/components/ui/dialog";

export const RESOURCE_PREVIEW_LIMIT_BYTES = 1024 * 1024;

const RESOURCE_TYPE_LABELS: Record<ResourceListItem["type"], string> = {
  require: "@require",
  "require-css": "@require-css",
  resource: "@resource",
};

const TEXT_EXTENSIONS = new Set([
  "cjs",
  "css",
  "csv",
  "html",
  "htm",
  "js",
  "json",
  "jsx",
  "less",
  "log",
  "md",
  "mjs",
  "scss",
  "sh",
  "sql",
  "svg",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  apng: "image/apng",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const IMAGE_MIME_TYPES = new Set(Object.values(IMAGE_MIME_BY_EXTENSION));

type ResourceFormat = "text" | "image" | "unsupported";

type PreviewState =
  | { key: string; status: "idle" | "loading" | "empty" | "unavailable" | "too-large" }
  | { key: string; status: "loaded-text"; text: string }
  | { key: string; status: "loaded-image"; imageUrl: string }
  | { key: string; status: "error"; message: string };

const INITIAL_PREVIEW_STATE: PreviewState = { key: "", status: "idle" };

function resourcePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/, 1)[0];
  }
}

function resourceExtension(url: string): string {
  const basename = resourcePath(url).split("/").filter(Boolean).pop() ?? "";
  const extensionIndex = basename.lastIndexOf(".");
  return extensionIndex < 0 ? "" : basename.slice(extensionIndex + 1).toLowerCase();
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function getResourceDisplayName(resource: ResourceListItem): string {
  if (resource.type === "resource") return resource.key;

  const path = resourcePath(resource.url);
  const basename = path.split("/").filter(Boolean).pop();
  if (basename) return decodePathSegment(basename);

  try {
    return new URL(resource.url).host || resource.url;
  } catch {
    return resource.url;
  }
}

function getResourceFormat(resource: ResourceListItem): ResourceFormat {
  const mimeType = resource.contentType.split(";")[0].trim().toLowerCase();
  const extension = resourceExtension(resource.url);

  if (mimeType === "image/svg+xml" || extension === "svg") return "text";
  if (IMAGE_MIME_TYPES.has(mimeType)) return "image";
  if (IMAGE_MIME_BY_EXTENSION[extension] && (!mimeType || mimeType === "application/octet-stream")) return "image";

  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/ecmascript" ||
    mimeType === "application/javascript" ||
    mimeType === "application/json" ||
    mimeType === "application/x-javascript" ||
    mimeType === "application/xml" ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  ) {
    return "text";
  }
  if (TEXT_EXTENSIONS.has(extension) && (!mimeType || mimeType === "application/octet-stream")) return "text";
  return "unsupported";
}

function resourceImageMimeType(resource: ResourceListItem): string {
  const mimeType = resource.contentType.split(";")[0].trim().toLowerCase();
  return IMAGE_MIME_TYPES.has(mimeType) ? mimeType : IMAGE_MIME_BY_EXTENSION[resourceExtension(resource.url)];
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getTextEncoding(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";

  const sampleLength = Math.min(bytes.length, 128);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
  }
  if (oddNulls > sampleLength / 4 && oddNulls > evenNulls * 2) return "utf-16le";
  if (evenNulls > sampleLength / 4 && evenNulls > oddNulls * 2) return "utf-16be";
  return "utf-8";
}

function readChunkBytes(chunk: ResourceChunk, resource: ResourceListItem, expectedLength: number): Uint8Array {
  if (
    chunk.url !== resource.url ||
    chunk.offset !== 0 ||
    chunk.total !== resource.byteSize ||
    chunk.length !== expectedLength
  ) {
    throw new Error("resource preview chunk is inconsistent");
  }

  const bytes = decodeBase64(chunk.base64);
  if (bytes.byteLength !== chunk.length) {
    throw new Error("resource preview chunk length is inconsistent");
  }
  return bytes;
}

export interface ResourcePreviewDialogProps {
  uuid: string;
  resource: ResourceListItem;
  onOpenChange: (open: boolean) => void;
  onDownload: (resource: ResourceListItem) => void;
}

export default function ResourcePreviewDialog({
  uuid,
  resource,
  onOpenChange,
  onDownload,
}: ResourcePreviewDialogProps) {
  const { t } = useTranslation();
  const requestKey = JSON.stringify([uuid, resource.url, resource.byteSize, resource.contentType]);
  const [preview, setPreview] = useState<PreviewState>(INITIAL_PREVIEW_STATE);

  useEffect(() => {
    let active = true;
    let imageUrl: string | undefined;

    const loadPreview = async () => {
      try {
        if (!Number.isSafeInteger(resource.byteSize) || resource.byteSize < 0) {
          throw new Error("resource size is invalid");
        }

        const format = getResourceFormat(resource);
        if (format === "unsupported") {
          setPreview({ key: requestKey, status: "unavailable" });
          return;
        }
        if (resource.byteSize === 0) {
          setPreview({ key: requestKey, status: "empty" });
          return;
        }
        if (resource.byteSize > RESOURCE_PREVIEW_LIMIT_BYTES) {
          setPreview({ key: requestKey, status: "too-large" });
          return;
        }

        const chunk = await resourceClient.getResourceChunk({
          uuid,
          url: resource.url,
          offset: 0,
          length: resource.byteSize,
        });
        if (!active) return;

        const bytes = readChunkBytes(chunk, resource, resource.byteSize);
        if (format === "image") {
          imageUrl = URL.createObjectURL(
            new Blob([bytes.buffer as ArrayBuffer], { type: resourceImageMimeType(resource) })
          );
          if (!active) {
            URL.revokeObjectURL(imageUrl);
            imageUrl = undefined;
            return;
          }
          setPreview({ key: requestKey, status: "loaded-image", imageUrl });
          return;
        }

        setPreview({
          key: requestKey,
          status: "loaded-text",
          text: new TextDecoder(getTextEncoding(bytes)).decode(bytes),
        });
      } catch (error) {
        if (!active) return;
        setPreview({
          key: requestKey,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void loadPreview();
    return () => {
      active = false;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [requestKey, resource, uuid]);

  const displayName = getResourceDisplayName(resource);
  const activePreview = preview.key === requestKey ? preview : { key: requestKey, status: "loading" as const };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] flex-col gap-3 p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader className="gap-2 text-left">
          <DialogTitle className="truncate text-sm">
            <span>{`${t("editor:preview")} — `}</span>
            <span className="font-mono">{displayName}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">{resource.url}</DialogDescription>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {RESOURCE_TYPE_LABELS[resource.type]}
            </Badge>
            <span className="min-w-0 truncate font-mono text-muted-foreground" title={resource.contentType}>
              {resource.contentType || "-"}
            </span>
            <span className="font-mono text-muted-foreground">{formatBytes(resource.byteSize)}</span>
          </div>
        </DialogHeader>

        <div className="min-w-0 border-b border-border pb-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">{t("editor:source_url")}</div>
          <p className="select-text break-all rounded-md border border-border bg-card p-2 font-mono text-xs leading-relaxed text-foreground">
            {resource.url}
          </p>
        </div>

        <div className="min-h-[180px] min-w-0 flex-1 overflow-auto">
          {activePreview.status === "loading" && (
            <div
              role="status"
              aria-label={t("loading")}
              className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              <span>{t("loading")}</span>
            </div>
          )}
          {activePreview.status === "empty" && (
            <div
              role="status"
              aria-label={t("editor:resource_preview_empty")}
              className="flex min-h-[180px] items-center justify-center rounded-md bg-muted p-4 text-sm text-muted-foreground"
            >
              {t("editor:resource_preview_empty")}
            </div>
          )}
          {activePreview.status === "unavailable" && (
            <div
              role="status"
              aria-label={t("editor:resource_preview_unavailable")}
              className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-md bg-muted p-4 text-center"
            >
              <span className="text-sm text-foreground">{t("editor:resource_preview_unavailable")}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {resource.contentType || "-"}
                {" · "}
                {formatBytes(resource.byteSize)}
              </span>
            </div>
          )}
          {activePreview.status === "too-large" && (
            <div
              role="status"
              aria-label={t("editor:resource_preview_too_large", {
                size: formatBytes(resource.byteSize),
                limit: formatBytes(RESOURCE_PREVIEW_LIMIT_BYTES),
              })}
              className="flex min-h-[180px] items-center justify-center rounded-md bg-muted p-4 text-center text-sm text-foreground"
            >
              {t("editor:resource_preview_too_large", {
                size: formatBytes(resource.byteSize),
                limit: formatBytes(RESOURCE_PREVIEW_LIMIT_BYTES),
              })}
            </div>
          )}
          {activePreview.status === "error" && (
            <div
              role="status"
              aria-label={t("editor:resource_preview_failed")}
              className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-center"
            >
              <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
              <span className="text-sm text-foreground">{t("editor:resource_preview_failed")}</span>
              <pre className="max-h-24 max-w-full overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                {activePreview.message}
              </pre>
            </div>
          )}
          {activePreview.status === "loaded-text" && (
            <pre
              data-testid="resource-preview-content"
              className="min-h-[180px] max-h-[55vh] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs text-foreground"
            >
              {activePreview.text || t("editor:resource_preview_empty")}
            </pre>
          )}
          {activePreview.status === "loaded-image" && (
            <div className="flex max-h-[55vh] min-h-[180px] items-center justify-center overflow-auto rounded-md bg-muted p-2">
              <img
                src={activePreview.imageUrl}
                alt={displayName}
                className="max-h-[52vh] max-w-full rounded-md object-contain"
              />
            </div>
          )}
        </div>

        <DialogFooter className="mt-auto">
          <Button variant="outline" size="sm" className="h-11 sm:h-9" onClick={() => onDownload(resource)}>
            <Download aria-hidden="true" className="size-4" />
            {t("download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
