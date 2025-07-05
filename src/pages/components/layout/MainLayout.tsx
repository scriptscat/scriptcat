import {
  Button,
  ConfigProvider,
  Dropdown,
  Empty,
  Input,
  Layout,
  Menu,
  Message,
  Modal,
  Space,
  Typography,
} from "@arco-design/web-react";
import { RefTextAreaType } from "@arco-design/web-react/es/Input";
import {
  IconCheckCircle,
  IconCloseCircle,
  IconDesktop,
  IconDown,
  IconLanguage,
  IconLink,
  IconMoonFill,
  IconSunFill,
} from "@arco-design/web-react/icon";
import React, { ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "@App/pages/store/hooks";
import { selectThemeMode, setDarkMode } from "@App/pages/store/features/config";
import { RiFileCodeLine, RiImportLine, RiPlayListAddLine, RiTerminalBoxLine, RiTimerLine } from "react-icons/ri";
import { scriptClient } from "@App/pages/store/features/script";
import { useDropzone } from "react-dropzone";
import { systemConfig } from "@App/pages/store/global";
import i18n, { matchLanguage } from "@App/locales/locales";
import "./index.css";

const readFile = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    // 实例化 FileReader对象
    const reader = new FileReader();
    reader.onload = async (processEvent) => {
      // 创建blob url
      const blob = new Blob([processEvent.target!.result!], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);
      resolve(url);
    };
    // 调用readerAsText方法读取文本
    reader.readAsText(file);
  });
};

const uploadFiles = async (files: File[], importByUrlsFunc: (urls: string[]) => Promise<void>) => {
  // const filterFiles = files.filter((f) => f.name.endsWith(".js"));
  const urls = await Promise.all(
    files.map((file) => {
      return readFile(file);
    })
  );
  importByUrlsFunc(urls);
};

