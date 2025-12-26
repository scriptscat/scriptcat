import Logger from "@App/pages/options/routes/Logger";
import ScriptEditor from "@App/pages/options/routes/script/ScriptEditor";
import ScriptList from "@App/pages/options/routes/ScriptList";
import Setting from "@App/pages/options/routes/Setting";
import SubscribeList from "@App/pages/options/routes/SubscribeList";
import Tools from "@App/pages/options/routes/Tools";
import { Layout, Drawer, Button } from "@arco-design/web-react";
import { IconMenu } from "@arco-design/web-react/icon";
import React, { useRef, useState, useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import SiderGuide from "./SiderGuide";
import SiderMenu from "./SiderMenu";

let { hash } = window.location;
if (!hash.length) {
  hash = "/";
} else {
  hash = hash.substring(1);
}

const Sider: React.FC = () => {
  const [menuSelect, setMenuSelect] = useState(hash);
  const [collapsed, setCollapsed] = useState(localStorage.collapsed === "true");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const guideRef = useRef<{ open: () => void }>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleMenuClick = (key: string) => {
    setMenuSelect(key);
    if (isMobile) {
      setDrawerVisible(false);
    }
  };

  return (
    <HashRouter>
      <SiderGuide ref={guideRef} />
      {isMobile ? (
        <>
          <Drawer
            width={240}
            visible={drawerVisible}
            placement="left"
            onOk={() => setDrawerVisible(false)}
            onCancel={() => setDrawerVisible(false)}
            footer={null}
            title={null}
            closable={false}
          >
            <SiderMenu menuSelect={menuSelect} handleMenuClick={handleMenuClick} guideRef={guideRef} mode="mobile" />
          </Drawer>
        </>
      ) : (
        <Layout.Sider className="h-full" collapsed={collapsed} width={170}>
          <SiderMenu
            menuSelect={menuSelect}
            handleMenuClick={handleMenuClick}
            guideRef={guideRef}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            mode="desktop"
          />
        </Layout.Sider>
      )}

      <Layout.Content
        style={{
          borderLeft: isMobile ? "none" : "1px solid var(--color-bg-5)",
          overflow: "hidden",
          padding: isMobile ? 5 : 10,
          height: "100%",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {isMobile && (
          <Button
            className="mobile-menu-btn"
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              zIndex: 100,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            }}
            shape="circle"
            type="primary"
            icon={<IconMenu />}
            onClick={() => setDrawerVisible(true)}
          />
        )}
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
