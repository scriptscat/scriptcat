import { HashRouter, Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import ScriptList from "./routes/ScriptList";
import SubscribeList from "./routes/SubscribeList";
import ScriptEditor from "./routes/ScriptEditor";
import Logger from "./routes/Logger";
import Setting from "./routes/Setting";
import Tools from "./routes/Tools";
import { t } from "@App/locales/locales";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import MobileHeader from "./layout/MobileHeader";
import BottomTabBar from "./layout/BottomTabBar";

export function Layout() {
  const isMobile = useIsMobile();
  // 编辑器在移动端为全屏布局，自带顶栏/底栏，不显示全局 MobileHeader/BottomTabBar
  const isFullscreen = useLocation().pathname.startsWith("/script/editor");
  if (isMobile) {
    if (isFullscreen) {
      return (
        <div className="flex flex-col h-screen bg-background text-foreground">
          <Outlet />
        </div>
      );
    }
    return (
      <div className="flex flex-col h-screen bg-background text-foreground">
        <MobileHeader />
        <main className="flex-1 min-w-0 overflow-auto scrollbar-custom">
          <Outlet />
        </main>
        <BottomTabBar />
      </div>
    );
  }
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto scrollbar-custom">
        <Outlet />
      </main>
    </div>
  );
}

// 占位页面（后续逐步实现）
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <span className="text-lg">{title}</span>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ScriptList />} />
          <Route path="subscribe" element={<SubscribeList />} />
          <Route path="agent">
            <Route index element={<Navigate to="/agent/chat" replace />} />
            <Route path="chat" element={<PlaceholderPage title={t("agent:chat")} />} />
            <Route path="provider" element={<PlaceholderPage title={t("agent:provider")} />} />
            <Route path="skills" element={<PlaceholderPage title={t("agent:skills")} />} />
            <Route path="mcp" element={<PlaceholderPage title={t("agent:mcp")} />} />
            <Route path="tasks" element={<PlaceholderPage title={t("agent:tasks")} />} />
            <Route path="opfs" element={<PlaceholderPage title={t("agent:opfs")} />} />
            <Route path="settings" element={<PlaceholderPage title={t("agent:settings")} />} />
          </Route>
          <Route path="logs" element={<Logger />} />
          <Route path="tools" element={<Tools />} />
          <Route path="settings" element={<Setting />} />
          <Route path="script/editor/:uuid?" element={<ScriptEditor />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
