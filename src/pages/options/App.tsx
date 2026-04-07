import { HashRouter, Routes, Route, Outlet } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import ScriptList from "./routes/ScriptList";
import { t } from "@App/locales/locales";

function Layout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
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
          <Route path="subscribe" element={<PlaceholderPage title={t("subscribe")} />} />
          <Route path="logs" element={<PlaceholderPage title={t("logs")} />} />
          <Route path="tools" element={<PlaceholderPage title={t("tools")} />} />
          <Route path="settings" element={<PlaceholderPage title={t("settings")} />} />
          <Route path="script/editor/:uuid?" element={<PlaceholderPage title="Editor" />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
