import { test, expect } from "./fixtures";
import { openInstallPage } from "./utils";

test.describe("Install Page", () => {
  // Use a well-known public userscript URL for testing
  const testScriptUrl =
    "https://raw.githubusercontent.com/nicedayzhu/userscripts/refs/heads/master/hello-world.user.js";

  test("should open install page with URL parameter", async ({ context, extensionId }) => {
    const page = await openInstallPage(context, extensionId, testScriptUrl);

    // The page should load without errors
    await expect(page).toHaveTitle(/Install.*ScriptCat|ScriptCat/i);
  });

  test("should display script metadata when loading a script", async ({ context, extensionId }) => {
    const page = await openInstallPage(context, extensionId, testScriptUrl);

    // Check that the page has loaded content (not just blank)
    const body = page.locator("body");
    await expect(body).not.toHaveText("", { timeout: 10_000 });
  });
});
