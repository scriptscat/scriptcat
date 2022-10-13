import React from "react";
import ReactDOM from "react-dom/client";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import ScriptController from "@App/app/service/script/controller";
import migrate from "@App/app/migrate";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import App from "./App";
import "./index.css";
import MainLayout, { switchLight } from "../components/layout/MainLayout";

migrate();

const con = new MessageInternal("popup");

ScriptController.instance = new ScriptController(con);

switchLight(localStorage.lightMode || "auto");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div
    style={{
      height: "50px",
      borderBottom: "1px solid var(--color-neutral-3)",
    }}
  >
    <App />
  </div>
);
