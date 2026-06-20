import type React from "react";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { Input } from "@App/pages/components/ui/input";
import { Button } from "@App/pages/components/ui/button";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import FileSystemFactory, { type FileSystemType } from "@Packages/filesystem/factory";
import { ClearNetDiskToken, HasNetDiskToken, netDiskTypeMap } from "@Packages/filesystem/auth";
import { t } from "@App/locales/locales";
import { toast } from "sonner";

interface FileSystemParamsProps {
  /** 选择器左侧的标题/开关等内容 */
  headerContent: React.ReactNode;
  /** 选择器右侧的额外操作（保存/重置等按钮） */
  children?: React.ReactNode;
  fileSystemType: FileSystemType;
  fileSystemParams: Record<string, any>;
  onChangeFileSystemType: (type: FileSystemType) => void;
  onChangeFileSystemParams: (params: Record<string, any>) => void;
}

/**
 * 文件系统连接参数表单：选择后端（WebDAV/网盘/OneDrive/S3 等），并按后端 schema 动态渲染参数字段。
 * 网盘类后端走 OAuth，已绑定时提供解绑入口。
 */
export default function FileSystemParams({
  headerContent,
  children,
  fileSystemType,
  fileSystemParams,
  onChangeFileSystemType,
  onChangeFileSystemParams,
}: FileSystemParamsProps) {
  const fsParams = FileSystemFactory.params();
  const [hasBoundToken, setHasBoundToken] = useState(false);

  const netDiskType = netDiskTypeMap[fileSystemType];

  useEffect(() => {
    if (!netDiskType) {
      setHasBoundToken(false);
      return;
    }
    HasNetDiskToken(netDiskType).then(setHasBoundToken);
  }, [netDiskType]);

  const fileSystemList: { key: FileSystemType; name: string }[] = [
    { key: "webdav", name: "WebDAV" },
    { key: "baidu-netdsik", name: t("settings:baidu_netdisk") },
    { key: "onedrive", name: "OneDrive" },
    { key: "googledrive", name: "Google Drive" },
    { key: "dropbox", name: "Dropbox" },
    { key: "s3", name: "Amazon S3" },
  ];

  const netDiskName = netDiskType ? fileSystemList.find((item) => item.key === fileSystemType)?.name : null;
  const fsParam = fsParams[fileSystemType];

  const unbind = async () => {
    if (!netDiskType) return;
    try {
      await ClearNetDiskToken(netDiskType);
      setHasBoundToken(false);
      toast.success(t("settings:netdisk_unbind_success", { provider: netDiskName }));
    } catch (error) {
      toast.error(`${t("settings:netdisk_unbind_error", { provider: netDiskName })}: ${String(error)}`);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {headerContent}
        <Select value={fileSystemType} onValueChange={(value) => onChangeFileSystemType(value as FileSystemType)}>
          <SelectTrigger className="w-[150px]" data-testid="filesystem_type" aria-label={t("type")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fileSystemList.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {children}
        {netDiskType && hasBoundToken && (
          <Popconfirm
            description={t("settings:netdisk_unbind_confirm", { provider: netDiskName })}
            confirmText={t("confirm")}
            cancelText={t("editor:cancel")}
            destructive
            onConfirm={unbind}
          >
            <Button variant="destructive" size="sm" data-testid="netdisk_unbind">
              {t("settings:netdisk_unbind", { provider: netDiskName })}
            </Button>
          </Popconfirm>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {Object.keys(fsParam).map((key) => {
          const props = fsParam[key];
          const selectAuth = fsParam?.authType?.options?.[0]; // webDAV：默认认证类型
          if (selectAuth && props?.visibilityFor?.includes(fileSystemParams?.authType || selectAuth) === false) {
            return null;
          }
          const setParam = (value: string) => onChangeFileSystemParams({ ...fileSystemParams, [key]: value });
          return (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{props.title}</span>
              {props.type === "select" ? (
                <Select value={fileSystemParams[key] || props.options![0]} onValueChange={(value) => setParam(value)}>
                  <SelectTrigger style={{ minWidth: props.minWidth }} aria-label={props.title}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {props.options!.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={props.type === "password" ? "password" : "text"}
                  aria-label={props.title}
                  value={fileSystemParams[key] ?? ""}
                  onChange={(e) => setParam(e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
