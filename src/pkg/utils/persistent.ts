export const keepEventPageRunning = () => {
  if (typeof frames !== "object") return;
  if (typeof document === "undefined") return;
  if (typeof document.documentElement === "undefined") return;
  if (document.getElementById("persistent_frame")) return;
  chrome.storage.session.onChanged.addListener((obj) => {
    typeof obj.persistentWakeup !== "undefined";
  });
  const iframe = document.createElement("iframe");
  iframe.id = "persistent_frame";
  iframe.src = chrome.runtime.getURL("/src/persistent_frame.html");
  document.documentElement.appendChild(iframe);
};
