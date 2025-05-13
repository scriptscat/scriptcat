import React from "react";
import { Input, Select, Space } from "@arco-design/web-react";
import FileSystemFactory, { FileSystemType } from "@Packages/filesystem/factory";

const fsParams = FileSystemFactory.params();

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
    name: "百度网盘",
  },
  {
    key: "onedrive",
    name: "OneDrive",
  },
];
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
        {actionButton.map((item) => item)}
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
