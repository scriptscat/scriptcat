import React from "react";
import ReactDOM from "react-dom/client";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import migrate from "@App/app/migrate";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import IoC from "@App/app/ioc";
import { MessageBroadcast, MessageHander } from "@App/app/message/message";
import App from "./App";
import MainLayout from "../components/layout/MainLayout";
import "@App/locales/locales";

migrate();

const con = new MessageInternal("confirm");

IoC.registerInstance(MessageInternal, con).alias([
  MessageHander,
  MessageBroadcast,
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout className="!flex-col !px-4 box-border" pageName="confirm">
      <App />
    </MainLayout>
  </div>
);
