import ScriptList from "@App/pages/options/routes/ScriptList";
import { Layout, Menu } from "@arco-design/web-react";
import {
  IconCode,
  IconSubscribe,
  IconFile,
  IconTool,
  IconSettings,
} from "@arco-design/web-react/icon";
import React, { useState } from "react";
import { HashRouter, Link, Routes, Route } from "react-router-dom";

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
  );
};

export default Sider;
