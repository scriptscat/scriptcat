import React, { useEffect, useState } from "react";
import { Button, Card, Collapse, Link, Message, Space, Typography } from "@arco-design/web-react";
import { useTranslation } from "react-i18next";
import FileSystemParams from "../FileSystemParams";
import { systemConfig } from "@App/pages/store/global";
import FileSystemFactory, { FileSystemType } from "@Packages/filesystem/factory";
import { set } from "node_modules/yaml/dist/schema/yaml-1.1/set";

const CollapseItem = Collapse.Item;

const GMApiSetting: React.FC = () => {
  const [status, setStatus] = useState("unset");
  const [fileSystemType, setFilesystemType] = useState<FileSystemType>("webdav");
  const [fileSystemParams, setFilesystemParam] = useState<{
    [key: string]: any;
  }>({});
  const { t } = useTranslation();

  useEffect(() => {
    systemConfig.getCatFileStorage().then((res) => {
      setStatus(res.status);
      setFilesystemType(res.filesystem);
      setFilesystemParam(res.params[res.filesystem] || {});
    });
  }, []);

  return (
    <Card title={t("gm_api")} bordered={false}>
      <Collapse bordered={false} defaultActiveKey={["storage"]}>
        <CollapseItem header={t("storage_api")} name="storage">
          <Space direction="vertical">
            <FileSystemParams
              preNode={
                <Typography.Text>
                  {t("settings")}
                  <Link
                    target="_black"
                    href="https://github.com/scriptscat/scriptcat/blob/main/example/cat_file_storage.js"
                  >
                    CAT_fileStorage
                  </Link>
                  {t("use_file_system")}
                </Typography.Text>
              }
              actionButton={[
                <Button
                  key="save"
                  type="primary"
                  onClick={async () => {
                    try {
                      await FileSystemFactory.create(fileSystemType, fileSystemParams);
                    } catch (e) {
                      Message.error(`${t("account_validation_failed")}: ${e}`);
                      return;
                    }
                    const params = { ...fileSystemParams };
                    params[fileSystemType] = fileSystemParams;
                    systemConfig.setCatFileStorage({
                      status: "success",
                      filesystem: fileSystemType,
                      params,
                    });
                    setStatus("success");
                    Message.success(t("save_success")!);
                  }}
                >
                  {t("save")}
                </Button>,
                <Button
                  key="reset"
                  onClick={() => {
                    systemConfig.setCatFileStorage({
                      status: "unset",
                      filesystem: "webdav",
                      params: {},
                    });
                    setStatus("unset");
                    setFilesystemParam({});
                    setFilesystemType("webdav");
                  }}
                  type="primary"
                  status="danger"
                >
                  {t("reset")}
                </Button>,
                <Button
                  key="open"
                  type="secondary"
                  onClick={async () => {
                    try {
                      let fs = await FileSystemFactory.create(fileSystemType, fileSystemParams);
                      fs = await fs.openDir("ScriptCat/app");
                      window.open(await fs.getDirUrl(), "_black");
                    } catch (e) {
                      Message.error(`${t("account_validation_failed")}: ${e}`);
                    }
                  }}
                >
                  {t("open_directory")}
                </Button>,
              ]}
              fileSystemType={fileSystemType}
              fileSystemParams={fileSystemParams}
              onChangeFileSystemType={(type) => {
                setFilesystemType(type);
              }}
              onChangeFileSystemParams={(params) => {
                setFilesystemParam(params);
              }}
            />
            {status === "unset" && <Typography.Text type="secondary">{t("not_set")}</Typography.Text>}
            {status === "success" && <Typography.Text type="success">{t("in_use")}</Typography.Text>}
            {status === "error" && <Typography.Text type="error">{t("storage_error")}</Typography.Text>}
          </Space>
        </CollapseItem>
      </Collapse>
    </Card>
  );
};

export default GMApiSetting;