const MainLayout: React.FC<{
  children: ReactNode;
  className: string;
  pageName?: string;
}> = ({ children, className, pageName }) => {
  const lightMode = useAppSelector(selectThemeMode);
  const dispatch = useAppDispatch();
  const importRef = useRef<RefTextAreaType>(null);
  const [importVisible, setImportVisible] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const { t } = useTranslation();

  const importByUrlsLocal = async (urls: string[]) => {
    const stat = await scriptClient.importByUrls(urls);
    stat &&
      Modal.info({
        title: t("script_import_result"),
        content: (
          <Space direction="vertical" style={{ width: "100%" }}>
            <div style={{ textAlign: "center" }}>
              <Space size="small" style={{ fontSize: 18 }}>
                <IconCheckCircle style={{ color: "green" }} />
                {stat.success}
                {""}
                <IconCloseCircle style={{ color: "red" }} />
                {stat.fail}
              </Space>
            </div>
            {stat.msg.length > 0 && (
              <>
                <b>{t("failure_info")}:</b>
                {stat.msg}
              </>
            )}
          </Space>
        ),
      });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/javascript": [".js"] },
    onDrop: (acceptedFiles) => {
      console.log(acceptedFiles);
      uploadFiles(acceptedFiles, importByUrlsLocal);
    },
  });

  const languageList: { key: string; title: string }[] = [];
  Object.keys(i18n.store.data).forEach((key) => {
    if (key === "ach-UG") {
      return;
    }
    languageList.push({
      key,
      title: i18n.store.data[key].title as string,
    });
  });
  languageList.push({
    key: "help",
    title: t("help_translate"),
  });

  useEffect(() => {
    // 当没有匹配语言时显示语言按钮
    matchLanguage().then((result) => {
      if (!result) {
        setShowLanguage(true);
      }
    });
  });

  return (
    <ConfigProvider
      renderEmpty={() => {
        return <Empty description={t("no_data")} />;
      }}
    >
      <Layout>
        <Layout.Header
          style={{
            height: "50px",
            borderBottom: "1px solid var(--color-neutral-3)",
          }}
          className="flex items-center justify-between px-4"
        >
          <Modal
            title={t("import_link")}
            visible={importVisible}
            onOk={async () => {
              const urls = importRef.current!.dom.value.split("\n").filter((v) => v);
              importByUrlsLocal(urls);
              setImportVisible(false);
            }}
            onCancel={() => {
              setImportVisible(false);
            }}
          >
            <Input.TextArea ref={importRef} rows={8} placeholder={t("import_script_placeholder")} defaultValue="" />
          </Modal>
          <div className="flex row items-center">
            <img style={{ height: "40px" }} src="/assets/logo.png" alt="ScriptCat" />
            <Typography.Title heading={4} className="!m-0">
              ScriptCat
            </Typography.Title>
          </div>
          <Space size="small" className="action-tools">
            {pageName === "options" && (
              <Dropdown
                droplist={
                  <Menu style={{ maxHeight: "100%", width: "calc(100% + 10px)" }}>
                    <Menu.Item key="/script/editor">
                      <a href="#/script/editor">
                        <RiFileCodeLine /> {t("create_user_script")}
                      </a>
                    </Menu.Item>
                    <Menu.Item key="background">
                      <a href="#/script/editor?template=background">
                        <RiTerminalBoxLine /> {t("create_background_script")}
                      </a>
                    </Menu.Item>
                    <Menu.Item key="crontab">
                      <a href="#/script/editor?template=crontab">
                        <RiTimerLine /> {t("create_scheduled_script")}
                      </a>
                    </Menu.Item>
                    <Menu.Item
                      key="import_local"
                      onClick={() => {
                        document.getElementById("import-local")?.click();
                      }}
                    >
                      <RiImportLine /> {t("import_by_local")}
                    </Menu.Item>
                    <Menu.Item
                      key="link"
                      onClick={() => {
                        setImportVisible(true);
                      }}
                    >
                      <IconLink /> {t("import_link")}
                    </Menu.Item>
                  </Menu>
                }
                position="bl"
              >
                <Button
                  type="text"
                  size="small"
                  style={{
                    color: "var(--color-text-1)",
                  }}
                  className="!text-size-sm"
                >
                  <RiPlayListAddLine /> {t("create_script")} <IconDown />
                </Button>
              </Dropdown>
            )}
            <Dropdown
              droplist={
                <Menu
                  onClickMenuItem={(key) => {
                    dispatch(setDarkMode(key as "light" | "dark" | "auto"));
                  }}
                  selectedKeys={[lightMode]}
                >
                  <Menu.Item key="light">
                    <IconSunFill /> Light
                  </Menu.Item>
                  <Menu.Item key="dark">
                    <IconMoonFill /> Dark
                  </Menu.Item>
                  <Menu.Item key="auto">
                    <IconDesktop /> {t("system_follow")}
                  </Menu.Item>
                </Menu>
              }
              position="bl"
            >
              <Button
                type="text"
                size="small"
                icon={
                  <>
                    {lightMode === "auto" && <IconDesktop />}
                    {lightMode === "light" && <IconSunFill />}
                    {lightMode === "dark" && <IconMoonFill />}
                  </>
                }
                style={{
                  color: "var(--color-text-1)",
                }}
                className="!text-lg"
              />
            </Dropdown>
            {showLanguage && (
              <Dropdown
                droplist={
                  <Menu>
                    {languageList.map((value) => (
                      <Menu.Item
                        key={value.key}
                        onClick={() => {
                          if (value.key === "help") {
                            window.open("https://crowdin.com/project/scriptcat", "_blank");
                            return;
                          }
                          systemConfig.setLanguage(value.key);
                          Message.success(t("language_change_tip")!);
                        }}
                      >
                        {value.title}
                      </Menu.Item>
                    ))}
                  </Menu>
                }
              >
                <Button
                  type="text"
                  size="small"
                  iconOnly
                  icon={<IconLanguage />}
                  style={{
                    color: "var(--color-text-1)",
                  }}
                  className="!text-lg"
                ></Button>
              </Dropdown>
            )}
          </Space>
        </Layout.Header>
        <Layout
          className={`absolute top-50px bottom-0 w-full ${className}`}
          style={{
            background: "var(--color-fill-2)",
          }}
          {...getRootProps({ onClick: (e) => e.stopPropagation() })}
        >
          <input id="import-local" {...getInputProps({ style: { display: "none" } })} />
          <div
            style={{
              position: "absolute",
              zIndex: 100,
              display: isDragActive ? "flex" : "none",
              justifyContent: "center",
              alignItems: "center",
              inset: 0,
              margin: "auto",
              color: "grey",
              fontSize: 36,
              width: "100%",
              height: "100%",
              backdropFilter: "blur(4px)",
            }}
          >
            {t("drag_script_here_to_upload")}
          </div>
          {children}
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default MainLayout;
