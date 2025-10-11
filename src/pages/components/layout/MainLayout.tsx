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
import type { RefTextAreaType } from "@arco-design/web-react/es/Input";
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
import type { ReactNode } from "react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "@App/pages/store/AppContext";
import { RiFileCodeLine, RiImportLine, RiPlayListAddLine, RiTerminalBoxLine, RiTimerLine } from "react-icons/ri";
import { scriptClient } from "@App/pages/store/features/script";
import { useDropzone, type FileWithPath } from "react-dropzone";
import { systemConfig } from "@App/pages/store/global";
import i18n, { matchLanguage } from "@App/locales/locales";
import "./index.css";
import { arcoLocale } from "@App/locales/arco";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import type { ScriptClient } from "@App/app/service/service_worker/client";
import { saveHandle } from "@App/pkg/utils/filehandle-db";

const MainLayout: React.FC<{
  children: ReactNode;
  className: string;
  pageName?: string;
}> = ({ children, className, pageName }) => {
  const [modal, contextHolder] = Modal.useModal();
  const { colorThemeState, updateColorTheme, openEditor } = useAppContext();

  const importRef = useRef<RefTextAreaType>(null);
  const [importVisible, setImportVisible] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const { t } = useTranslation();

  // 用 hash 判斷是否在 URL 模式的 ScriptEditor 頁面
  const [inUrlEditor, setInUrlEditor] = useState<boolean>(() => {
    const h = typeof window !== "undefined" ? window.location.hash : "";
    const path = h.startsWith("#") ? h.slice(1) : h;
    return path.split("?")[0].startsWith("/script/editor");
  });

  useEffect(() => {
    const syncFromHash = () => {
      const h = window.location.hash || "";
      const path = h.startsWith("#") ? h.slice(1) : h;
      setInUrlEditor(path.split("?")[0].startsWith("/script/editor"));
    };
    // 初始化 & 監聽 hash 變化
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  // 統一處理「新增腳本」
  const createScript = (o: { template?: "" | "background" | "crontab"; target?: "blank" | "initial" }) => {
    if (document.querySelector(".editor-modal-wrapper")?.parentElement) {
      document.querySelector(".editor-modal-wrapper")!.parentElement!.style.display = "block";
    }
    if (inUrlEditor && !document.querySelector("#scripteditor-layout-content")?.firstElementChild) {
      // URL 模式：通知路由內的 ScriptEditor 自己加一個分頁
      window.dispatchEvent(
        new CustomEvent("scriptcat:editor:add", {
          detail: { template: o.template || "", target: o.target || "blank" },
        })
      );
    } else {
      // Overlay 模式
      openEditor({ template: o.template || "", target: o.target || "blank" });
    }
    if (document.querySelector(".editor-modal-wrapper")?.parentElement) {
      document.querySelector(".editor-modal-wrapper")!.parentElement!.style.display = "block";
    }
  };

  const showImportResult = (stat: Awaited<ReturnType<ScriptClient["importByUrls"]>>) => {
    if (!stat) return;
    modal.info!({
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
              <b>{t("failure_info") + ":"}</b>
              {stat.msg}
            </>
          )}
        </Space>
      ),
    });
  };

  const importByUrlsLocal = async (urls: string[]) => {
    const stat = await scriptClient.importByUrls(urls);
    stat && showImportResult(stat);
  };

  // 提供一个简单的字串封装（非加密用)
  function simpleDigestMessage(message: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    return crypto.subtle.digest("SHA-1", data as BufferSource).then((hashBuffer) => {
      const hashArray = new Uint8Array(hashBuffer);
      let hex = "";
      for (let i = 0; i < hashArray.length; i++) {
        const byte = hashArray[i];
        hex += `${byte < 16 ? "0" : ""}${byte.toString(16)}`;
      }
      return hex;
    });
  }

  const onDrop = (acceptedFiles: FileWithPath[]) => {
    // 本地的文件在当前页面处理，打开安装页面，将FileSystemFileHandle传递过去
    // 实现本地文件的监听
    const stat: Awaited<ReturnType<ScriptClient["importByUrls"]>> = { success: 0, fail: 0, msg: [] };
    Promise.all(
      acceptedFiles.map(async (aFile) => {
        try {
          // 解析看看是不是一个标准的script文件
          // 如果是，则打开安装页面
          let fileHandle = aFile.handle;
          if (!fileHandle) {
            // 如果是file，直接使用blob的形式安装
            if (aFile instanceof FileSystemFileHandle) {
              fileHandle = aFile;
            } else if (aFile instanceof File) {
              // 清理 import-local files 避免同文件不再触发onChange
              (document.getElementById("import-local") as HTMLInputElement).value = "";
              const blob = new Blob([aFile], { type: "application/javascript" });
              const url = URL.createObjectURL(blob); // 生成一个临时的URL
              const result = await scriptClient.importByUrl(url);
              if (result.success) {
                stat.success++;
              } else {
                stat.fail++;
                stat.msg.push(...result.msg);
              }
              return;
            } else {
              throw new Error("Invalid Local File Access");
            }
          }
          const file = await fileHandle.getFile();
          if (!file.name || !file.size) {
            throw new Error("No Read Access Right for File");
          }
          // 先检查内容，后弹出安装页面
          const checkOk = await Promise.allSettled([
            file.text().then((code) => prepareScriptByCode(code, `file:///*resp-check*/${file.name}`)),
            simpleDigestMessage(`f=${file.name}\ns=${file.size},m=${file.lastModified}`),
          ]);
          if (checkOk[0].status === "rejected" || !checkOk[0].value || checkOk[1].status === "rejected") {
            throw new Error(t("script_import_failed"));
          }
          const fid = checkOk[1].value;
          await saveHandle(fid, fileHandle); // fileHandle以DB方式传送至安装页面
          // 打开安装页面
          const installWindow = window.open(`/src/install.html?file=${fid}`, "_blank");
          if (!installWindow) {
            throw new Error(t("install_page_open_failed"));
          }
          stat.success++;
        } catch (e: any) {
          stat.fail++;
          stat.msg.push(e.message);
        }
      })
    ).then(() => {
      showImportResult(stat);
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/javascript": [".js"] },
    onDrop,
  });

  const languageList: { key: string; title: string }[] = [];
  for (const key of Object.keys(i18n.store.data)) {
    if (key === "ach-UG") {
      continue;
    }
    languageList.push({
      key,
      title: i18n.store.data[key].title as string,
    });
  }
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
  }, []);

  const handleImport = async () => {
    const urls = importRef.current!.dom.value.split("\n").filter((v) => v);
    importByUrlsLocal(urls);
    setImportVisible(false);
  };

  return (
    <ConfigProvider
      renderEmpty={() => {
        return <Empty description={t("no_data")} />;
      }}
      locale={arcoLocale(i18n.language)}
    >
      {contextHolder}
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
            onOk={handleImport}
            onCancel={() => {
              setImportVisible(false);
            }}
          >
            <Input.TextArea
              ref={importRef}
              rows={8}
              placeholder={t("import_script_placeholder")}
              defaultValue=""
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === "Enter") {
                  e.preventDefault();
                  handleImport();
                }
              }}
            />
          </Modal>
          <div className="flex row items-center">
            <img style={{ height: "40px" }} src="/assets/logo.png" alt="ScriptCat" />
            <Typography.Title heading={4} className="!m-0">
              {"ScriptCat"}
            </Typography.Title>
          </div>
          <Space size="small" className="action-tools">
            {pageName === "options" && (
              <Dropdown
                droplist={
                  <Menu style={{ maxHeight: "100%", width: "calc(100% + 10px)" }}>
                    <Menu.Item key="/script/editor" onClick={() => createScript({ template: "" })}>
                      <RiFileCodeLine /> {t("create_user_script")}
                    </Menu.Item>
                    <Menu.Item
                      key="/script/editor!background"
                      onClick={() => createScript({ template: "background", target: "blank" })}
                    >
                      <RiTerminalBoxLine /> {t("create_background_script")}
                    </Menu.Item>
                    <Menu.Item
                      key="/script/editor!crontab"
                      onClick={() => createScript({ template: "crontab", target: "blank" })}
                    >
                      <RiTimerLine /> {t("create_scheduled_script")}
                    </Menu.Item>
                    <Menu.Item
                      className={"option-entry"}
                      key="import_local"
                      onClick={() => {
                        if ("showOpenFilePicker" in window) {
                          // 使用新的文件打开接口，解决无法监听本地文件的问题
                          //@ts-ignore
                          window
                            .showOpenFilePicker({
                              multiple: true,
                              types: [
                                {
                                  description: "JavaScript",
                                  accept: { "application/javascript": [".js"] },
                                },
                              ],
                            })
                            .then((handles: any) => {
                              onDrop(handles as FileWithPath[]);
                            });
                        } else {
                          // 旧的方式，无法监听本地文件变更
                          document.getElementById("import-local")?.click();
                        }
                      }}
                    >
                      <RiImportLine /> {t("import_by_local")}
                    </Menu.Item>
                    <Menu.Item
                      className={"option-entry"}
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
                    const theme = key as "auto" | "light" | "dark";
                    updateColorTheme(theme);
                  }}
                  selectedKeys={[colorThemeState]}
                >
                  <Menu.Item key="light">
                    <IconSunFill /> {t("light")}
                  </Menu.Item>
                  <Menu.Item key="dark">
                    <IconMoonFill /> {t("dark")}
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
                    {colorThemeState === "auto" && <IconDesktop />}
                    {colorThemeState === "light" && <IconSunFill />}
                    {colorThemeState === "dark" && <IconMoonFill />}
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
