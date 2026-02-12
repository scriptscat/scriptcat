import React, { useState, createContext, type ReactNode, useEffect, useContext } from "react";
import { messageQueue } from "./global";

export const fnPlaceHolder = {
  setEditorTheme: null,
} as { setEditorTheme: ((theme: string) => void) | null };

export type ThemeParam = { theme: "auto" | "light" | "dark" };
export interface AppContextType {
  colorThemeState: "auto" | "light" | "dark";
  updateColorTheme: (theme: "auto" | "light" | "dark") => void;
  subscribeMessage: <T>(topic: string, handler: (msg: T) => void) => () => void;
  // 指引模式
  setGuideMode: (mode: boolean) => void;
  guideMode: boolean;
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
      document.documentElement.classList.add("dark");
      document.body.setAttribute("arco-theme", "dark");
      fnPlaceHolder.setEditorTheme?.("vs-dark");
      break;
    case "light":
      document.documentElement.classList.remove("dark");
      document.body.removeAttribute("arco-theme");
      fnPlaceHolder.setEditorTheme?.("vs");
      break;
  }
};

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [colorThemeState, setColorThemeState] = useState<"auto" | "light" | "dark">(() => {
    colorThemeInit();
    return localStorage.lightMode || "auto";
  });
  const [guideMode, setGuideMode] = useState(false);

  const subscribeMessage = <T,>(topic: string, handler: (msg: T) => void) => {
    return messageQueue.subscribe<T & { myMessage?: T }>(topic, (data) => {
      const message = data?.myMessage || data;
      if (typeof message === "object") {
        handler(message as T);
      }
    });
  };

  useEffect(() => {
    const pageApi = {
      onColorThemeUpdated({ theme }: ThemeParam) {
        setAppColorTheme(theme);
        setColorThemeState(theme);
      },
    } as const;

    const unhooks = [subscribeMessage<ThemeParam>("onColorThemeUpdated", pageApi.onColorThemeUpdated)];
    return () => {
      for (const unhook of unhooks) unhook();
      unhooks.length = 0;
    };
  }, []);

  const updateColorTheme = (theme: "auto" | "light" | "dark") => {
    localStorage.lightMode = theme;
    messageQueue.publish<ThemeParam>("onColorThemeUpdated", { theme });
  };

  return (
    <AppContext.Provider
      value={{
        colorThemeState,
        updateColorTheme,
        subscribeMessage,
        setGuideMode,
        guideMode,
      }}
    >
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
