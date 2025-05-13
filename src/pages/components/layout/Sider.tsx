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
  IconGithub,
  IconLeft,
  IconLink,
  IconQuestion,
  IconRight,
  IconSettings,
  IconSubscribe,
  IconTool,
} from "@arco-design/web-react/icon";
import React, { useRef, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RiFileCodeLine, RiGuideLine, RiLinkM } from "react-icons/ri";
import SiderGuide from "./SiderGuide";
import CustomLink from "../CustomLink";

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
  const guideRef = useRef<{ open: () => void }>(null);

  return (
    <HashRouter>
      <SiderGuide ref={guideRef} />
      <Layout.Sider className="h-full" collapsed={collapsed} width={170}>
        <div className="flex flex-col justify-between h-full">
          <Menu
            style={{ width: "100%" }}
            selectedKeys={[menuSelect]}
            selectable
            onClickMenuItem={(key) => {
              setMenuSelect(key);
            }}
          >
            <CustomLink to="/">
              <MenuItem key="/" className="menu-script">
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
            <CustomLink to="/tools" className="menu-tools">
              <MenuItem key="/tools">
                <IconTool /> {t("tools")}
              </MenuItem>
            </CustomLink>
            <CustomLink to="/setting" className="menu-setting">
              <MenuItem key="/setting">
                <IconSettings /> {t("settings")}
              </MenuItem>
            </CustomLink>
          </Menu>
          <Menu
            style={{ width: "100%", borderTop: "1px solid var(--color-bg-5)" }}
            selectedKeys={[]}
            selectable
            onClickMenuItem={(key) => {
              setMenuSelect(key);
            }}
            mode="pop"
          >
            <Menu.SubMenu
              key="/help"
              title={
                <>
                  <IconQuestion /> {t("helpcenter")}
                </>
              }
              triggerProps={{
                trigger: "hover",
              }}
            >
              <Menu.SubMenu
                key="/external_links"
                title={
                  <>
                    <RiLinkM /> {t("external_links")}
                  </>
                }
              >
                <Menu.Item key="scriptcat/docs/dev/">
                  <a
                    href="https://docs.scriptcat.org/docs/dev/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <RiFileCodeLine /> {t("api_docs")}
                  </a>
                </Menu.Item>
                <Menu.Item key="scriptcat/docs/learn/">
                  <a
                    href="https://learn.scriptcat.org/docs/%E7%AE%80%E4%BB%8B/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <RiFileCodeLine /> {t("development_guide")}
                  </a>
                </Menu.Item>
                <Menu.Item key="scriptcat/userscript">
                  <a
                    href="https://scriptcat.org/search"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconLink /> {t("script_gallery")}
                  </a>
                </Menu.Item>
                <Menu.Item key="tampermonkey/bbs">
                  <a
                    href="https://bbs.tampermonkey.net.cn/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconLink /> {t("community_forum")}
                  </a>
                </Menu.Item>
                <Menu.Item key="GitHub">
                  <a
                    href="https://github.com/scriptscat/scriptcat"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconGithub /> GitHub
                  </a>
                </Menu.Item>
              </Menu.SubMenu>
              <Menu.Item
                key="/guide"
                onClick={() => {
                  guideRef.current?.open();
                }}
              >
                <RiGuideLine /> {t("guide")}
              </Menu.Item>
              <Menu.Item key="scriptcat/docs/use/">
                <a
                  href="https://docs.scriptcat.org/docs/use/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <RiFileCodeLine /> {t("user_guide")}
                </a>
              </Menu.Item>
            </Menu.SubMenu>
            <MenuItem
              key="/collapsible"
              onClick={() => {
                localStorage.collapsed = !collapsed;
                setCollapsed(!collapsed);
              }}
            >
              {collapsed ? <IconRight /> : <IconLeft />} {t("collapsible")}
            </MenuItem>
          </Menu>
        </div>
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
            <Route path=":uuid" element={<ScriptEditor />} />
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
