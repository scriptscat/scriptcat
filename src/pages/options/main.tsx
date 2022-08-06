import React from "react";
import ReactDOM from "react-dom/client";
import registerEditor from "@App/utils/monaco-editor";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import "@arco-design/web-react/dist/css/arco.css";
import ConnectInternal from "@App/app/connect/internal";
import ScriptController from "@App/app/script/controller";
import MainLayout from "../components/layout/MainLayout";
import Sider from "../components/layout/Sider";

registerEditor();

const con = new ConnectInternal("options");

console.log(con);

ScriptController.getInstance().install();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout className="!flex-row">
      <Sider />
    </MainLayout>
  </div>
);
