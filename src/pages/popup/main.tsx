import React from "react";
import ReactDOM from "react-dom/client";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import ScriptController from "@App/app/service/script/controller";
import migrate from "@App/app/migrate";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import App from "./App";
import MainLayout from "../components/layout/MainLayout";

migrate();

const con = new MessageInternal("popup");

ScriptController.instance = new ScriptController(con);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout className="!flex-col !px-4 box-border">
      <App />
    </MainLayout>
  </div>
);
