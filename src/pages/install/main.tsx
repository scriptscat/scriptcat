/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";
import ReactDOM from "react-dom/client";
import registerEditor from "@App/utils/monaco-editor";
import "@arco-design/web-react/dist/css/arco.css";
import ConnectInternal from "@App/app/connect/internal";
import ScriptController from "@App/app/service/script/controller";
import MainLayout from "../components/layout/MainLayout";
import App from "./App";
// eslint-disable-next-line import/no-unresolved
import "uno.css";

registerEditor();

const con = new ConnectInternal("options");

ScriptController.instance = new ScriptController(con);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout className="!flex-col !px-4 box-border">
      <App />
    </MainLayout>
  </div>
);
