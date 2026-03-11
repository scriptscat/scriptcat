import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Breadcrumb, Button, Card, Empty, Message, Modal, Space, Table } from "@arco-design/web-react";
import { IconDelete, IconEye, IconFolder, IconFile } from "@arco-design/web-react/icon";

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
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");

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
        // 目录排前面，然后按名称排序
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

  // 预览文件
  const previewFile = async (name: string) => {
    try {
      const dir = await getDirHandle(path);
      const fileHandle = await dir.getFileHandle(name);
      const file = await fileHandle.getFile();
      const text = await file.text();
      // 尝试 JSON 格式化
      try {
        const json = JSON.parse(text);
        setPreviewContent(JSON.stringify(json, null, 2));
      } catch {
        setPreviewContent(text);
      }
      setPreviewName(name);
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
          style={{ cursor: record.kind === "directory" ? "pointer" : "default" }}
          onClick={() => record.kind === "directory" && enterDirectory(name)}
        >
          {record.kind === "directory" ? <IconFolder className="tw-mr-1" /> : <IconFile className="tw-mr-1" />}
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
      render: (size?: number) => (size !== undefined ? formatSize(size) : "-"),
    },
    {
      title: t("agent_opfs_modified"),
      dataIndex: "lastModified",
      width: 180,
      render: (ts?: number) => (ts ? new Date(ts).toLocaleString() : "-"),
    },
    {
      title: "",
      dataIndex: "actions",
      width: 100,
      render: (_: unknown, record: FileEntry) => (
        <Space>
          {record.kind === "file" && (
            <Button type="text" icon={<IconEye />} size="small" onClick={() => previewFile(record.name)} />
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
      <Card bordered={false} title={t("agent_opfs_title")}>
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
    </Space>
  );
}

export default AgentOPFS;
