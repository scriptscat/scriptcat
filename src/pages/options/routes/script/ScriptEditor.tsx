import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_TYPE_NORMAL, ScriptCodeDAO, ScriptDAO } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { editor } from "monaco-editor";
import { KeyCode, KeyMod } from "monaco-editor";
import { Button, Dropdown, Grid, Input, Menu, Message, Modal, Tabs, Tooltip } from "@arco-design/web-react";
import TabPane from "@arco-design/web-react/es/Tabs/tab-pane";
import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { v4 as uuidv4 } from "uuid";
import "./index.css";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import ScriptStorage from "@App/pages/components/ScriptStorage";
import ScriptResource from "@App/pages/components/ScriptResource";
import ScriptSetting from "@App/pages/components/ScriptSetting";
import { runtimeClient, scriptClient } from "@App/pages/store/features/script";
import i18n, { i18nName } from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import { IconDelete, IconSearch } from "@arco-design/web-react/icon";
import { lazyScriptName } from "@App/pkg/config/config";

const { Row, Col } = Grid;

type HotKey = {
  id: string;
  title: string;
  hotKey: number;
  action: (script: Script, codeEditor: editor.IStandaloneCodeEditor) => void;
};

const Editor: React.FC<{
  id: string;
  script: Script;
  code: string;
  hotKeys: HotKey[];
  callbackEditor: (e: editor.IStandaloneCodeEditor) => void;
  onChange: (code: string) => void;
  className: string;
}> = ({ id, script, code, hotKeys, callbackEditor, onChange, className }) => {
  const [node, setNode] = useState<{ editor: editor.IStandaloneCodeEditor }>();
  const ref = useCallback<(node: { editor: editor.IStandaloneCodeEditor }) => void>(
    (inlineNode) => {
      if (inlineNode && inlineNode.editor && !node) {
        setNode(inlineNode);
      }
    },
    [node]
  );
  useEffect(() => {
    if (!node || !node.editor) {
      return;
    }
    // @ts-ignore
    if (!node.editor.uuid) {
      // @ts-ignore
      node.editor.uuid = script.uuid;
    }
    hotKeys.forEach((item) => {
      node.editor.addAction({
        id: item.id,
        label: item.title,
        keybindings: [item.hotKey],
        run(editor) {
          // @ts-ignore
          item.action(script, editor);
        },
      });
    });
    node.editor.onKeyUp(() => {
      onChange(node.editor.getValue() || "");
    });
    callbackEditor(node.editor);
    return () => {
      node.editor.dispose();
    };
  }, [node?.editor]);

  return <CodeEditor key={id} id={id} ref={ref} className={className} code={code} diffCode="" editable />;
};

const WarpEditor = React.memo(Editor, (prev, next) => {
  return prev.script.uuid === next.script.uuid;
});

type EditorMenu = {
  title: string;
  tooltip?: string;
  action?: (script: Script, e: editor.IStandaloneCodeEditor) => void;
  items?: {
    id: string;
    title: string;
    tooltip?: string;
    hotKey?: number;
    hotKeyString?: string;
    action: (script: Script, e: editor.IStandaloneCodeEditor) => void;
  }[];
};

