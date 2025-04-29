import { SystemConfig } from "@App/pkg/config/config";
import { createAppSlice } from "../hooks";
import { PayloadAction } from "@reduxjs/toolkit";
import { editor } from "monaco-editor";

function setAutoMode() {
  const darkTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const isMatch = (match: boolean) => {
    if (match) {
      document.body.setAttribute("arco-theme", "dark");
      editor.setTheme("vs-dark");
    } else {
      document.body.removeAttribute("arco-theme");
      editor.setTheme("vs");
    }
  };
  darkTheme.addEventListener("change", (e) => {
    isMatch(e.matches);
  });
  isMatch(darkTheme.matches);
}

export const configSlice = createAppSlice({
  name: "setting",
  initialState: {
    lightMode: localStorage.lightMode || "auto",
  },
  reducers: (create) => {
    // 初始化黑夜模式
    setAutoMode();
    return {
      setDarkMode: create.reducer((state, action: PayloadAction<"light" | "dark" | "auto">) => {
        localStorage.loghtMode = action.payload;
        state.lightMode = action.payload;
        if (action.payload === "auto") {
          setAutoMode();
        } else {
          document.body.setAttribute("arco-theme", action.payload);
          editor.setTheme(action.payload === "dark" ? "vs-dark" : "vs");
        }
      }),
    };
  },
  selectors: {
    selectThemeMode: (state) => state.lightMode,
  },
});

export const { setDarkMode } = configSlice.actions;

export const { selectThemeMode } = configSlice.selectors;
