import {
  Avatar,
  Button,
  Dropdown,
  Layout,
  Menu,
  Space,
  Typography,
} from "@arco-design/web-react";
import {
  IconDesktop,
  IconMoonFill,
  IconSunFill,
} from "@arco-design/web-react/icon";
import React, { ReactNode, useState } from "react";
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
}> = ({ children, className }) => {
  const [lightMode, setLightMode] = useState(localStorage.lightMode || "auto");
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
        <Space size="large">
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
            trigger="click"
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
          <Avatar size={32}>王</Avatar>
        </Space>
      </Layout.Header>
      <Layout className={`absolute top-50px bottom-0 w-full ${className}`}>
        {children}
      </Layout>
    </Layout>
  );
};

export default MainLayout;
