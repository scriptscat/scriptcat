import React, { useEffect, useState } from "react";
import { Button, Card, Collapse, Link, Message, Space, Switch, Typography } from "@arco-design/web-react";
import { useTranslation } from "react-i18next";
import FileSystemParams from "../FileSystemParams";
import { systemConfig } from "@App/pages/store/global";
import type { FileSystemType } from "@Packages/filesystem/factory";
import FileSystemFactory from "@Packages/filesystem/factory";
import { isFirefox } from "@App/pkg/utils/utils";

const CollapseItem = Collapse.Item;

const RuntimeSetting: React.FC = () => {
  const [status, setStatus] = useState("unset");
  const [fileSystemType, setFilesystemType] = useState<FileSystemType>("webdav");
  const [fileSystemParams, setFilesystemParam] = useState<{
    [key: string]: any;
  }>({});
  // 开启后台运行
  const [enableBackground, setEnableBackgroundState] = useState<boolean>(false);
  const { t } = useTranslation();

  useEffect(() => {
    systemConfig.getCatFileStorage().then((res) => {
      setStatus(res.status);
      setFilesystemType(res.filesystem);
      setFilesystemParam(res.params[res.filesystem] || {});
    });
    if (isFirefox()) {
      // no background permission
    } else {
      chrome.permissions.contains({ permissions: ["background"] }, (result) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          return;
        }
        setEnableBackgroundState(result);
      });
    }
  }, []);

  const setEnableBackground = (enable: boolean) => {
    if (isFirefox()) {
      // no background permission
    } else {
      if (enable) {
        chrome.permissions.request({ permissions: ["background"] }, (granted) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            Message.error(t("enable_background.enable_failed")!);
            return;
          }
          setEnableBackgroundState(granted);
        });
      } else {
        chrome.permissions.remove({ permissions: ["background"] }, (removed) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            Message.error(t("enable_background.disable_failed")!);
            return;
          }
          setEnableBackgroundState(!removed);
        });
      }
    }
  };

  return (
    <Card title={t("runtime")} bordered={false}>
      <Space direction="vertical" size={20} className={"tw-w-full"}>
        <div className="tw-flex tw-items-center tw-justify-between tw-min-h-9">
          {!isFirefox() && (
            <div className="tw-flex tw-items-center tw-gap-2 tw-flex-1">
              <Switch onChange={setEnableBackground} checked={enableBackground} />
              <span
                className="tw-min-w-20 tw-font-medium tw-cursor-pointer"
                onClick={() => {
                  setEnableBackground(!enableBackground);
                }}
              >
                {t("enable_background.title")}
              </span>
            </div>
          )}
          <span className="tw-text-xs tw-ml-6 tw-flex-shrink-0">{t("enable_background.description")}</span>
        </div>
        <Collapse bordered={false} defaultActiveKey={["storage"]}>
          <CollapseItem header={t("storage_api")} name="storage">
            <Space direction="vertical">
              <FileSystemParams
                headerContent={
                  <Typography.Text>
                    {t("settings")}
                    <Link
                      target="_black"
                      href="https://github.com/scriptscat/scriptcat/blob/main/example/cat_file_storage.js"
                    >
                      {"CAT_fileStorage"}
                    </Link>
                    {t("use_file_system")}
                  </Typography.Text>
                }
                fileSystemType={fileSystemType}
                fileSystemParams={fileSystemParams}
                onChangeFileSystemType={(type) => {
                  setFilesystemType(type);
                }}
                onChangeFileSystemParams={(params) => {
                  setFilesystemParam(params);
                }}
              >
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
                </Button>
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
                </Button>
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
                </Button>
              </FileSystemParams>
              {status === "unset" && <Typography.Text type="secondary">{t("not_set")}</Typography.Text>}
              {status === "success" && <Typography.Text type="success">{t("in_use")}</Typography.Text>}
              {status === "error" && <Typography.Text type="error">{t("storage_error")}</Typography.Text>}
            </Space>
          </CollapseItem>
        </Collapse>
      </Space>
    </Card>
  );
};

export default RuntimeSetting;
