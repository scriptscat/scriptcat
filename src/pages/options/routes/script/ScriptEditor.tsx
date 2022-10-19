import { Script, ScriptDAO } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { editor, KeyCode, KeyMod } from "monaco-editor";
import {
  Button,
  Dropdown,
  Grid,
  Menu,
  Message,
  Tabs,
  Tooltip,
} from "@arco-design/web-react";
import TabPane from "@arco-design/web-react/es/Tabs/tab-pane";
import ScriptController from "@App/app/service/script/controller";
import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { v4 as uuidv4 } from "uuid";
import "./index.css";
import IoC from "@App/app/ioc";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { prepareScriptByCode } from "@App/utils/script";
import RuntimeController from "@App/runtime/content/runtime";

const { Row } = Grid;
const { Col } = Grid;

type HotKey = {
  hotKey: number;
  action: (script: Script, codeEditor: editor.IStandaloneCodeEditor) => void;
};

const Editor: React.FC<{
  id: string;
  script: Script;
  hotKeys: HotKey[];
  callbackEditor: (e: editor.IStandaloneCodeEditor) => void;
  onChange: (code: string) => void;
}> = ({ id, script, hotKeys, callbackEditor, onChange }) => {
  const [init, setInit] = useState(false);
  const codeEditor = useRef<{ editor: editor.IStandaloneCodeEditor }>(null);

  useEffect(() => {
    if (!codeEditor.current || !codeEditor.current.editor) {
      setTimeout(() => {
        setInit(true);
      }, 200);
      return () => {};
    }
    hotKeys.forEach((item) => {
      codeEditor.current?.editor.addCommand(item.hotKey, () => {
        item.action(script, codeEditor.current!.editor);
      });
    });
    codeEditor.current.editor.onKeyUp(() => {
      onChange(codeEditor.current?.editor.getValue() || "");
    });
    callbackEditor(codeEditor.current.editor);
    return () => {};
  }, [init]);

  return (
    <CodeEditor
      id={id}
      ref={codeEditor}
      code={script.code}
      diffCode=""
      editable
    />
  );
};

type EditorMenu = {
  title: string;
  items: {
    title: string;
    tooltip?: string;
    hotKey: number;
    action: (script: Script, e: editor.IStandaloneCodeEditor) => void;
  }[];
};

const emptyScript = async (template: string, hotKeys: any, target: string) => {
  let code = "";
  switch (template) {
    case "background":
      code = backgroundTpl;
      break;
    case "crontab":
      code = crontabTpl;
      break;
    default:
      code = normalTpl;
      if (target === "initial") {
        const url = await new Promise<string>((resolve) => {
          chrome.storage.local.get(["activeTabUrl"], (result) => {
            chrome.storage.local.remove(["activeTabUrl"]);
            resolve(result.activeTabUrl.url);
          });
        });
        code = code.replace("{{match}}", url);
      }
      break;
  }
  const script = await prepareScriptByCode(code, "", uuidv4());

  return Promise.resolve({
    script,
    code: script.code,
    active: true,
    hotKeys,
    isChanged: false,
  });
};

