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
  IconLink,
  IconMoonFill,
  IconSunFill,
} from "@arco-design/web-react/icon";
import React, { ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import { useAppDispatch, useAppSelector } from "@App/pages/store/hooks";
import { selectThemeMode, setDarkMode } from "@App/pages/store/features/config";
import { RiFileCodeLine, RiImportLine, RiPlayListAddLine, RiTerminalBoxLine, RiTimerLine } from "react-icons/ri";
import { scriptClient } from "@App/pages/store/features/script";

const MainLayout: React.FC<{
  children: ReactNode;
  className: string;
  pageName?: string;
}> = ({ children, className, pageName }) => {
  const lightMode = useAppSelector(selectThemeMode);
  const dispatch = useAppDispatch();
  const importRef = useRef<RefTextAreaType>(null);
  const [importVisible, setImportVisible] = useState(false);
  const { t } = useTranslation();

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
              try {
                const stat = await scriptClient.importByUrls(urls);
                stat &&
                  Modal.info({
                    title: "链接导入结果",
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
                            <b>失败信息:</b>
                            {stat.msg}
                          </>
                        )}
                      </Space>
                    ),
                  });
                setImportVisible(false);
              } catch (e) {
                Message.error(`${t("import_link_failure")}: ${e}`);
              }
            }}
            onCancel={() => {
              setImportVisible(false);
            }}
          >
            <Input.TextArea
              ref={importRef}
              rows={8}
              placeholder={`支持输入.user.js结尾的脚本绝对链接 或 脚本猫安装页链接\n可多行填写，每行一条\n示例：\nhttps://example.com/test.user.js \nhttps://scriptcat.org/zh-CN/script-show-page/1234`}
              defaultValue=""
            />
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
                        const el = document.getElementById("import-local");
                        el!.onchange = (e: Event) => {
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
                              await scriptClient.importByUrl(url);
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
                      <input id="import-local" type="file" style={{ display: "none" }} accept=".js" />
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
