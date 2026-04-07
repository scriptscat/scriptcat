import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Breadcrumb, Button, Card, Empty, Message, Modal, Space, Table } from "@arco-design/web-react";
import { IconDelete, IconDownload, IconEye, IconFolder, IconFile, IconImage } from "@arco-design/web-react/icon";
import AgentDocLink from "./AgentDocLink";
import { isImageFileName } from "@App/app/service/agent/core/content_utils";

interface FileEntry {
  name: string;
  kind: "file" | "directory";
  size?: number;
  lastModified?: number;
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AgentOPFS() {
  const { t } = useTranslation();
  const [path, setPath] = useState<string[]>(["agents"]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // 文本预览
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  // 图片预览
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageName, setPreviewImageName] = useState("");

  // 获取指定路径的目录句柄
  const getDirHandle = useCallback(async (pathParts: string[]) => {
    let dir = await navigator.storage.getDirectory();
    for (const part of pathParts) {
      dir = await dir.getDirectoryHandle(part);
    }
    return dir;
  }, []);

  // 加载目录内容
  const loadDirectory = useCallback(
    async (pathParts: string[]) => {
      setLoading(true);
      try {
        const dir = await getDirHandle(pathParts);
        const items: FileEntry[] = [];
        for await (const [name, handle] of dir as any) {
          const entry: FileEntry = { name, kind: handle.kind };
          if (handle.kind === "file") {
            try {
              const file = await (handle as FileSystemFileHandle).getFile();
              entry.size = file.size;
              entry.lastModified = file.lastModified;
            } catch {
              // 忽略无法读取的文件
            }
          }
          items.push(entry);
        }
        // 目录排前面，同类型按名称排序
        items.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(items);
      } catch (e) {
        console.error("Failed to load OPFS directory:", e);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [getDirHandle]
  );

  useEffect(() => {
    loadDirectory(path);
  }, [path, loadDirectory]);

  // 清理图片预览的 objectURL
  useEffect(() => {
    return () => {
      if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
    };
  }, [previewImageUrl]);

  // 进入子目录
  const enterDirectory = (name: string) => {
    setPath((prev) => [...prev, name]);
  };

  // 面包屑导航跳转，-1 表示跳转到 OPFS 根目录
  const navigateTo = (index: number) => {
    if (index < 0) {
      setPath([]);
    } else {
      setPath((prev) => prev.slice(0, index));
    }
  };

  // 读取文件 Blob
  const getFileBlob = async (name: string): Promise<File> => {
    const dir = await getDirHandle(path);
    const fileHandle = await dir.getFileHandle(name);
    return await fileHandle.getFile();
  };

  // 预览文件（图片 vs 文本）
  const previewFile = async (name: string) => {
    try {
      if (isImageFileName(name)) {
        const file = await getFileBlob(name);
        // 清理之前的 URL
        if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
        setPreviewImageUrl(URL.createObjectURL(file));
        setPreviewImageName(name);
      } else {
        const file = await getFileBlob(name);
        const text = await file.text();
        // 尝试 JSON 格式化
        try {
          const json = JSON.parse(text);
          setPreviewContent(JSON.stringify(json, null, 2));
        } catch {
          setPreviewContent(text);
        }
        setPreviewName(name);
      }
    } catch (e) {
      Message.error(String(e));
    }
  };

  // 下载文件
  const downloadFile = async (name: string) => {
    try {
      const file = await getFileBlob(name);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      Message.error(String(e));
    }
  };

  // 删除文件或目录
  const deleteEntry = (name: string, kind: "file" | "directory") => {
    Modal.confirm({
      title: t("agent_opfs_delete_confirm"),
      onOk: async () => {
        try {
          const dir = await getDirHandle(path);
          await dir.removeEntry(name, { recursive: kind === "directory" });
          Message.success(t("agent_opfs_delete_success"));
          loadDirectory(path);
        } catch (e) {
          Message.error(String(e));
        }
      },
    });
  };

  const columns = [
    {
      title: t("agent_opfs_name"),
      dataIndex: "name",
      render: (name: string, record: FileEntry) => (
        <span
          style={{ cursor: "pointer" }}
          onClick={() => (record.kind === "directory" ? enterDirectory(name) : previewFile(name))}
        >
          {record.kind === "directory" ? (
            <IconFolder className="tw-mr-1" />
          ) : isImageFileName(name) ? (
            <IconImage className="tw-mr-1" />
          ) : (
            <IconFile className="tw-mr-1" />
          )}
          {name}
        </span>
      ),
    },
    {
      title: t("agent_opfs_type"),
      dataIndex: "kind",
      width: 100,
      render: (kind: string) => (kind === "directory" ? t("agent_opfs_directory") : t("agent_opfs_file")),
    },
    {
      title: t("agent_opfs_size"),
      dataIndex: "size",
      width: 120,
      sorter: (a: FileEntry, b: FileEntry) => {
        // 目录始终排在最前面
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
        return (a.size ?? 0) - (b.size ?? 0);
      },
      render: (size?: number) => (size !== undefined ? formatSize(size) : "-"),
    },
    {
      title: t("agent_opfs_modified"),
      dataIndex: "lastModified",
      width: 180,
      defaultSortOrder: "descend" as const,
      sorter: (a: FileEntry, b: FileEntry) => {
        // 目录始终排在最前面
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
        return (a.lastModified ?? 0) - (b.lastModified ?? 0);
      },
      render: (ts?: number) => (ts ? new Date(ts).toLocaleString() : "-"),
    },
    {
      title: "",
      dataIndex: "actions",
      width: 120,
      render: (_: unknown, record: FileEntry) => (
        <Space>
          {record.kind === "file" && (
            <>
              {isImageFileName(record.name) && (
                <Button type="text" icon={<IconEye />} size="small" onClick={() => previewFile(record.name)} />
              )}
              <Button type="text" icon={<IconDownload />} size="small" onClick={() => downloadFile(record.name)} />
            </>
          )}
          <Button
            type="text"
            status="danger"
            icon={<IconDelete />}
            size="small"
            onClick={() => deleteEntry(record.name, record.kind)}
          />
        </Space>
      ),
    },
  ];

  return (
    <Space className="tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      <Card bordered={false} title={t("agent_opfs_title")} extra={<AgentDocLink page="opfs" />}>
        <Breadcrumb style={{ marginBottom: 16 }}>
          <Breadcrumb.Item onClick={() => navigateTo(-1)} style={{ cursor: "pointer" }}>
            {t("agent_opfs_root")}
          </Breadcrumb.Item>
          {path.map((part, index) => (
            <Breadcrumb.Item key={index} onClick={() => navigateTo(index + 1)} style={{ cursor: "pointer" }}>
              {part}
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>
        <Table
          columns={columns}
          data={entries}
          rowKey="name"
          loading={loading}
          pagination={false}
          noDataElement={<Empty description={t("agent_opfs_empty")} />}
        />
      </Card>
      {/* 文本预览 Modal */}
      <Modal
        title={`${t("agent_opfs_preview")} - ${previewName}`}
        visible={previewContent !== null}
        onCancel={() => setPreviewContent(null)}
        footer={null}
        style={{ width: 700 }}
      >
        <pre style={{ maxHeight: 500, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {previewContent}
        </pre>
      </Modal>
      {/* 图片预览 Modal */}
      <Modal
        title={`${t("agent_opfs_preview")} - ${previewImageName}`}
        visible={previewImageUrl !== null}
        onCancel={() => {
          if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
          setPreviewImageUrl(null);
        }}
        footer={null}
        style={{ width: "auto", maxWidth: "90vw" }}
      >
        {previewImageUrl && (
          <div className="tw-flex tw-justify-center">
            <img
              src={previewImageUrl}
              alt={previewImageName}
              style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
            />
          </div>
        )}
      </Modal>
    </Space>
  );
}

export default AgentOPFS;
