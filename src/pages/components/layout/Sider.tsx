import ScriptEditor from "@App/pages/options/routes/script/ScriptEditor";
import ScriptList from "@App/pages/options/routes/ScriptList";
import Subscribe from "@App/pages/options/routes/Subscribe";
import { Layout, Menu } from "@arco-design/web-react";
import {
  IconCode,
  IconFile,
  IconSettings,
  IconSubscribe,
  IconTool,
} from "@arco-design/web-react/icon";
import React, { useState } from "react";
import { HashRouter, Link, Route, Routes } from "react-router-dom";
import CustomLink from "..";

const MenuItem = Menu.Item;
let { hash } = window.location;
if (!hash.length) {
  hash = "/";
} else {
  hash = hash.substring(1);
}

const Sider: React.FC = () => {
  const [menuSelect, setMenuSelect] = useState(hash);

  return (
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
          <CustomLink to="/">
            <MenuItem key="/">
              <IconCode /> 已安装脚本
            </MenuItem>
          </CustomLink>
          <CustomLink to="/subscribe">
            <MenuItem key="/subscribe">
              <IconSubscribe /> 订阅
            </MenuItem>
          </CustomLink>
          <CustomLink to="/logger">
            <MenuItem key="/logger">
              <IconFile /> 日志
            </MenuItem>
          </CustomLink>
          <CustomLink to="/tools">
            <MenuItem key="/tools">
              <IconTool /> 工具
            </MenuItem>
          </CustomLink>
          <CustomLink to="/setting">
            <MenuItem key="/setting">
              <IconSettings /> 设置
            </MenuItem>
          </CustomLink>
        </Menu>
      </Layout.Sider>
      <Layout.Content
        style={{
          borderLeft: "1px solid var(--color-bg-5)",
          overflowY: "scroll",
        }}
      >
        <Routes>
          <Route index element={<ScriptList />} />
          <Route path="/script/editor">
            <Route path=":id" element={<ScriptEditor />} />
            <Route path="" element={<ScriptEditor />} />
          </Route>
          <Route path="/subscribe" element={<Subscribe />} />
        </Routes>
      </Layout.Content>
    </HashRouter>
  );
};

export default Sider;
