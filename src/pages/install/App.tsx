import React from "react";
import CodeEditor from "../components/CodeEditor";
import Description from "./description";

function App() {
  return (
    <div className="h-full">
      <div>
        <Description />
      </div>
      <CodeEditor />
    </div>
  );
}

export default App;
