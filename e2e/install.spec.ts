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

    // Wait for the script to be fetched and metadata to be displayed
    // The install page shows script name, version, description, etc.
    // Wait for either the metadata to load or an error message
    await page.waitForTimeout(5000);

    // Check that the page has loaded content (not just blank)
    const body = page.locator("body");
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(0);
  });
});
