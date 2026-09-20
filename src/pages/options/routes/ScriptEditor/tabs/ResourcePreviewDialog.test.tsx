import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithTooltip as render } from "@Tests/renderWithTooltip";
import { formatBytes } from "@App/pkg/utils/utils";
import type { ResourceListItem } from "@App/app/repo/resource";

const { getResourceChunk } = vi.hoisted(() => ({ getResourceChunk: vi.fn() }));
vi.mock("@App/pages/store/features/script", () => ({ resourceClient: { getResourceChunk } }));

import ResourcePreviewDialog, { RESOURCE_PREVIEW_LIMIT_BYTES } from "./ResourcePreviewDialog";

const textResource: ResourceListItem = {
  key: "https://cdn.test/script.js",
  url: "https://cdn.test/script.js",
  type: "require",
  contentType: "application/javascript",
  byteSize: 8,
};

const chunkFor = (url: string, text: string) => ({
  url,
  offset: 0,
  length: new TextEncoder().encode(text).byteLength,
  total: new TextEncoder().encode(text).byteLength,
  base64: btoa(text),
});

const chunkForBytes = (url: string, bytes: Uint8Array) => ({
  url,
  offset: 0,
  length: bytes.byteLength,
  total: bytes.byteLength,
  base64: btoa(String.fromCharCode(...bytes)),
});

