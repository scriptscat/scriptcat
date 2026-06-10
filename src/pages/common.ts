// this is a standalone script to load as fast as possible in extension pages.
let inited = false;
if (!inited) {
  inited = true;
  try {
    const lightMode = localStorage.getItem("lightMode") || "auto";
    if (lightMode === "dark") {
      document.documentElement.classList.add("dark");
    } else if (lightMode === "auto") {
      const darkTheme = window.matchMedia("(prefers-color-scheme: dark)");
      if (darkTheme.matches) {
        document.documentElement.classList.add("dark");
      }
    }
  } catch (e) {
    console.warn(e);
  }
}
