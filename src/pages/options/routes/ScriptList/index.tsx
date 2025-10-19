import { useEffect, useState } from "react";
import { Card } from "@arco-design/web-react";
import type { Script, UserConfig } from "@App/app/repo/scripts";
import { ScriptDAO } from "@App/app/repo/scripts";
import { useSearchParams } from "react-router-dom";
import UserConfigPanel from "@App/pages/components/UserConfigPanel";
import CloudScriptPlan from "@App/pages/components/CloudScriptPlan";
import ScriptListSidebar from "./Sidebar";
import ScriptCard from "./ScriptCard";
import { message } from "@App/pages/store/global";
import { ValueClient } from "@App/app/service/service_worker/client";
import ScriptTable from "./ScriptTabel";
import { useScriptSearch } from "./hooks";

function ScriptList() {
  const [userConfig, setUserConfig] = useState<{
    script: Script;
    userConfig: UserConfig;
    values: { [key: string]: any };
  }>();
  const [cloudScript, setCloudScript] = useState<Script>();
  const {
    loadingList,
    filterScriptList,
    scriptListSortOrder,
    updateScripts,
    filterItems,
    selectedFilters,
    setSelectedFilters,
    setSearchKeyword,
  } = useScriptSearch();

  const openUserConfig = useSearchParams()[0].get("userConfig") || "";
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => localStorage.getItem("script-list-sidebar") === "1");
  const [viewMode, setViewMode] = useState<"table" | "card">(() => {
    // 根据屏幕宽度选择默认视图模式
    const viewMode = localStorage.getItem("script-list-view-mode");
    if (viewMode === "table" || viewMode === "card") {
      return viewMode;
    }
    const width = window.screen.width;
    if (width < 1280) return "card";
    return "table";
  });

  // 设置列和判断是否打开用户配置
  useEffect(() => {
    if (openUserConfig) {
      const dao = new ScriptDAO();
      dao.get(openUserConfig).then((script) => {
        if (script && script.config) {
          new ValueClient(message).getScriptValue(script).then((values) => {
            setUserConfig({
              script,
              userConfig: script.config!,
              values: values,
            });
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card
      id="script-list"
      className="script-list"
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div className="flex flex-col">
        {/* 主要内容区域 */}
        <div className="flex flex-row relative">
          {/* 侧边栏 */}
          <ScriptListSidebar
            open={sidebarOpen}
            filterItems={filterItems}
            selectedFilters={selectedFilters}
            setSelectedFilters={setSelectedFilters}
          />

          {/* 主要表格/卡片区域 */}
          <div className="flex-1">
            {viewMode === "table" ? (
              <ScriptTable
                loadingList={loadingList}
                scriptList={filterScriptList}
                scriptListSortOrder={scriptListSortOrder}
                updateScripts={updateScripts}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                setViewMode={setViewMode}
                setUserConfig={setUserConfig}
                setCloudScript={setCloudScript}
                setSearchKeyword={setSearchKeyword}
              />
            ) : (
              <ScriptCard
                loadingList={loadingList}
                scriptList={filterScriptList}
                scriptListSortOrder={scriptListSortOrder}
                updateScripts={updateScripts}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                setViewMode={setViewMode}
                setUserConfig={setUserConfig}
                setCloudScript={setCloudScript}
                setSearchKeyword={setSearchKeyword}
              />
            )}
          </div>
        </div>

        {userConfig && (
          <UserConfigPanel script={userConfig.script} userConfig={userConfig.userConfig} values={userConfig.values} />
        )}
        <CloudScriptPlan
          script={cloudScript}
          onClose={() => {
            setCloudScript(undefined);
          }}
        />
      </div>
    </Card>
  );
}

export default ScriptList;
