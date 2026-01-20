import React from "react";
import { Button, Input, Message, Popconfirm, Select, Space } from "@arco-design/web-react";
import type { FileSystemType } from "@Packages/filesystem/factory";
import FileSystemFactory from "@Packages/filesystem/factory";
import { useTranslation } from "react-i18next";
import { ClearNetDiskToken, type NetDiskType } from "@Packages/filesystem/auth";

const FileSystemParams: React.FC<{
  preNode: React.ReactNode | string;
  onChangeFileSystemType: (type: FileSystemType) => void;
  onChangeFileSystemParams: (params: any) => void;
  actionButton: React.ReactNode[];
  fileSystemType: FileSystemType;
  fileSystemParams: any;
}> = ({
  onChangeFileSystemType,
  onChangeFileSystemParams,
  preNode,
  actionButton,
  fileSystemType,
  fileSystemParams,
}) => {
  const fsParams = FileSystemFactory.params();
  const { t } = useTranslation();
  const actionButtons = [...actionButton];

  const fileSystemList: {
    key: FileSystemType;
    name: string;
  }[] = [
    {
      key: "webdav",
      name: "WebDAV",
    },
    {
      key: "baidu-netdsik",
      name: t("baidu_netdisk"),
    },
    {
      key: "onedrive",
      name: "OneDrive",
    },
    {
      key: "googledrive",
      name: "Google Drive",
    },
    {
      key: "dropbox",
      name: "Dropbox",
    },
  ];
  const netDiskTypeMap: Partial<Record<FileSystemType, NetDiskType>> = {
    "baidu-netdsik": "baidu",
    onedrive: "onedrive",
    googledrive: "googledrive",
    dropbox: "dropbox",
  };
  const netDiskType = netDiskTypeMap[fileSystemType];
  const netDiskName = fileSystemList.find((item) => item.key === fileSystemType)?.name;

  if (netDiskType) {
    actionButtons.push(
      <Popconfirm
        key="netdisk-unbind"
        title={t("netdisk_unbind_confirm", { provider: netDiskName })}
        onOk={async () => {
          try {
            await ClearNetDiskToken(netDiskType);
            Message.success(t("netdisk_unbind_success", { provider: netDiskName })!);
          } catch (error) {
            Message.error(`${t("netdisk_unbind_error", { provider: netDiskName })}: ${String(error)}`);
          }
        }}
      >
        <Button type="primary" status="danger">
          {t("netdisk_unbind", { provider: netDiskName })}
        </Button>
      </Popconfirm>
    );
  }

  return (
    <>
      <Space>
        {preNode}
        <Select
          value={fileSystemType}
          style={{ width: 120 }}
          onChange={(value) => {
            onChangeFileSystemType(value as FileSystemType);
          }}
        >
          {fileSystemList.map((item) => (
            <Select.Option key={item.key} value={item.key}>
              {item.name}
            </Select.Option>
          ))}
        </Select>
        {actionButtons.map((item) => item)}
      </Space>
      <Space
        style={{
          display: "flex",
          marginTop: 4,
        }}
      >
        {Object.keys(fsParams[fileSystemType]).map((key) => (
          <div key={key}>
            {fsParams[fileSystemType][key].type === "select" && (
              <>
                <span>{fsParams[fileSystemType][key].title}</span>
                <Select
                  value={fileSystemParams[key] || fsParams[fileSystemType][key].options![0]}
                  onChange={(value) => {
                    onChangeFileSystemParams({
                      ...fileSystemParams,
                      [key]: value,
                    });
                  }}
                >
                  {fsParams[fileSystemType][key].options!.map((option) => (
                    <Select.Option value={option} key={option}>
                      {option}
                    </Select.Option>
                  ))}
                </Select>
              </>
            )}
            {fsParams[fileSystemType][key].type === "password" && (
              <>
                <span>{fsParams[fileSystemType][key].title}</span>
                <Input.Password
                  value={fileSystemParams[key]}
                  onChange={(value) => {
                    onChangeFileSystemParams({
                      ...fileSystemParams,
                      [key]: value,
                    });
                  }}
                />
              </>
            )}
            {!fsParams[fileSystemType][key].type && (
              <>
                <span>{fsParams[fileSystemType][key].title}</span>
                <Input
                  value={fileSystemParams[key]}
                  onChange={(value) => {
                    onChangeFileSystemParams({
                      ...fileSystemParams,
                      [key]: value,
                    });
                  }}
                />
              </>
            )}
          </div>
        ))}
      </Space>
    </>
  );
};

export default FileSystemParams;
