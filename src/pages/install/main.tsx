import React from "react";
import ReactDOM from "react-dom/client";
import registerEditor from "@App/utils/monaco-editor";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import migrate from "@App/app/migrate";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import IoC from "@App/app/ioc";
import App from "./App";
import MainLayout from "../components/layout/MainLayout";

migrate();
registerEditor();

const con = new MessageInternal("install");

IoC.registerInstance(MessageInternal, con);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout className="!flex-col !px-4 box-border">
      <App />
    </MainLayout>
  </div>
);
