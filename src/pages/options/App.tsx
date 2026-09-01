import { createHashRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import ScriptList from "./routes/ScriptList";
import SubscribeList from "./routes/SubscribeList";
import ScriptEditor from "./routes/ScriptEditor";
import Logger from "./routes/Logger";
import Setting from "./routes/Setting";
import Tools from "./routes/Tools";
import NetworkRules from "./routes/Tools/NetworkRules";
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
import { OnboardingProvider } from "./onboarding/OnboardingProvider";
import { OnboardingHost } from "./onboarding/OnboardingHost";
import { EnableAgent } from "@App/app/const";

export function Layout() {
  const isMobile = useIsMobile();
  // 编辑器在移动端为全屏布局，自带顶栏/底栏，不显示全局 MobileHeader/BottomTabBar
  const isFullscreen = useLocation().pathname.startsWith("/script/editor");
  // 全窗拖拽安装:拖入 .js 脚本/订阅、.zip Skill 包即打开安装页(桌面)
  const { isDragActive } = useScriptDropzone(handleImportFiles);
  if (isMobile) {
    if (isFullscreen) {
      return (
        <div className="flex flex-col h-dvh bg-background text-foreground">
          <Outlet />
        </div>
      );
    }
    return (
      <div className="flex flex-col h-dvh bg-background text-foreground">
        <MobileHeader />
        <main className="flex-1 min-w-0 overflow-auto scrollbar-custom">
          <Outlet />
        </main>
        <BottomTabBar />
        <OnboardingHost />
      </div>
    );
  }
  return (
    <>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto scrollbar-custom">
          <Outlet />
        </main>
      </div>
      <DropOverlay active={isDragActive} />
      <OnboardingHost />
    </>
  );
}

export default function App() {
  return <RouterProvider router={router} />;
}

const router = createHashRouter([
  {
    element: (
      <OnboardingProvider>
        <Layout />
      </OnboardingProvider>
    ),
    children: [
      { index: true, element: <ScriptList /> },
      { path: "subscribe", element: <SubscribeList /> },
      ...(EnableAgent
        ? [
            {
              path: "agent",
              children: [
                { index: true, element: <Navigate to="/agent/chat" replace /> },
                { path: "chat", element: <AgentChat /> },
                { path: "provider", element: <AgentProvider /> },
                { path: "skills", element: <AgentSkills /> },
                { path: "mcp", element: <AgentMcp /> },
                { path: "tasks", element: <AgentTasks /> },
                { path: "opfs", element: <AgentOPFS /> },
                { path: "settings", element: <AgentSettings /> },
              ],
            },
          ]
        : []),
      { path: "logs", element: <Logger /> },
      { path: "logger", element: <Navigate to="/logs" replace /> },
      { path: "tools", element: <Tools /> },
      { path: "tools/network-rules", element: <NetworkRules /> },
      { path: "settings", element: <Setting /> },
      { path: "setting", element: <Navigate to="/settings" replace /> },
      { path: "script/editor/:uuid?", element: <ScriptEditor /> },
    ],
  },
]);
