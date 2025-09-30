import React, { useState, createContext, type ReactNode, useEffect, useContext } from "react";
import { messageQueue } from "./global";
import { editor } from "monaco-editor";
import { type TKeyValue } from "@Packages/message/message_queue";
import { changeLanguage } from "@App/locales/locales";
import { SystemConfigChange } from "@App/pkg/config/config";

const SUBSCRIBE_HANDLER_ID = `SUBSCRIBE_HANDLER_ID`;

export interface AppContextType {
  colorThemeState: "auto" | "light" | "dark";
  updateColorTheme: (theme: "auto" | "light" | "dark") => void;
  subscribeMessage: (topic: string, handler: (msg: any) => void) => () => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export interface AppProviderProps {
  children: ReactNode;
}

const getDetectedColorTheme = () => {
  const darkTheme = window.matchMedia("(prefers-color-scheme: dark)");
  return darkTheme.matches ? "dark" : "light";
};

let enableAutoColorTheme = false;

const colorThemeInit = () => {
  setAppColorTheme(localStorage.lightMode);
  const darkTheme = window.matchMedia("(prefers-color-scheme: dark)");
  darkTheme.addEventListener("change", (_e) => {
    if (enableAutoColorTheme) {
      setAppColorTheme("auto");
    }
  });
};

const setAppColorTheme = (theme: "light" | "dark" | "auto") => {
  if (theme !== "dark" && theme !== "light") {
    theme = getDetectedColorTheme();
    enableAutoColorTheme = true;
  } else {
    enableAutoColorTheme = false;
  }
  switch (theme) {
    case "dark":
      document.body.setAttribute("arco-theme", "dark");
      editor.setTheme("vs-dark");
      break;
    case "light":
      document.body.removeAttribute("arco-theme");
      editor.setTheme("vs");
      break;
  }
};

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [colorThemeState, setColorThemeState] = useState<"auto" | "light" | "dark">(() => {
    colorThemeInit();
    return localStorage.lightMode || "auto";
  });

  const subscribeMessageConsumed = new WeakMap();
  const subscribeMessage = (topic: string, handler: ((msg: any) => void) & { [SUBSCRIBE_HANDLER_ID]?: string }) => {
    const handlerId =
      handler[SUBSCRIBE_HANDLER_ID] || (handler[SUBSCRIBE_HANDLER_ID] = `${Date.now() + Math.random()}`);
    return messageQueue.subscribe<any>(topic, (data) => {
      const message = data?.myMessage || data;
      let messageConsumed = subscribeMessageConsumed.get(message) as Record<string, boolean> | undefined;
      if (!messageConsumed) {
        subscribeMessageConsumed.set(message, (messageConsumed = {} as Record<string, boolean>));
      }
      if (typeof message === "object" && !messageConsumed[handlerId]) {
        messageConsumed[handlerId] = true;
        handler(message);
      }
    });
  };

  useEffect(() => {
    const pageApi = {
      onColorThemeUpdated({ theme }: { theme: "auto" | "light" | "dark" }) {
        setAppColorTheme(theme);
        setColorThemeState(theme);
      },
      systemConfigChanged({ key, value }: TKeyValue) {
        if (key === "language") changeLanguage(value);
      },
    };

    const unhooks = [
      subscribeMessage("onColorThemeUpdated", pageApi.onColorThemeUpdated),
      subscribeMessage(SystemConfigChange, pageApi.systemConfigChanged),
    ];
    return () => {
      for (const unhook of unhooks) unhook();
    };
  }, []);

  const updateColorTheme = (theme: "auto" | "light" | "dark") => {
    localStorage.lightMode = theme;
    messageQueue.publish<{ theme: "auto" | "light" | "dark" }>("onColorThemeUpdated", { theme });
  };

  return (
    <AppContext.Provider value={{ colorThemeState, updateColorTheme, subscribeMessage }}>
      {children}
    </AppContext.Provider>
  );
};

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