const emptyScript = async (template: string, hotKeys: any, target?: string) => {
  let code = "";
  switch (template) {
    case "background":
      code = backgroundTpl;
      code = lazyScriptName(code);
      break;
    case "crontab":
      code = crontabTpl;
      code = lazyScriptName(code);
      break;
    default: {
      code = normalTpl;
      const [url, icon] =
        target === "initial"
          ? await new Promise<string[]>((resolve) => {
              chrome.storage.local.get(["activeTabUrl"], (result) => {
                const lastError = chrome.runtime.lastError;
                let retUrl = "https://*/*";
                let retIcon = "";
                if (lastError) {
                  console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
                  chrome.storage.local.remove(["activeTabUrl"]);
                } else {
                  chrome.storage.local.remove(["activeTabUrl"]);
                  const pageUrl = result?.activeTabUrl?.url;
                  if (pageUrl) {
                    try {
                      const { protocol, pathname, hostname } = new URL(pageUrl);
                      if (protocol && pathname && hostname) {
                        retUrl = `${protocol}//${hostname}${pathname}`;
                        if (protocol === "http:" || protocol === "https:") {
                          retIcon = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
                        }
                      }
                    } catch {
                      // do nothing
                    }
                  }
                }
                resolve([retUrl, retIcon]);
              });
            })
          : ["https://*/*", ""];
      code = lazyScriptName(code);
      if (icon) {
        code = code.replace("{{match}}", url);
        code = code.replace("{{icon}}", icon);
      } else {
        code = code.replace("{{match}}", url);
        code = code.replace(/[\r\n]*[^\r\n]*\{\{icon\}\}[^\r\n]*/, "");
      }
      break;
    }
  }
  const prepareScript = await prepareScriptByCode(code, "", uuidv4());
  const { script } = prepareScript;
  script.createtime = 0;

  return {
    script,
    code,
    active: true,
    hotKeys,
    isChanged: false,
  };
};

type visibleItem = "scriptStorage" | "scriptSetting" | "scriptResource";

const popstate = () => {
  if (confirm(i18n.t("script_modified_leave_confirm"))) {
    window.history.back();
    window.removeEventListener("popstate", popstate);
  } else {
    window.history.pushState(null, "", window.location.href);
  }
  return false;
};

