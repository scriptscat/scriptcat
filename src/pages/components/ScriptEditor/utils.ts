export const enum ScriptEditorOpenStatus {
  IN_PAGE = 1,
  IN_OVERLAY = 2,
  MODAL_VISIBLE = 4,
  MODAL_INVISIBLE = 8,
}

export const getScriptEditorOpenStatus = () => {
  let ret = 0;
  if (document.querySelector(".editor-modal-wrapper #scripteditor-main")) {
    ret |= ScriptEditorOpenStatus.IN_OVERLAY;
  } else if (document.querySelector(".scripteditor-in-page #scripteditor-main")) {
    ret |= ScriptEditorOpenStatus.IN_PAGE;
  }
  if (ret) {
    const p = document.querySelector(".editor-modal-wrapper")?.parentElement;
    if (p && p.style.display === "none") ret |= ScriptEditorOpenStatus.MODAL_INVISIBLE;
    else if (p) ret |= ScriptEditorOpenStatus.MODAL_VISIBLE;
  }
  return ret;
};

export const makeModalVisible = () => {
  const p = document.querySelector(".editor-modal-wrapper")?.parentElement;
  if (p && p.style.display === "none") p.style.display = "";
};

export const makeModalInvisible = () => {
  const p = document.querySelector(".editor-modal-wrapper")?.parentElement;
  if (p && p.style.display !== "none") p.style.display = "none";
};

export const hideContentAboveInPageEditor = () => {
  if (document.querySelector("#scripteditor-layout-content #scripteditor-main")) {
    let s: Element | HTMLElement | null | undefined = document.querySelector("#scripteditor-layout-content");
    while ((s = s?.previousElementSibling) instanceof HTMLElement) {
      if (s.classList.contains("scripteditor-in-page")) break;
      if ((s as HTMLElement).style.display !== "none") {
        (s as HTMLElement).style.display = "none";
      }
    }
  }
};

export const showContentAboveInPageEditor = () => {
  if (document.querySelector("#scripteditor-layout-content #scripteditor-main")) {
    let s: Element | HTMLElement | null | undefined = document.querySelector("#scripteditor-layout-content");
    while ((s = s?.previousElementSibling) instanceof HTMLElement) {
      if (s.classList.contains("scripteditor-in-page")) break;
      if ((s as HTMLElement).style.display === "none") {
        (s as HTMLElement).style.display = "";
      }
    }
  }
};
