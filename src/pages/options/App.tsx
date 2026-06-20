import { HashRouter, Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import ScriptList from "./routes/ScriptList";
import SubscribeList from "./routes/SubscribeList";
import ScriptEditor from "./routes/ScriptEditor";
import Logger from "./routes/Logger";
import Setting from "./routes/Setting";
import Tools from "./routes/Tools";
import AgentChat from "./routes/Agent/Chat";
import AgentSkills from "./routes/Agent/Skills";
import AgentProvider from "./routes/Agent/Provider";
import AgentMcp from "./routes/Agent/Mcp";
import AgentTasks from "./routes/Agent/Tasks";
import AgentOPFS from "./routes/Agent/OPFS";
import AgentSettings from "./routes/Agent/Settings";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import MobileHeader from "./layout/MobileHeader";
import BottomTabBar from "./layout/BottomTabBar";
import { useScriptDropzone } from "./layout/useScriptDropzone";
import { DropOverlay } from "./layout/DropOverlay";
import { handleImportFiles } from "./routes/ScriptList/importHandler";

export function Layout() {
  const isMobile = useIsMobile();
  // 编辑器在移动端为全屏布局，自带顶栏/底栏，不显示全局 MobileHeader/BottomTabBar
  const isFullscreen = useLocation().pathname.startsWith("/script/editor");
  // 全窗拖拽安装:拖入 .js 脚本/订阅、.zip Skill 包即打开安装页(桌面)
  const { isDragActive } = useScriptDropzone(handleImportFiles);
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
    <>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto scrollbar-custom">
          <Outlet />
        </main>
      </div>
      <DropOverlay active={isDragActive} />
    </>
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
            <Route path="chat" element={<AgentChat />} />
            <Route path="provider" element={<AgentProvider />} />
            <Route path="skills" element={<AgentSkills />} />
            <Route path="mcp" element={<AgentMcp />} />
            <Route path="tasks" element={<AgentTasks />} />
            <Route path="opfs" element={<AgentOPFS />} />
            <Route path="settings" element={<AgentSettings />} />
          </Route>
          <Route path="logs" element={<Logger />} />
          <Route path="logger" element={<Navigate to="/logs" replace />} />
          <Route path="tools" element={<Tools />} />
          <Route path="settings" element={<Setting />} />
          <Route path="setting" element={<Navigate to="/settings" replace />} />
          <Route path="script/editor/:uuid?" element={<ScriptEditor />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