function ScriptEditor() {
  const [visible, setVisible] = useState<{ [key: string]: boolean }>({});
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [showSearchInput, setShowSearchInput] = useState<boolean>(false);
  const [editors, setEditors] = useState<
    {
      script: Script;
      code: string;
      active: boolean;
      hotKeys: HotKey[];
      editor?: editor.IStandaloneCodeEditor;
      isChanged: boolean;
    }[]
  >([]);
  const [scriptList, setScriptList] = useState<Script[]>([]);
  const [currentScript, setCurrentScript] = useState<Script>();
  const [selectSciptButtonAndTab, setSelectSciptButtonAndTab] = useState<string>("");
  const [rightOperationTab, setRightOperationTab] = useState<{
    key: string;
    uuid: string;
    selectSciptButtonAndTab: string;
  }>();
  const [pageInit, setPageInit] = useState<boolean>(false);
  const [canLoadScript, setCanLoadScript] = useState<boolean>(false);
  const [hiddenScriptList, setHiddenScriptList] = useState<boolean>(false);

  const pageUrlParams = useParams();
  const [pageUrlSearchParams, setPageUrlSearchParams] = useSearchParams();

  const { t } = useTranslation();
  const scriptDAO = new ScriptDAO();
  const scriptCodeDAO = new ScriptCodeDAO();

  const setShow = (key: visibleItem, show: boolean) => {
    for (const k of Object.keys(visible)) {
      visible[k] = false;
    }
    visible[key] = show;
    setVisible({ ...visible });
  };

  const save = (existingScript: Script, e: editor.IStandaloneCodeEditor): Promise<Script> => {
    // 解析code生成新的script并更新
    const code = e.getValue();
    const targetUUID = existingScript.uuid;
    return prepareScriptByCode(code, existingScript.origin || "", targetUUID)
      .then((prepareScript) => {
        const { script, oldScript } = prepareScript;
        if (targetUUID) {
          if (existingScript.createtime !== 0) {
            if (!oldScript || oldScript.uuid !== targetUUID) {
              Message.warning("The editing script does not exist.");
              return Promise.reject(new Error("The editing script does not exist."));
            }
          }
          existingScript.createtime = Date.now();
          script.createtime = existingScript.createtime;
        }
        if (!script.name) {
          Message.warning(t("script_name_cannot_be_set_to_empty"));
          return Promise.reject(new Error("script name cannot be empty"));
        }
        return scriptClient
          .install(script, code)
          .then((update): Script => {
            if (!update) {
              Message.success(t("create_success_note"));
              // 保存的时候如何左侧没有脚本即新建
              setScriptList((prev) => {
                setSelectSciptButtonAndTab(script.uuid);
                return [script, ...prev];
              });
            } else {
              const uuid = script.uuid;
              const name = script.name;
              setScriptList((prev) =>
                prev.map((script: Script) =>
                  script.uuid === uuid
                    ? {
                        ...script,
                        name,
                      }
                    : script
                )
              );
              Message.success(t("save_success"));
            }
            const uuid = script.uuid;
            const name = script.name;
            setEditors((prev) =>
              prev.map((item) =>
                item.script.uuid === uuid
                  ? {
                      ...item,
                      code: code,
                      isChanged: false,
                      script: {
                        ...item.script,
                        name,
                      },
                    }
                  : item
              )
            );
            return script;
          })
          .catch((err: any) => {
            Message.error(`${t("save_failed")}: ${err}`);
            return Promise.reject(err);
          });
      })
      .catch((err) => {
        Message.error(`${t("invalid_script_code")}: ${err}`);
        return Promise.reject(err);
      });
  };

  const saveAs = (script: Script, e: editor.IStandaloneCodeEditor) => {
    return new Promise<void>((resolve) => {
      chrome.downloads.download(
        {
          url: URL.createObjectURL(new Blob([e.getValue()], { type: "text/javascript" })),
          saveAs: true, // true直接弹出对话框；false弹出下载选项
          filename: `${script.name}.user.js`,
        },
        () => {
          /*
            chrome扩展api发生错误无法通过try/catch捕获，必须在api回调函数中访问chrome.runtime.lastError进行获取
            var chrome.runtime.lastError: chrome.runtime.LastError | undefined
            This will be defined during an API method callback if there was an error
          */
          if (chrome.runtime.lastError) {
            console.log(t("save_as_failed") + ": ", chrome.runtime.lastError);
            Message.error(`${t("save_as_failed")}: ${chrome.runtime.lastError.message}`);
          } else {
            Message.success(t("save_as_success"));
          }
          resolve();
        }
      );
    });
  };
  const menu: EditorMenu[] = [
    {
      title: t("file"),
      items: [
        {
          id: "save",
          title: t("save"),
          hotKey: KeyMod.CtrlCmd | KeyCode.KeyS,
          hotKeyString: "Ctrl+S",
          action: save,
        },
        {
          id: "saveAs",
          title: t("save_as"),
          hotKey: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
          hotKeyString: "Ctrl+Shift+S",
          action: saveAs,
        },
      ],
    },
    {
      title: t("run"),
      items: [
        {
          id: "run",
          title: t("run"),
          hotKey: KeyMod.CtrlCmd | KeyCode.F5,
          hotKeyString: "Ctrl+F5",
          tooltip: t("only_background_scheduled_can_run"),
          action: async (script, e) => {
            // 保存更新代码之后再调试
            const newScript = await save(script, e);
            // 判断脚本类型
            if (newScript.type === SCRIPT_TYPE_NORMAL) {
              Message.error(t("only_background_scheduled_can_run"));
              return;
            }
            Message.loading({
              id: "debug_script",
              content: t("preparing_script_resources"),
              duration: 3000,
            });
            runtimeClient
              .runScript(newScript.uuid)
              .then(() => {
                Message.success({
                  id: "debug_script",
                  content: t("build_success_message"),
                  duration: 3000,
                });
              })
              .catch((err) => {
                LoggerCore.logger(Logger.E(err)).debug("run script error");
                Message.error({
                  id: "debug_script",
                  content: `${t("build_failed")}: ${err}`,
                  duration: 3000,
                });
              });
          },
        },
      ],
    },
    {
      title: t("tools"),
      items: [
        {
          id: "scriptStorage",
          title: t("script_storage"),
          tooltip: t("script_storage_tooltip"),
          action(script) {
            setShow("scriptStorage", true);
            setCurrentScript(script);
          },
        },
        {
          id: "scriptResource",
          title: t("script_resource"),
          tooltip: t("script_resource_tooltip"),
          action(script) {
            setShow("scriptResource", true);
            setCurrentScript(script);
          },
        },
      ],
    },
    {
      title: t("layout"),
      items: [
        {
          id: "hideScriptList",
          title: (hiddenScriptList ? "✓ " : "") + t("hide_script_list"),
          action() {
            setHiddenScriptList(!hiddenScriptList);
          },
        },
      ],
    },
    {
      title: t("settings"),
      tooltip: t("script_setting_tooltip"),
      action(script) {
        setShow("scriptSetting", true);
        setCurrentScript(script);
      },
    },
  ];

  // 根据菜单生产快捷键
  const hotKeys: HotKey[] = [];
  let activeTab = "";
  for (let i = 0; i < editors.length; i += 1) {
    if (editors[i].active) {
      activeTab = i.toString();
      break;
    }
  }
  menu.forEach((item) => {
    item.items?.forEach((menuItem) => {
      if (menuItem.hotKey) {
        hotKeys.push({
          id: menuItem.id,
          title: menuItem.title,
          hotKey: menuItem.hotKey,
          action: menuItem.action,
        });
      }
    });
  });
  useEffect(() => {
    const [alreadyInit] = [pageInit];
    if (!alreadyInit) {
      setPageInit(true); // 防止开发模式下重复初始化

      const newParams = new URLSearchParams(pageUrlSearchParams);
      if (newParams.get("d")) {
        newParams.delete("d");
        setPageUrlSearchParams(newParams, { replace: true });
      }

      scriptDAO.all().then((scripts) => {
        setScriptList(scripts.sort((a, b) => a.sort - b.sort));
        setCanLoadScript(true);
      });
    }
    // 恢复标题
    return () => {
      document.title = "Home - ScriptCat";
    };
  }, []);

  const memoUrlQueryString = useMemo(() => {
    return `${pageUrlParams.uuid || ""}|${pageUrlSearchParams.get("template") || ""}|${pageUrlSearchParams.get("target") || ""}|${pageUrlSearchParams.get("d") || ""}`;
  }, [pageUrlParams, pageUrlSearchParams]);

  useEffect(() => {
    if (!canLoadScript) return;

    const [uuid, template, target, d] = memoUrlQueryString.split("|");
    if (d) return;
    const newParams = new URLSearchParams(pageUrlSearchParams);
    newParams.set("d", `${Date.now()}`);
    setPageUrlSearchParams(newParams, { replace: true });

    // 如果有id则打开对应的脚本
    if (uuid) {
      const [scripts] = [scriptList];
      for (let i = 0; i < scripts.length; i += 1) {
        if (scripts[i].uuid === uuid) {
          // 如果已经打开则激活
          scriptCodeDAO.findByUUID(uuid).then((code) => {
            const uuid = scripts[i].uuid;
            setEditors((prev) => {
              const flag = prev.some((item) => item.script.uuid === uuid);
              if (flag) {
                return prev.map((item) =>
                  item.script.uuid === uuid
                    ? {
                        ...item,
                        active: true,
                      }
                    : {
                        ...item,
                        active: false,
                      }
                );
              } else {
                const newEditor = {
                  script: scripts[i],
                  code: code?.code || "",
                  active: true,
                  hotKeys,
                  isChanged: false,
                };
                return [...prev, newEditor];
              }
            });
            setSelectSciptButtonAndTab(uuid);
          });
          break;
        }
      }
    } else {
      emptyScript(template || "", hotKeys, target || "blank").then((e) => {
        setEditors((prev) => {
          prev.forEach((item) => {
            if (item) {
              item.active = false;
            }
          });
          const uuid = e?.script?.uuid;
          if (uuid) {
            setSelectSciptButtonAndTab(uuid);
          }
          return [...prev, e];
        });
      });
    }
  }, [canLoadScript, memoUrlQueryString]);

  // 控制onbeforeunload
  useEffect(() => {
    let flag = false;

    for (let i = 0; i < editors.length; i += 1) {
      if (editors[i].isChanged) {
        flag = true;
        break;
      }
    }

    if (flag) {
      const beforeunload = () => {
        return true;
      };
      window.onbeforeunload = beforeunload;
      window.history.pushState(null, "", window.location.href);
      window.addEventListener("popstate", popstate);
    } else {
      window.removeEventListener("popstate", popstate);
    }

    return () => {
      window.onbeforeunload = null;
    };
  }, [editors]);

  // 对tab点击右键进行的操作
  useEffect(() => {
    let selectEditorIndex: number = 0;
    // 1 关闭当前, 2关闭其它, 3关闭左侧, 4关闭右侧
    if (rightOperationTab) {
      switch (rightOperationTab.key) {
        case "1":
          setEditors((prev) => {
            prev = prev.filter((item) => item.script.uuid !== rightOperationTab.uuid);
            if (prev.length > 0) {
              // 还有的话，如果之前有选中的，那么我们还是选中之前的，如果没有选中的我们就选中第一个
              if (rightOperationTab.selectSciptButtonAndTab === rightOperationTab.uuid) {
                prev[0] = {
                  ...prev[0],
                  active: true,
                };
                const chooseTabUUID = prev[0].script.uuid;
                setSelectSciptButtonAndTab(chooseTabUUID);
                return prev;
              } else {
                const prevTabUUID = rightOperationTab.selectSciptButtonAndTab;
                setSelectSciptButtonAndTab(prevTabUUID);
                // 之前选中的tab
                return prev.map((item) =>
                  item.script.uuid === prevTabUUID
                    ? {
                        ...item,
                        active: true,
                      }
                    : {
                        ...item,
                        active: false,
                      }
                );
              }
            } else {
              return [];
            }
          });
          break;
        case "2":
          setSelectSciptButtonAndTab(rightOperationTab.uuid);
          setEditors((prev) => prev.filter((item) => item.script.uuid === rightOperationTab.uuid));
          break;
        case "3":
          setEditors((prev) => {
            prev.some((item, index) => {
              if (item.script.uuid === rightOperationTab.uuid) {
                selectEditorIndex = index;
                return true;
              }
            });
            return prev.slice(selectEditorIndex);
          });
          break;
        case "4":
          setEditors((prev) => {
            prev.some((item, index) => {
              if (item.script.uuid === rightOperationTab.uuid) {
                selectEditorIndex = index;
                return true;
              }
            });
            return prev.slice(0, selectEditorIndex + 1);
          });
      }
    }
  }, [rightOperationTab]);

  // 通用的编辑器删除处理函数
  const handleDeleteEditor = (targetUuid: string, needConfirm: boolean = false) => {
    setEditors((prev) => {
      const targetIndex = prev.findIndex((e) => e.script.uuid === targetUuid);
      if (targetIndex === -1) return prev;

      const targetEditor = prev[targetIndex];

      // 如果需要确认且脚本已修改
      if (needConfirm && targetEditor.isChanged) {
        if (!confirm(t("script_modified_close_confirm"))) {
          return prev;
        }
      }

      // 如果只剩一个编辑器，打开空白脚本
      if (prev.length === 1) {
        const template = pageUrlSearchParams.get("template") || "";
        emptyScript(template || "", hotKeys, "blank").then((e) => {
          setEditors([e]);
          setSelectSciptButtonAndTab(e.script.uuid);
        });
        return prev;
      }

      // 删除目标编辑器
      prev = prev.filter((_, index) => index !== targetIndex);

      // 如果删除的是当前激活的编辑器，需要激活其他编辑器
      if (targetEditor.active && prev.length > 0) {
        let nextActiveIndex;
        if (targetIndex >= prev.length) {
          // 如果删除的是最后一个，激活前一个
          nextActiveIndex = prev.length - 1;
        } else {
          // 否则激活下一个（原来的下一个现在在同样的位置）
          nextActiveIndex = targetIndex;
        }
        prev[nextActiveIndex].active = true;
        setSelectSciptButtonAndTab(prev[nextActiveIndex].script.uuid);
      }

      return prev;
    });
  };

  // 处理编辑器激活状态变化时的focus
  useEffect(() => {
    editors.forEach((item) => {
      if (item.active && item.editor) {
        setTimeout(() => {
          item.editor?.focus();
        }, 100);
      }
    });
  }, [activeTab]); // 只在activeTab变化时执行

  return (
    <div
      className="h-full flex flex-col"
      style={{
        position: "relative",
        left: -10,
        top: -10,
        width: "calc(100% + 20px)",
        height: "calc(100% + 20px)",
      }}
    >
      <ScriptStorage
        visible={visible.scriptStorage}
        script={currentScript}
        onOk={() => {
          setShow("scriptStorage", false);
        }}
        onCancel={() => {
          setShow("scriptStorage", false);
        }}
      />
      <ScriptResource
        visible={visible.scriptResource}
        script={currentScript}
        onOk={() => {
          setShow("scriptResource", false);
        }}
        onCancel={() => {
          setShow("scriptResource", false);
        }}
      />
      <ScriptSetting
        visible={visible.scriptSetting}
        script={currentScript!}
        onOk={() => {
          setShow("scriptSetting", false);
        }}
        onCancel={() => {
          setShow("scriptSetting", false);
        }}
      />
      <div
        className="h-6"
        style={{
          borderBottom: "1px solid var(--color-neutral-3)",
          background: "var(--color-secondary)",
        }}
      >
        <div className="flex flex-row">
          {menu.map((item, index) => {
            if (!item.items) {
              // 没有子菜单
              return (
                <Button
                  key={`m_${item.title}`}
                  size="mini"
                  onClick={() => {
                    setEditors((prev) => {
                      prev.forEach((e) => {
                        if (e.active) {
                          item.action && item.action(e.script, e.editor!);
                        }
                      });
                      return prev;
                    });
                  }}
                >
                  {item.title}
                </Button>
              );
            }
            return (
              <Dropdown
                key={`d_${index.toString()}`}
                droplist={
                  <Menu
                    style={{
                      padding: "0",
                      margin: "0",
                      borderRadius: "0",
                    }}
                  >
                    {item.items.map((menuItem, i) => {
                      const btn = (
                        <Button
                          style={{
                            width: "100%",
                            textAlign: "left",
                            alignSelf: "center",
                            verticalAlign: "middle",
                          }}
                          key={`sm_${menuItem.title}`}
                          size="mini"
                          onClick={() => {
                            setEditors((prev) => {
                              prev.forEach((e) => {
                                if (e.active) {
                                  menuItem.action(e.script, e.editor!);
                                }
                              });
                              return prev;
                            });
                          }}
                        >
                          <div
                            style={{
                              minWidth: "70px",
                              float: "left",
                              fontSize: "14px",
                            }}
                          >
                            {menuItem.title}
                          </div>
                          <div
                            style={{
                              minWidth: "50px",
                              float: "left",
                              color: "rgb(165 165 165)",
                              fontSize: "12px",
                              lineHeight: "22px", // 不知道除此以外怎么垂直居中
                            }}
                          >
                            {menuItem.hotKeyString}
                          </div>
                        </Button>
                      );
                      return (
                        <Menu.Item
                          key={`m_${i.toString()}`}
                          style={{
                            height: "unset",
                            padding: "0",
                            lineHeight: "unset",
                          }}
                        >
                          {menuItem.tooltip ? (
                            <Tooltip key={`m${i.toString()}`} position="right" content={menuItem.tooltip}>
                              {btn}
                            </Tooltip>
                          ) : (
                            btn
                          )}
                        </Menu.Item>
                      );
                    })}
                  </Menu>
                }
                trigger="click"
                position="bl"
              >
                <Button key={`m_${item.title}`} size="mini">
                  {item.title}
                </Button>
              </Dropdown>
            );
          })}
        </div>
      </div>
      <Row
        className="flex flex-grow flex-1"
        style={{
          overflow: "hidden",
        }}
      >
        {!hiddenScriptList && (
          <Col
            span={4}
            className="h-full"
            style={{
              overflowY: "scroll",
            }}
          >
            <div
              className="flex flex-col"
              style={{
                backgroundColor: "var(--color-secondary)",
                overflow: "hidden",
              }}
            >
              <Button
                className="text-left"
                size="mini"
                style={{
                  color: "var(--color-text-2)",
                  background: "transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(127, 127, 127, 0.8)",
                }}
                onClick={() => {
                  setShowSearchInput(!showSearchInput);
                  setTimeout(
                    () =>
                      showSearchInput &&
                      (document.querySelector("#editor_search_scripts_input") as HTMLInputElement)?.focus(),
                    1
                  );
                }}
              >
                <div className="flex justify-between items-center">
                  {t("installed_scripts")}
                  <IconSearch
                    style={{
                      cursor: "inherit",
                    }}
                  />
                </div>
              </Button>
              {showSearchInput && (
                <div className="p-2">
                  <Input
                    placeholder={t("search_scripts")}
                    allowClear
                    value={searchKeyword}
                    onChange={(value) => setSearchKeyword(value)}
                    size="mini"
                    id="editor_search_scripts_input"
                  />
                </div>
              )}
              {scriptList
                .filter((script) => {
                  if (!searchKeyword) return true;
                  return i18nName(script).toLowerCase().includes(searchKeyword.toLowerCase());
                })
                .map((script) => (
                  <div
                    key={`s_${script.uuid}`}
                    className="relative group"
                    style={{
                      overflow: "hidden",
                    }}
                  >
                    <Button
                      size="mini"
                      className="text-left w-full"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        backgroundColor: selectSciptButtonAndTab === script.uuid ? "gray" : "",
                        paddingRight: "32px", // 为删除按钮留出空间
                      }}
                      onClick={() => {
                        setSelectSciptButtonAndTab(script.uuid);
                        // 如果已经打开则激活
                        let flag = false;
                        for (let i = 0; i < editors.length; i += 1) {
                          if (editors[i].script.uuid === script.uuid) {
                            editors[i].active = true;
                            flag = true;
                          } else {
                            editors[i].active = false;
                          }
                        }
                        if (!flag) {
                          // 如果没有打开则打开
                          // 获取code
                          scriptCodeDAO.findByUUID(script.uuid).then((code) => {
                            if (!code) {
                              return;
                            }
                            const newEditor = {
                              script,
                              code: code.code,
                              active: true,
                              hotKeys,
                              isChanged: false,
                            };
                            setEditors((prev) => [...prev, newEditor]);
                          });
                        }
                      }}
                    >
                      <span className="overflow-hidden text-ellipsis">{i18nName(script)}</span>
                    </Button>
                    {/* 删除按钮，只在鼠标悬停时显示 */}
                    <Button
                      type="text"
                      icon={<IconDelete />}
                      iconOnly
                      size="mini"
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      style={{
                        width: "20px",
                        height: "20px",
                        minWidth: "20px",
                        border: "none",
                        background: "transparent",
                        color: "var(--color-text-2)",
                        boxShadow: "none",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // 删除脚本
                        Modal.confirm({
                          title: t("confirm_delete_script"),
                          content: t("confirm_delete_script_content", { name: i18nName(script) }),
                          onOk: () => {
                            scriptClient
                              .deletes([script.uuid])
                              .then(() => {
                                setScriptList((prev) => prev.filter((s) => s.uuid !== script.uuid));
                                handleDeleteEditor(script.uuid);
                                if (selectSciptButtonAndTab === script.uuid) {
                                  setSelectSciptButtonAndTab("");
                                }
                                Message.success(t("delete_success"));
                              })
                              .catch((err) => {
                                LoggerCore.logger(Logger.E(err)).debug("delete script error");
                                Message.error(`${t("delete_failed")}: ${err}`);
                              });
                          },
                        });
                      }}
                    />
                  </div>
                ))}
            </div>
          </Col>
        )}
        <Col span={hiddenScriptList ? 24 : 20} className="flex! flex-col h-full">
          <Tabs
            editable
            activeTab={activeTab}
            className="edit-tabs"
            type="card-gutter"
            style={{
              overflow: "inherit",
            }}
            onChange={(index: string) => {
              setEditors((prev) =>
                prev.map((editor, i) =>
                  `${i}` === index
                    ? {
                        ...editor,
                        active:
                          (setSelectSciptButtonAndTab(editor.script.uuid), // 需要用 microTask 推遲嗎？
                          true),
                      }
                    : {
                        ...editor,
                        active: false,
                      }
                )
              );
            }}
            onAddTab={() => {
              const template = pageUrlSearchParams.get("template") || "";
              emptyScript(template || "", hotKeys, "blank").then((e) => {
                setEditors((prev) => {
                  prev.forEach((item) => {
                    item.active = false;
                  });
                  setSelectSciptButtonAndTab(e.script.uuid);
                  return [...prev, e];
                });
              });
            }}
            onDeleteTab={(index: string) => {
              const i = parseInt(index, 10);
              const targetUuid = editors[i]?.script.uuid;
              if (targetUuid) {
                handleDeleteEditor(targetUuid, true);
              }
            }}
          >
            {editors.map((e, index) => (
              <TabPane
                destroyOnHide
                key={index!.toString()}
                title={
                  <Dropdown
                    trigger="contextMenu"
                    position="bl"
                    droplist={
                      <Menu
                        onClickMenuItem={(key) => {
                          setRightOperationTab({
                            ...rightOperationTab,
                            key,
                            uuid: e.script.uuid,
                            selectSciptButtonAndTab,
                          });
                        }}
                      >
                        <Menu.Item key="1">{t("close_current_tab")}</Menu.Item>
                        <Menu.Item key="2">{t("close_other_tabs")}</Menu.Item>
                        <Menu.Item key="3">{t("close_left_tabs")}</Menu.Item>
                        <Menu.Item key="4">{t("close_right_tabs")}</Menu.Item>
                      </Menu>
                    }
                  >
                    <span
                      style={{
                        color: e.isChanged
                          ? "rgb(var(--orange-5))"
                          : e.script.uuid === selectSciptButtonAndTab
                            ? "rgb(var(--green-7))"
                            : e.active
                              ? "rgb(var(--green-7))"
                              : "var(--color-text-1)",
                      }}
                    >
                      {e.script.name}
                    </span>
                  </Dropdown>
                }
              />
            ))}
          </Tabs>
          <div className="flex flex-grow flex-1">
            {editors.map((item) => {
              if (item.active) {
                document.title = `${i18nName(item.script)} - Script Editor`;
              }
              return (
                <div
                  className="w-full"
                  key={`fe_${item.script.uuid}`}
                  style={{
                    display: item.active ? "block" : "none",
                  }}
                >
                  <WarpEditor
                    className="script-code-editor"
                    key={`e_${item.script.uuid}`}
                    id={`e_${item.script.uuid}`}
                    script={item.script}
                    code={item.code}
                    hotKeys={item.hotKeys}
                    callbackEditor={(e) => {
                      setEditors((prev) =>
                        prev.map((v) =>
                          v.script.uuid === item.script.uuid
                            ? {
                                ...v,
                                editor:
                                  (v.active && setTimeout(() => e.focus(), 100), // 编辑器实例创建后立即聚焦一次
                                  e),
                              }
                            : v
                        )
                      );
                    }}
                    onChange={(code) => {
                      setEditors((prev) => {
                        const script = prev.find((v) => v.script.uuid === item.script.uuid);
                        if (!script) return prev;
                        const isChanged = !(script.code === code);
                        if (isChanged !== script.isChanged) {
                          script.isChanged = isChanged;
                          return [...prev];
                        }
                        return prev;
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </Col>
      </Row>
    </div>
  );
}

export default ScriptEditor;
