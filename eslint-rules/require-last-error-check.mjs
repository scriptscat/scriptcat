export default {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure callbacks check chrome.runtime.lastError appropriately",
    },
    schema: [],
    messages: {
      missing: "Callback for '{{api}}' lacks chrome.runtime.lastError check (should handle errors).",
      uncertain: "Callback for '{{api}}' may require lastError check—consider adding one.",
    },
  },
  create(context) {
    // APIs that must check lastError
    const mustCheck = new Set([
      "chrome.runtime.sendMessage",
      "chrome.runtime.connect",
      "chrome.runtime.getBackgroundPage",
      "chrome.runtime.getPackageDirectoryEntry",
      "chrome.permissions.contains",
      "chrome.permissions.request",
      "chrome.permissions.remove",
      "chrome.storage.get",
      "chrome.storage.set",
      "chrome.storage.remove",
      "chrome.storage.clear",
      "chrome.tabs.query",
      "chrome.tabs.create",
      "chrome.tabs.update",
      "chrome.tabs.remove",
      "chrome.tabs.sendMessage",
      "chrome.tabs.executeScript",
      "chrome.scripting.executeScript",
      "chrome.scripting.insertCSS",
      "chrome.scripting.removeCSS",
      "chrome.windows.create",
      "chrome.windows.get",
      "chrome.windows.update",
      "chrome.windows.remove",
      "chrome.notifications.create",
      "chrome.notifications.clear",
      "chrome.notifications.getAll",
    ]);

    // APIs that *might* require checking lastError (warning only)
    const maybeCheck = [
      "chrome.alarms.",
      "chrome.bookmarks.",
      "chrome.history.",
      "chrome.cookies.",
      "chrome.webNavigation.",
      "chrome.webRequest.",
      "chrome.declarativeNetRequest.",
      "chrome.management.",
    ];

    function isMaybeCheck(callee) {
      return maybeCheck.some((prefix) => callee.startsWith(prefix));
    }

    return {
      CallExpression(node) {
        const cb = node.arguments.find(
          (a) => a && (a.type === "FunctionExpression" || a.type === "ArrowFunctionExpression")
        );
        if (!cb) return;

        const callee = context.getSourceCode().getText(node.callee);
        if (!callee.startsWith("chrome.")) return;

        // Skip Promise-based API usage
        const isPromise = node.parent?.type === "AwaitExpression";
        if (isPromise) return;

        // Check callback body for lastError reference
        const cbBody = context.getSourceCode().getText(cb.body);
        const checksLastError = cbBody.includes("chrome.runtime.lastError");

        if (mustCheck.has(callee)) {
          if (!checksLastError) {
            context.report({
              node: cb,
              messageId: "missing",
              data: { api: callee },
            });
          }
        } else if (isMaybeCheck(callee)) {
          if (!checksLastError) {
            context.report({
              node: cb,
              messageId: "uncertain",
              data: { api: callee },
            });
          }
        }
      },
    };
  },
};
