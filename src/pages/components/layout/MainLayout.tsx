import IoC from "@App/app/ioc";
import ScriptController from "@App/app/service/script/controller";
import {
  Button,
  Dropdown,
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
  IconGithub,
  IconLink,
  IconMoonFill,
  IconSunFill,
} from "@arco-design/web-react/icon";
import React, { ReactNode, useRef, useState } from "react";
import { RiFileCodeLine, RiTerminalBoxLine, RiTimerLine } from "react-icons/ri";
import "./index.css";

export function switchLight(mode: string) {
  if (mode === "auto") {
    const darkThemeMq = window.matchMedia("(prefers-color-scheme: dark)");
    const isMatch = (match: boolean) => {
      if (match) {
        document.body.setAttribute("arco-theme", "dark");
      } else {
        document.body.removeAttribute("arco-theme");
      }
    };
    darkThemeMq.addEventListener("change", (e) => {
      isMatch(e.matches);
    });
    isMatch(darkThemeMq.matches);
  } else {
    document.body.setAttribute("arco-theme", mode);
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
  switchLight(lightMode);
  return (
    <Layout>
      <Layout.Header
        style={{
          height: "50px",
          borderBottom: "1px solid var(--color-neutral-3)",
        }}
        className="flex items-center justify-between p-x-4"
      >
        <Modal
          title="链接导入"
          visible={importVisible}
          onOk={async () => {
            const scriptCtl = IoC.instance(
              ScriptController
            ) as ScriptController;
            try {
              await scriptCtl.importByUrl(importRef.current!.dom.value);
            } catch (e) {
              Message.error(`链接导入失败: ${e}`);
            }
            setImportVisible(false);
          }}
          onCancel={() => {
            setImportVisible(false);
          }}
        >
          <Input
            ref={importRef}
            defaultValue="https://scriptcat.org/scripts/code/336/%F0%9F%90%A4%E3%80%90%E8%B6%85%E6%98%9F%E7%BD%91%E8%AF%BE%E5%B0%8F%E5%8A%A9%E6%89%8B%E3%80%91%E3%80%90%E6%94%AF%E6%8C%81%E5%9B%BE%E7%89%87%E9%A2%98%E3%80%91%E8%A7%86%E9%A2%91-%E7%AB%A0%E8%8A%82%E6%B5%8B%E8%AF%95%7C%E8%87%AA%E5%8A%A8%E6%8C%82%E6%9C%BA%7C%E5%8F%AF%E5%A4%9A%E5%BC%80%E4%B8%8D%E5%8D%A0%E7%BD%91%E9%80%9F%7C%E9%98%B2%E6%B8%85%E8%BF%9B%E5%BA%A6%E3%80%90%E7%94%A8%E8%BF%87%E9%83%BD%E8%AF%B4%E5%A5%BD%E3%80%91.user.js"
          />
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
                <Menu>
                  <Menu.Item key="/script/editor">
                    <a href="#/script/editor">
                      <Space>
                        <RiFileCodeLine /> 添加普通脚本
                      </Space>
                    </a>
                  </Menu.Item>
                  <Menu.Item key="background">
                    <a href="#/script/editor?template=background">
                      <RiTerminalBoxLine /> 添加后台脚本
                    </a>
                  </Menu.Item>
                  <Menu.Item key="crontab">
                    <a href="#/script/editor?template=crontab">
                      <RiTimerLine /> 添加定时脚本
                    </a>
                  </Menu.Item>
                  <Menu.Item
                    key="link"
                    onClick={() => {
                      setImportVisible(true);
                    }}
                  >
                    <IconLink /> 链接导入
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
                新建脚本 <IconDown />
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
                  <IconDesktop /> 跟随系统
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
          <Button
            type="text"
            size="small"
            icon={<IconGithub />}
            iconOnly
            style={{
              color: "var(--color-text-1)",
            }}
            className="!text-size-lg"
            href="https://github.com/scriptscat/scriptcat"
            target="_blank"
          />
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
  );
};

export default MainLayout;
