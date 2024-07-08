import IoC from "@App/app/ioc";
import ScriptController from "@App/app/service/script/controller";
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
import { RefInputType } from "@arco-design/web-react/es/Input/interface";
import {
  IconDesktop,
  IconDown,
  IconLink,
  IconMoonFill,
  IconSunFill,
} from "@arco-design/web-react/icon";
import { editor } from "monaco-editor";
import React, { ReactNode, useRef, useState } from "react";
import {
  RiFileCodeLine,
  RiTerminalBoxLine,
  RiTimerLine,
  RiPlayListAddLine,
  RiImportLine,
} from "react-icons/ri";
import "./index.css";
import { useTranslation } from "react-i18next";

export function switchLight(mode: string) {
  if (mode === "auto") {
    const darkThemeMq = window.matchMedia("(prefers-color-scheme: dark)");
    const isMatch = (match: boolean) => {
      if (match) {
        document.body.setAttribute("arco-theme", "dark");
        editor.setTheme("vs-dark");
      } else {
        document.body.removeAttribute("arco-theme");
        editor.setTheme("vs");
      }
    };
    darkThemeMq.addEventListener("change", (e) => {
      isMatch(e.matches);
    });
    isMatch(darkThemeMq.matches);
  } else {
    document.body.setAttribute("arco-theme", mode);
    editor.setTheme(mode === "dark" ? "vs-dark" : "vs");
  }
}

const MainLayout: React.FC<{
  children: ReactNode;
  className: string;
  pageName: string;
}> = ({ children, className, pageName }) => {
  const [lightMode, setLightMode] = useState(localStorage.lightMode || "auto");
  const importRef = useRef<RefInputType>(null);
  const [importVisible, setImportVisible] = useState(false);
  const { t } = useTranslation();

  switchLight(lightMode);
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
          className="flex items-center justify-between p-x-4"
        >
          <Modal
            title={t("import_link")}
            visible={importVisible}
            onOk={async () => {
              const scriptCtl = IoC.instance(
                ScriptController
              ) as ScriptController;
              try {
                await scriptCtl.importByUrl(importRef.current!.dom.value);
              } catch (e) {
                Message.error(`${t("import_link_failure")}: ${e}`);
              }
              setImportVisible(false);
            }}
            onCancel={() => {
              setImportVisible(false);
            }}
          >
            <Input ref={importRef} defaultValue="" />
          </Modal>
          <div className="flex row items-center">
            <img
              style={{ height: "40px" }}
              src="/assets/logo.png"
              alt="ScriptCat"
            />
            <Typography.Title heading={4} className="!m-0">
              ScriptCat
            </Typography.Title>
          </div>
          <Space size="small" className="action-tools">
            {pageName === "options" && (
              <Dropdown
                droplist={
                  <Menu
                    style={{ maxHeight: "100%", width: "calc(100% + 10px)" }}
                  >
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
                        const el = document.getElementById("import-local");
                        el!.onchange = (e: Event) => {
                          const scriptCtl = IoC.instance(
                            ScriptController
                          ) as ScriptController;
                          try {
                            // 获取文件
                            // @ts-ignore
                            const file = e.target.files[0];
                            // 实例化 FileReader对象
                            const reader = new FileReader();
                            reader.onload = async (processEvent) => {
                              // 创建blob url
                              const blob = new Blob(
                                // @ts-ignore
                                [processEvent.target!.result],
                                {
                                  type: "application/javascript",
                                }
                              );
                              const url = URL.createObjectURL(blob);
                              await scriptCtl.importByUrl(url);
                              Message.success(t("import_local_success"));
                            };
                            // 调用readerAsText方法读取文本
                            reader.readAsText(file);
                          } catch (error) {
                            Message.error(`${t("import_local_failure")}: ${e}`);
                          }
                        };
                        el!.click();
                      }}
                    >
                      <input
                        id="import-local"
                        type="file"
                        style={{ display: "none" }}
                        accept=".js"
                      />
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
                    switchLight(key);
                    setLightMode(key);
                    localStorage.lightMode = key;
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
                className="!text-size-lg"
              />
            </Dropdown>
          </Space>
        </Layout.Header>
        <Layout
          className={`absolute top-50px bottom-0 w-full ${className}`}
          style={{
            background: "var(--color-fill-2)",
          }}
        >
          {children}
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default MainLayout;
