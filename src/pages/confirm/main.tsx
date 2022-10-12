import React from "react";
import ReactDOM from "react-dom/client";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import migrate from "@App/app/migrate";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import PermissionController from "@App/app/service/permission/controller";
import App from "./App";
import MainLayout from "../components/layout/MainLayout";

migrate();

const con = new MessageInternal("confirm");

const permCtrl = new PermissionController(con);
PermissionController.instance = permCtrl;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout className="!flex-col !px-4 box-border">
      <App />
    </MainLayout>
  </div>
);
