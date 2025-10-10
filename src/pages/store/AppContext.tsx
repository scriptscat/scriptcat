import React, { useState, createContext, type ReactNode, useEffect, useContext, useCallback, useRef } from "react";
import { messageQueue } from "./global";
import { editor } from "monaco-editor";
import { type TKeyValue } from "@Packages/message/message_queue";
import { changeLanguage } from "@App/locales/locales";
import { SystemConfigChange } from "@App/pkg/config/config";

export type ThemeParam = { theme: "auto" | "light" | "dark" };
export interface AppContextType {
  colorThemeState: "auto" | "light" | "dark";
  updateColorTheme: (theme: "auto" | "light" | "dark") => void;
  subscribeMessage: <T>(topic: string, handler: (msg: T) => void) => () => void;
  editorOpen: boolean;
  setEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editorParams:
    | {
        uuid?: string | undefined;
        template?: "" | "background" | "crontab" | undefined;
        target?: "blank" | "initial" | undefined;
      }
    | undefined;
  setEditorParams: React.Dispatch<
    React.SetStateAction<
      | {
          uuid?: string;
          template?: "" | "background" | "crontab";
          target?: "blank" | "initial";
        }
      | undefined
    >
  >;
  openEditor: (
    params?:
      | {
          uuid?: string | undefined;
          template?: "" | "background" | "crontab" | undefined;
          target?: "blank" | "initial" | undefined;
        }
      | undefined
  ) => void;
  closeEditor: () => void;
  updateEditorHash: (params: {
    uuid?: string | undefined;
    template?: "" | "background" | "crontab" | undefined;
    target?: "blank" | "initial" | undefined;
  }) => void;
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
      editor.setTheme("vs-dark");
      break;
    case "light":
      document.documentElement.classList.remove("dark");
      document.body.removeAttribute("arco-theme");
      editor.setTheme("vs");
      break;
  }
};

function replaceHashSilently(nextHash: string) {
  const url = new URL(window.location.href);
  const curr = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const next = nextHash.startsWith("#") ? nextHash.slice(1) : nextHash;
  if (curr === next) return; // ✅ 相同就不要動，避免重複觸發

  url.hash = next; // 只改 URL 物件中的 hash
  history.replaceState({ __fromOverlayEditor: true }, "", url.toString()); // ✅ 靜默替換，不觸發 hashchange
}

function buildEditorHash(params?: { uuid?: string; template?: string; target?: "blank" | "initial" }) {
  if (!params) return "/script/editor";
  const { uuid, template, target } = params;
  if (uuid) return `/script/editor/${uuid}`;
  const qs: string[] = [];
  if (template) qs.push(`template=${encodeURIComponent(template)}`);
  if (target) qs.push(`target=${encodeURIComponent(target)}`);
  return `/script/editor${qs.length ? `?${qs.join("&")}` : ""}`;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorParams, setEditorParams] = useState<{
    uuid?: string;
    template?: "" | "background" | "crontab";
    target?: "blank" | "initial";
  }>();
  const prevHashRef = useRef<string>(window.location.hash);

  const openEditor = useCallback(
    (params?: { uuid?: string; template?: "" | "background" | "crontab"; target?: "blank" | "initial" }) => {
      prevHashRef.current = window.location.hash;
      setEditorParams(params);
      setEditorOpen(true);
      // 不新增歷史紀錄：用 replace
      replaceHashSilently(buildEditorHash(params));
    },
    []
  );

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    // 還原到打開前的 hash，同樣 replace
    const url = new URL(window.location.href);
    url.hash = prevHashRef.current || "#/";
    history.replaceState(null, "", url);
  }, []);

  // 提供給 Core，在切換 tab/建立新稿時更新 hash（仍使用 replace）
  const updateEditorHash = useCallback((params: { uuid?: string; template?: string; target?: "blank" | "initial" }) => {
    replaceHashSilently(buildEditorHash(params));
  }, []);

  const [colorThemeState, setColorThemeState] = useState<"auto" | "light" | "dark">(() => {
    colorThemeInit();
    return localStorage.lightMode || "auto";
  });

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
      systemConfigChanged({ key, value }: TKeyValue) {
        if (key === "language") changeLanguage(value);
      },
    };

    const unhooks = [
      subscribeMessage<ThemeParam>("onColorThemeUpdated", pageApi.onColorThemeUpdated),
      subscribeMessage<TKeyValue>(SystemConfigChange, pageApi.systemConfigChanged),
    ];
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
        editorOpen,
        setEditorOpen,
        editorParams,
        setEditorParams,
        openEditor,
        closeEditor,
        updateEditorHash,
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
