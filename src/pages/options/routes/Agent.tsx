import { Route, Routes } from "react-router-dom";
import AgentProvider from "./AgentProvider";
import AgentChat from "./AgentChat";
import AgentMcp from "./AgentMcp";
import AgentOPFS from "./AgentOPFS";
import AgentSkills from "./AgentSkills";
import AgentTasks from "./AgentTasks";
import AgentSettings from "./AgentSettings";

function Agent() {
  return (
    <Routes>
      <Route path="/chat" element={<AgentChat />} />
      <Route path="/provider" element={<AgentProvider />} />
      <Route path="/mcp" element={<AgentMcp />} />
      <Route path="/skills" element={<AgentSkills />} />
      <Route path="/tasks" element={<AgentTasks />} />
      <Route path="/opfs" element={<AgentOPFS />} />
      <Route path="/settings" element={<AgentSettings />} />
      <Route path="*" element={<AgentChat />} />
    </Routes>
  );
}

export default Agent;
