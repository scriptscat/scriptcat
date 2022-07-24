import { Avatar, Layout, Menu, Typography } from "@arco-design/web-react";
import React, { useState } from "react";
import {
  IconCode,
  IconFile,
  IconSettings,
  IconSubscribe,
  IconTool,
} from "@arco-design/web-react/icon";
import { HashRouter, Link, Route, Routes } from "react-router-dom";
import ScriptList from "@App/pages/options/routes/ScriptList";

const MenuItem = Menu.Item;
let { hash } = window.location;
if (!hash.length) {
  hash = "/";
} else {
  hash = hash.substring(1);
}
const MainLayout: React.FC = () => {
  const [menuSelect, setMenuSelect] = useState(hash);

  return (
    <Layout>
      <Layout.Header
        style={{
          height: "50px",
          borderBottom: "1px solid #e8e8e8",
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
        <div>
          <Avatar size={32}>王</Avatar>
        </div>
      </Layout.Header>
      <Layout
        className="absolute top-50px bottom-0 !flex-row w-full"
        style={{
          boxShadow: "unset",
        }}
      >
        <HashRouter>
          <Layout.Sider className="h-full" collapsible breakpoint="xl">
            <Menu
              style={{ width: "100%", height: "100%" }}
              selectedKeys={[menuSelect]}
              selectable
              onClickMenuItem={(key) => {
                setMenuSelect(key);
              }}
            >
              <Link to="/">
                <MenuItem key="/">
                  <IconCode /> 脚本列表
                </MenuItem>
              </Link>
              <Link to="/subscribe">
                <MenuItem key="/subscribe">
                  <IconSubscribe /> 订阅列表
                </MenuItem>
              </Link>
              <Link to="/logger">
                <MenuItem key="/logger">
                  <IconFile /> 运行日志
                </MenuItem>
              </Link>
              <Link to="/tools">
                <MenuItem key="/tools">
                  <IconTool /> 系统工具
                </MenuItem>
              </Link>
              <Link to="/setting">
                <MenuItem key="/setting">
                  <IconSettings /> 系统设置
                </MenuItem>
              </Link>
            </Menu>
          </Layout.Sider>
          <Layout.Content
            className="p-4"
            style={{
              borderLeft: "1px solid #e8e8e8",
            }}
          >
            <Routes>
              <Route index element={<ScriptList />} />
            </Routes>
          </Layout.Content>
        </HashRouter>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
