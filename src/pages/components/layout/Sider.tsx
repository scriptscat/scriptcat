import Logger from "@App/pages/options/routes/Logger";
import ScriptEditor from "@App/pages/options/routes/script/ScriptEditor";
import ScriptList from "@App/pages/options/routes/ScriptList";
import Setting from "@App/pages/options/routes/Setting";
import SubscribeList from "@App/pages/options/routes/SubscribeList";
import Tools from "@App/pages/options/routes/Tools";
import { Layout, Menu } from "@arco-design/web-react";
import {
  IconCode,
  IconFile,
  IconSettings,
  IconSubscribe,
  IconTool,
} from "@arco-design/web-react/icon";
import React, { useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const [collapsed, setCollapsed] = useState(localStorage.collapsed === "true");
  const { t } = useTranslation();

  return (
    <HashRouter>
      <Layout.Sider
        className="h-full"
        collapsible
        collapsed={collapsed}
        width={170}
        onCollapse={(c) => {
          localStorage.collapsed = c;
          setCollapsed(c);
        }}
      >
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
              <IconCode /> {t("installed_scripts")}
            </MenuItem>
          </CustomLink>
          <CustomLink to="/subscribe">
            <MenuItem key="/subscribe">
              <IconSubscribe /> {t("subscribe")}
            </MenuItem>
          </CustomLink>
          <CustomLink to="/logger">
            <MenuItem key="/logger">
              <IconFile /> {t("logs")}
            </MenuItem>
          </CustomLink>
          <CustomLink to="/tools">
            <MenuItem key="/tools">
              <IconTool /> {t("tools")}
            </MenuItem>
          </CustomLink>
          <CustomLink to="/setting">
            <MenuItem key="/setting">
              <IconSettings /> {t("settings")}
            </MenuItem>
          </CustomLink>
        </Menu>
      </Layout.Sider>
      <Layout.Content
        style={{
          borderLeft: "1px solid var(--color-bg-5)",
          overflow: "hidden",
          padding: 10,
          height: "100%",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        <Routes>
          <Route index element={<ScriptList />} />
          <Route path="/script/editor">
            <Route path=":id" element={<ScriptEditor />} />
            <Route path="" element={<ScriptEditor />} />
          </Route>
          <Route path="/subscribe" element={<SubscribeList />} />
          <Route path="/logger" element={<Logger />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/setting" element={<Setting />} />
        </Routes>
      </Layout.Content>
    </HashRouter>
  );
};

export default Sider;
