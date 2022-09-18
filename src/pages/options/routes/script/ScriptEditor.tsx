import { Script, ScriptDAO } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { editor, KeyCode, KeyMod } from "monaco-editor";
import {
  Button,
  Dropdown,
  Grid,
  Menu,
  Message,
  Tabs,
} from "@arco-design/web-react";
import TabPane from "@arco-design/web-react/es/Tabs/tab-pane";
import ScriptController from "@App/app/service/script/controller";
import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { v4 as uuidv4 } from "uuid";

const { Row } = Grid;
const { Col } = Grid;

type HotKey = {
  hotKey: number;
  action: (
    script: Script,
    index: number,
    codeEditor: editor.IStandaloneCodeEditor
  ) => void;
};

const Editor: React.FC<{
  id: string;
  index: number;
  script: Script;
  hotKeys: HotKey[];
}> = ({ id, script, index, hotKeys }) => {
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
        item.action(script, index, codeEditor.current!.editor);
      });
    });
    return () => {
      codeEditor.current?.editor.dispose();
    };
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
    hotKey: number;
    action: (
      script: Script,
      index: number,
      e: editor.IStandaloneCodeEditor
    ) => void;
  }[];
};

function ScriptEditor() {
  const scriptDAO = new ScriptDAO();
  const scriptCtrl = ScriptController.getInstance();
  const template = useSearchParams()[0].get("template");
  const [editors, setEditors] = useState<
    {
      script: Script;
      active: boolean;
      hotKeys: HotKey[];
    }[]
  >([]);

  const { id } = useParams();
  const menu: EditorMenu[] = [
    {
      title: "文件",
      items: [
        {
          title: "保存",
          hotKey: KeyMod.CtrlCmd | KeyCode.KeyS,
          action: (script, index, e) => {
            // 解析code生成新的script并更新
            scriptCtrl
              .prepareScriptByCode(
                e.getValue(),
                script.origin || "",
                script.uuid
              )
              .then((newScript) => {
                scriptCtrl.upsert(newScript).then(
                  () => {
                    if (newScript.id === 0) {
                      Message.success("新建成功,请注意后台脚本不会默认开启");
                    } else {
                      Message.success("保存成功");
                    }
                  },
                  (err) => {
                    Message.error(`保存失败: ${err}`);
                  }
                );
              })
              .catch((err) => {
                Message.error(`错误的脚本代码: ${err}`);
              });
          },
        },
      ],
    },
  ];

  // 根据菜单生产快捷键
  const hotKeys: HotKey[] = [];
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
    if (id) {
      scriptDAO.findById(parseInt(id, 10)).then((resp) => {
        if (!resp) {
          return;
        }
        editors.push({
          script: resp,
          active: true,
          hotKeys,
        });
        setEditors([...editors]);
      });
    } else {
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
          break;
      }
      scriptCtrl.prepareScriptByCode(code, "", uuidv4()).then((script) => {
        editors.push({
          script,
          active: true,
          hotKeys,
        });
        setEditors([...editors]);
      });
    }
    const beforeunload = () => {
      return true;
    };
    window.onbeforeunload = beforeunload;

    return () => {
      window.onbeforeunload = null;
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div
        className="h-6 bg-gray-1"
        style={{
          borderBottom: "1px solid #eee",
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
                  {item.items.map((menuItem, i) => (
                    <Button size="mini" key={`m_${i.toString()}`}>
                      {menuItem.title}
                    </Button>
                  ))}
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
      <Row className="flex flex-grow flex-1">
        <Col span={4}>
          <div
            className="flex flex-col"
            style={{
              backgroundColor: "var(--color-secondary)",
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
            <Button className="text-left" size="mini">
              啊啊啊
            </Button>
            <Button className="text-left" size="mini">
              啊啊啊
            </Button>
          </div>
        </Col>
        <Col span={20} className="flex! flex-col h-full">
          <Tabs
            editable
            type="card-gutter"
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
          >
            <TabPane destroyOnHide key="0" title="test1" />
            <TabPane destroyOnHide key="1" title="test2" />
          </Tabs>
          <div className="flex flex-grow flex-1">
            {editors.map((item, index) => {
              return (
                <div
                  className="w-full"
                  key={`e_${index.toString()}`}
                  style={{
                    display: item.active ? "block" : "none",
                  }}
                >
                  <Editor
                    id={`e_${index.toString()}`}
                    index={index}
                    script={item.script}
                    hotKeys={item.hotKeys}
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
