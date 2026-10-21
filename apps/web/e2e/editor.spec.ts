import { expect, test, type Page } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function freshPage(page: Page) {
  await page.goto("/");
  await expect(page.locator(".page-title")).toBeVisible();
  await page.getByRole("button", { name: "+ New page" }).click();
  await expect(page.locator(".page-title")).toBeFocused();
  await page.keyboard.type("Test page");
  await page.keyboard.press("Enter");
}

test("seeded welcome page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".page-title")).toContainText("Welcome");
  await expect(page.locator(".callout")).toBeVisible();
});

test("typing, markdown shortcuts and enter create blocks", async ({ page }) => {
  await freshPage(page);
  await page.keyboard.type("# Big title");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[] task");
  const blocks = page.locator(".blocks");
  await expect(blocks.locator(".text-block.h1")).toHaveText("Big title");
  await expect(blocks.locator('[data-type="bulleted_list_item"]')).toHaveCount(2);
  await expect(blocks.locator(".todo-box")).toHaveCount(1);
});

test("slash menu turns a block into a heading and undo restores it", async ({ page }) => {
  await freshPage(page);
  await page.keyboard.type("/head");
  await expect(page.getByRole("listbox", { name: "Insert block" })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Hello");
  await expect(page.locator(".blocks .text-block.h1")).toHaveText("Hello");
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press(`${mod}+z`);
  await expect(page.locator(".blocks .text-block.h1")).toHaveCount(0);
});

test("tab indents a list item under the previous one", async ({ page }) => {
  await freshPage(page);
  await page.keyboard.type("- parent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("child");
  await page.keyboard.press("Tab");
  await expect(page.locator('.blocks .children [data-type="bulleted_list_item"] .text-block')).toHaveText("child");
});

test("edits persist across reload", async ({ page }) => {
  await freshPage(page);
  await page.keyboard.type("persist me");
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByRole("link", { name: /Test page/ }).first().click();
  await expect(page.locator(".blocks")).toContainText("persist me");
});

test("copying a block selection writes Notion and plain text flavours", async ({ page }) => {
  await freshPage(page);
  await page.keyboard.type("alpha");
  await page.keyboard.press("Enter");
  await page.keyboard.type("beta");
  await page.keyboard.press("Escape");
  await expect(page.locator(".block.selected")).toHaveCount(1);
  const data = await page.evaluate(() => {
    const dt = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
    return Object.fromEntries(dt.types.map((t) => [t, dt.getData(t)]));
  });
  expect(data["text/plain"]).toContain("beta");
  expect(data["text/html"]).toContain("beta");
  const v3 = JSON.parse(data["text/_notion-blocks-v3-production"]!);
  expect(v3.blocks[0].blockSubtree.__version__).toBe(3);
});

test("pasting HTML creates blocks", async ({ page }) => {
  await freshPage(page);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/html", "<h2>Pasted</h2><ul><li>one</li><li>two</li></ul>");
    dt.setData("text/plain", "Pasted\none\ntwo");
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator(".blocks .text-block.h2")).toHaveText("Pasted");
  await expect(page.locator('.blocks [data-type="bulleted_list_item"]')).toHaveCount(2);
});

test("dark mode toggle switches theme", async ({ page }) => {
  await page.goto("/");
  const before = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", before === "dark" ? "light" : "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", before === "dark" ? "light" : "dark");
});

test("export downloads a zip", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Export" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Markdown/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
});

test("proxy refuses non page endpoints", async ({ request }) => {
  const r = await request.get("/api/notion/v1/users");
  expect(r.status()).toBe(404);
  const r2 = await request.get("/api/notion/v1/pages/0123456789abcdef0123456789abcdef");
  expect(r2.status()).toBe(401);
});