function ScriptEditor() {
  const scriptDAO = new ScriptDAO();
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  const runtimeCtrl = IoC.instance(RuntimeController) as RuntimeController;
  const template = useSearchParams()[0].get("template") || "";
  const target = useSearchParams()[0].get("target") || "";
  const navigate = useNavigate();
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

  const { id } = useParams();
  const save = (
    script: Script,
    e: editor.IStandaloneCodeEditor
  ): Promise<Script> => {
    // 解析code生成新的script并更新
    return new Promise((resolve) => {
      prepareScriptByCode(e.getValue(), script.origin || "", script.uuid)
        .then((newScript) => {
          scriptCtrl.upsert(newScript).then(
            () => {
              if (newScript.id === 0) {
                Message.success("新建成功,请注意后台脚本不会默认开启");
              } else {
                Message.success("保存成功");
              }
              setEditors((prev) => {
                for (let i = 0; i < prev.length; i += 1) {
                  if (prev[i].script.uuid === newScript.uuid) {
                    prev[i].code = newScript.code;
                    prev[i].isChanged = false;
                    break;
                  }
                }
                resolve(newScript);
                return [...prev];
              });
            },
            (err) => {
              Message.error(`保存失败: ${err}`);
            }
          );
        })
        .catch((err) => {
          Message.error(`错误的脚本代码: ${err}`);
        });
    });
  };
  const menu: EditorMenu[] = [
    {
      title: "文件",
      items: [
        {
          title: "保存",
          hotKey: KeyMod.CtrlCmd | KeyCode.KeyS,
          action: save,
        },
      ],
    },
    {
      title: "运行",
      items: [
        {
          title: "调试",
          hotKey: KeyMod.CtrlCmd | KeyCode.F5,
          tooltip:
            "只有后台脚本/定时脚本才能调试, 且调试模式下不对进行权限校验(例如@connect)",
          action: async (script, e) => {
            // 保存更新代码之后再调试
            const newScript = await save(script, e);
            Message.loading({
              id: "debug_script",
              content: "正在准备脚本资源...",
              duration: 3000,
            });
            runtimeCtrl
              .debugScript(newScript)
              .then(() => {
                Message.success({
                  id: "debug_script",
                  content: "构建成功, 可以打开开发者工具在控制台中查看输出",
                  duration: 3000,
                });
              })
              .catch((err) => {
                LoggerCore.getLogger(Logger.E(err)).debug("debug script error");
                Message.error({
                  id: "debug_script",
                  content: `构建失败: ${err}`,
                  duration: 3000,
                });
              });
          },
        },
      ],
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
    item.items.forEach((menuItem) => {
      if (menuItem.hotKey) {
        hotKeys.push({
          hotKey: menuItem.hotKey,
          action: menuItem.action,
        });
      }
    });
  });
  useEffect(() => {
    scriptDAO.table
      .orderBy("sort")
      .toArray()
      .then((scripts) => {
        setScriptList(scripts);
        // 如果有id则打开对应的脚本
        if (id) {
          const iId = parseInt(id, 10);
          for (let i = 0; i < scripts.length; i += 1) {
            if (scripts[i].id === iId) {
              editors.push({
                script: scripts[i],
                code: scripts[i].code,
                active: true,
                hotKeys,
                isChanged: false,
              });
              setEditors([...editors]);
              break;
            }
          }
        }
      });
    if (!id) {
      emptyScript(template || "", hotKeys, target).then((e) => {
        editors.push(e);
        setEditors([...editors]);
      });
    }
  }, []);

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
    }

    return () => {
      window.onbeforeunload = null;
    };
  }, [editors]);

  return (
    <div className="h-full flex flex-col">
      <div
        className="h-6"
        style={{
          borderBottom: "1px solid var(--color-neutral-3)",
          background: "var(--color-secondary)",
        }}
      >
        <div className="flex flex-row">
          {menu.map((item, index) => (
            <Dropdown
              key={`d_${index.toString()}`}
              droplist={
                <Menu
                  style={{
                    backgroundColor: "var(--color-bg-2)",
                    padding: "0",
                    margin: "0",
                    borderRadius: "0",
                  }}
                >
                  {item.items.map((menuItem, i) => {
                    const btn = (
                      <Button
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
                        {menuItem.title}
                      </Button>
                    );
                    if (menuItem.tooltip) {
                      return (
                        <Menu.Item
                          key={`m_${i.toString()}`}
                          style={{
                            height: "unset",
                            padding: "0",
                            lineHeight: "unset",
                          }}
                        >
                          <Tooltip
                            key={`m${i.toString()}`}
                            position="right"
                            content={menuItem.tooltip}
                          >
                            {btn}
                          </Tooltip>
                        </Menu.Item>
                      );
                    }
                    return (
                      <Menu.Item
                        key={`m_${i.toString()}`}
                        style={{
                          height: "unset",
                          padding: "0",
                          lineHeight: "unset",
                        }}
                      >
                        {btn}
                      </Menu.Item>
                    );
                  })}
                </Menu>
              }
              trigger="click"
              position="bl"
            >
              <Button size="mini">{item.title}</Button>
            </Dropdown>
          ))}
        </div>
      </div>
      <Row
        className="flex flex-grow flex-1"
        style={{
          overflow: "hidden",
        }}
      >
        <Col
          span={4}
          className="h-full"
          style={{
            overflow: "scroll",
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
              disabled
              style={{
                color: "var(--color-text-2)",
              }}
            >
              已安装脚本
            </Button>
            {scriptList.map((script, index) => (
              <Button
                key={`s_${index.toString()}`}
                size="mini"
                className="text-left"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                onClick={() => {
                  // 如果已经打开则激活
                  let flag = false;
                  for (let i = 0; i < editors.length; i += 1) {
                    if (editors[i].script.id === script.id) {
                      editors[i].active = true;
                      flag = true;
                    } else {
                      editors[i].active = false;
                    }
                  }
                  if (!flag) {
                    // 如果没有打开则打开
                    editors.push({
                      script,
                      code: script.code,
                      active: true,
                      hotKeys,
                      isChanged: false,
                    });
                  }
                  setEditors([...editors]);
                }}
              >
                {script.name}
              </Button>
            ))}
          </div>
        </Col>
        <Col span={20} className="flex! flex-col h-full">
          <Tabs
            editable
            activeTab={activeTab}
            className="edit-tabs"
            type="card-gutter"
            style={{
              overflow: "inherit",
            }}
            onChange={(index: string) => {
              editors.forEach((_, i) => {
                if (i.toString() === index) {
                  editors[i].active = true;
                } else {
                  editors[i].active = false;
                }
                setEditors([...editors]);
              });
            }}
            onAddTab={() => {
              emptyScript(template || "", hotKeys).then((e) => {
                setEditors((prev) => {
                  prev.forEach((item) => {
                    item.active = false;
                  });
                  prev.push(e);
                  return [...prev];
                });
              });
            }}
            onDeleteTab={(index: string) => {
              // 处理删除
              setEditors((prev) => {
                const i = parseInt(index, 10);
                if (prev[i].isChanged) {
                  // eslint-disable-next-line no-restricted-globals, no-alert
                  if (!confirm("脚本已修改, 关闭后会丢失修改, 是否继续?")) {
                    return prev;
                  }
                }
                if (prev.length === 1) {
                  // 如果是id打开的回退到列表
                  if (id) {
                    navigate("/");
                    return prev;
                  }
                  // 如果没有打开的了, 则打开一个空白的
                  emptyScript(template || "", hotKeys).then((e) => {
                    setEditors([e]);
                  });
                  return prev;
                }
                if (prev[i].active) {
                  // 如果关闭的是当前激活的, 则激活下一个
                  if (i === prev.length - 1) {
                    prev[i - 1].active = true;
                  } else {
                    prev[i + 1].active = true;
                  }
                }
                prev.splice(i, 1);
                return [...prev];
              });
            }}
          >
            {editors.map((e, index) => (
              <TabPane
                destroyOnHide
                key={index!.toString()}
                title={
                  <span
                    style={{
                      // eslint-disable-next-line no-nested-ternary
                      color: e.isChanged
                        ? "rgb(var(--orange-5))"
                        : e.script.id === 0
                        ? "rgb(var(--green-7))"
                        : "var(--color-text-1)",
                    }}
                  >
                    {e.script.name}
                  </span>
                }
              />
            ))}
          </Tabs>
          <div className="flex flex-grow flex-1">
            {editors.map((item, index) => {
              // 先这样吧
              setTimeout(() => {
                if (item.active && item.editor) {
                  item.editor.focus();
                }
              }, 100);
              return (
                <div
                  className="w-full"
                  key={`fe_${item.script.uuid}`}
                  style={{
                    display: item.active ? "block" : "none",
                  }}
                >
                  <Editor
                    id={`e_${item.script.uuid}`}
                    script={item.script}
                    hotKeys={item.hotKeys}
                    callbackEditor={(e) => {
                      setEditors((prev) => {
                        prev[index].editor = e;
                        return [...prev];
                      });
                    }}
                    onChange={(code) => {
                      const isChanged = !(item.code === code);
                      if (isChanged !== item.isChanged) {
                        setEditors((prev) => {
                          prev[index].isChanged = isChanged;
                          return [...prev];
                        });
                      }
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