function renderPreview(resource: ResourceListItem = textResource, props: { uuid?: string } = {}) {
  const onOpenChange = vi.fn();
  const onDownload = vi.fn();
  const view = render(
    <ResourcePreviewDialog
      uuid={props.uuid ?? "u1"}
      resource={resource}
      onOpenChange={onOpenChange}
      onDownload={onDownload}
    />
  );
  return { ...view, onOpenChange, onDownload };
}

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  vi.clearAllMocks();
  getResourceChunk.mockImplementation(({ url }: { url: string }) => Promise.resolve(chunkFor(url, "var a=1;")));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ResourcePreviewDialog 缓存资源预览", () => {
  it("以原始文本显示缓存内容，并保留下载操作", async () => {
    const { onDownload } = renderPreview();

    expect(await screen.findByTestId("resource-preview-content")).toHaveTextContent("var a=1;");
    fireEvent.click(screen.getByRole("button", { name: t("download") }));

    expect(onDownload).toHaveBeenCalledWith(textResource);
  });

  it.each([
    { encoding: "UTF-16LE BOM", littleEndian: true, bom: [0xff, 0xfe] },
    { encoding: "UTF-16BE BOM", littleEndian: false, bom: [0xfe, 0xff] },
    { encoding: "UTF-16LE null pattern", littleEndian: true, bom: [] },
    { encoding: "UTF-16BE null pattern", littleEndian: false, bom: [] },
  ])("按 $encoding 解码缓存文本", async ({ littleEndian, bom }) => {
    const text = "const preview = true;";
    const bytes = new Uint8Array(bom.length + text.length * 2);
    bytes.set(bom);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      const offset = bom.length + index * 2;
      bytes[offset + (littleEndian ? 0 : 1)] = code & 0xff;
      bytes[offset + (littleEndian ? 1 : 0)] = code >> 8;
    }
    const resource = { ...textResource, byteSize: bytes.byteLength };
    getResourceChunk.mockResolvedValue(chunkForBytes(resource.url, bytes));
    renderPreview(resource);

    expect(await screen.findByTestId("resource-preview-content")).toHaveTextContent(text);
  });

  it("把 HTML 内容作为文本显示，不创建活动文档", async () => {
    const htmlResource = {
      ...textResource,
      key: "Resource_markup",
      url: "https://cdn.test/markup.html",
      type: "resource" as const,
      contentType: "text/html",
      byteSize: 22,
    };
    getResourceChunk.mockResolvedValue(chunkFor(htmlResource.url, "<script>run()</script>"));
    renderPreview(htmlResource);

    const content = await screen.findByTestId("resource-preview-content");
    expect(content).toHaveTextContent("<script>run()</script>");
    expect(content.querySelector("script")).toBeNull();
  });

  it("把 SVG 内容作为文本显示，不创建活动图像", async () => {
    const svgResource = {
      ...textResource,
      key: "Resource_vector",
      url: "https://cdn.test/vector.svg",
      type: "resource" as const,
      contentType: "image/svg+xml",
      byteSize: 36,
    };
    const svg = '<svg onload="run()"><text>cached</text></svg>';
    svgResource.byteSize = new TextEncoder().encode(svg).byteLength;
    getResourceChunk.mockResolvedValue(chunkFor(svgResource.url, svg));
    renderPreview(svgResource);

    const content = await screen.findByTestId("resource-preview-content");
    expect(content).toHaveTextContent(svg);
    expect(content.querySelector("svg")).toBeNull();
  });

  it("MIME 类型为 octet-stream 时可按 JS 扩展名预览文本", async () => {
    const resource = { ...textResource, contentType: "application/octet-stream" };
    renderPreview(resource);

    expect(await screen.findByTestId("resource-preview-content")).toHaveTextContent("var a=1;");
  });

  it("unsupported binary 会说明无法预览并保留下载", async () => {
    const resource = {
      ...textResource,
      key: "Resource_module",
      url: "https://cdn.test/module.wasm",
      type: "resource" as const,
      contentType: "application/wasm",
      byteSize: 4,
    };
    const { onDownload } = renderPreview(resource);

    expect(await screen.findByText(t("editor:resource_preview_unavailable"))).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("application/wasm");
    expect(getResourceChunk).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("download") }));
    expect(onDownload).toHaveBeenCalledWith(resource);
  });

  it("大资源会展示大小限制且不加载超预算内容", async () => {
    const resource = {
      ...textResource,
      byteSize: RESOURCE_PREVIEW_LIMIT_BYTES + 1,
    };
    renderPreview(resource);

    expect(
      await screen.findByText(
        t("editor:resource_preview_too_large", {
          limit: formatBytes(RESOURCE_PREVIEW_LIMIT_BYTES),
          size: formatBytes(resource.byteSize),
        })
      )
    ).toBeInTheDocument();
    expect(getResourceChunk).not.toHaveBeenCalled();
  });

  it("空文本资源显示明确的空内容状态", async () => {
    const resource = { ...textResource, byteSize: 0 };
    renderPreview(resource);

    expect(await screen.findByText(t("editor:resource_preview_empty"))).toBeInTheDocument();
    expect(getResourceChunk).not.toHaveBeenCalled();
  });

  it("缓存读取失败会在预览区域显示失败状态和错误详情", async () => {
    getResourceChunk.mockRejectedValue(new Error("cached bytes unavailable"));
    renderPreview();

    expect(await screen.findByText(t("editor:resource_preview_failed"))).toBeInTheDocument();
    expect(screen.getByText("cached bytes unavailable")).toBeInTheDocument();
  });

  it("资源切换后迟到的旧结果不会覆盖当前预览", async () => {
    let resolveFirst!: (value: ReturnType<typeof chunkFor>) => void;
    let resolveSecond!: (value: ReturnType<typeof chunkFor>) => void;
    const firstUrl = textResource.url;
    const secondText = "new cached content";
    const secondResource = {
      ...textResource,
      key: "https://cdn.test/second.js",
      url: "https://cdn.test/second.js",
      byteSize: new TextEncoder().encode(secondText).byteLength,
    };
    getResourceChunk.mockImplementation(
      ({ url }: { url: string }) =>
        new Promise((resolve) => {
          if (url === firstUrl) resolveFirst = resolve;
          else resolveSecond = resolve;
        })
    );
    const view = renderPreview(textResource);
    await waitFor(() => expect(getResourceChunk).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status", { name: t("loading") })).toBeInTheDocument();
    view.rerender(
      <ResourcePreviewDialog uuid="u1" resource={secondResource} onOpenChange={vi.fn()} onDownload={vi.fn()} />
    );
    await waitFor(() => expect(getResourceChunk).toHaveBeenCalledTimes(2));

    await act(async () => resolveSecond(chunkFor(secondResource.url, secondText)));
    expect(await screen.findByText(secondText)).toBeInTheDocument();
    await act(async () => resolveFirst(chunkFor(firstUrl, "old cached content")));

    expect(screen.getByText(secondText)).toBeInTheDocument();
    expect(screen.queryByText("old cached content")).toBeNull();
  });

  it("关闭预览后迟到的结果不会覆盖重新打开的预览", async () => {
    let resolveFirst!: (value: ReturnType<typeof chunkFor>) => void;
    let resolveSecond!: (value: ReturnType<typeof chunkFor>) => void;
    const secondText = "new cached content";
    const secondResource = {
      ...textResource,
      key: "https://cdn.test/second.js",
      url: "https://cdn.test/second.js",
      byteSize: new TextEncoder().encode(secondText).byteLength,
    };
    getResourceChunk.mockImplementation(
      ({ url }: { url: string }) =>
        new Promise((resolve) => {
          if (url === textResource.url) resolveFirst = resolve;
          else resolveSecond = resolve;
        })
    );
    const view = renderPreview(textResource);
    await waitFor(() => expect(getResourceChunk).toHaveBeenCalledTimes(1));

    view.unmount();
    expect(screen.queryByRole("dialog")).toBeNull();
    const reopened = renderPreview(secondResource);
    await waitFor(() => expect(getResourceChunk).toHaveBeenCalledTimes(2));

    await act(async () => resolveFirst(chunkFor(textResource.url, "old cached content")));
    expect(screen.queryByText("old cached content")).toBeNull();
    await act(async () => resolveSecond(chunkFor(secondResource.url, secondText)));

    expect(await screen.findByText(secondText)).toBeInTheDocument();
    reopened.unmount();
  });

  it("图片对象 URL 在预览卸载时撤销", async () => {
    const resource = {
      ...textResource,
      key: "Resource_image",
      url: "https://cdn.test/image.png",
      type: "resource" as const,
      contentType: "application/octet-stream",
      byteSize: 4,
    };
    getResourceChunk.mockResolvedValue({
      url: resource.url,
      offset: 0,
      length: resource.byteSize,
      total: resource.byteSize,
      base64: btoa("abcd"),
    });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cached-resource");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const view = renderPreview(resource);

    expect(await screen.findByRole("img", { name: "Resource_image" })).toHaveAttribute("src", "blob:cached-resource");
    view.unmount();

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cached-resource");
  });
});
