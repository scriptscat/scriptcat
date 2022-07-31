import React from "react";
import ReactDOM from "react-dom/client";
import registerEditor from "@App/utils/monaco-editor";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import "@arco-design/web-react/dist/css/arco.css";
import ConnectInternal from "@App/app/connect/internal";
import MainLayout from "../components/layout/MainLayout";

registerEditor();

const con = new ConnectInternal("options");

console.log(con);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout>
      <div>123</div>
    </MainLayout>
  </div>
);
