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
  expect(data["text/_notion-blocks-v3-production"]).toBeUndefined();
  const v3 = JSON.parse(data["application/x-blockwise-blocks-v3"]!);
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

test("pasting several blocks into the title puts them in the body", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New page" }).click();
  await page.keyboard.type("Title stays");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/html", "<h2>Pasted</h2><details><summary>Toggle</summary><p>inside</p></details>");
    dt.setData("text/plain", "## Pasted\n- Toggle\n  inside");
    document.querySelector(".page-title")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator(".page-title")).toHaveText("Title stays");
  await expect(page.locator(".blocks .text-block.h2")).toHaveText("Pasted");
  await expect(page.locator('.blocks [data-type="toggle"]')).toHaveCount(1);
});

test("copied toggles and highlights survive a paste back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New page" }).click();
  await page.keyboard.type("Round trip");
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/html", '<details><summary>T</summary><p>child</p></details><p><span style="background-color:#fbf3db">hi</span></p>');
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.blocks [data-type="toggle"]')).toHaveCount(1);
  await expect(page.locator(".blocks .c-yellow_background, .blocks [class*=yellow_background]").first()).toHaveText("hi");
});

test("text colors render as text colors and backgrounds as highlights", async ({ page }) => {
  await page.goto("/");
  const colour = page.locator(".blocks mark.highlight-orange", { hasText: "colour" }).first();
  const hl = page.locator(".blocks mark.highlight-yellow_background", { hasText: "highlight" }).first();
  await expect(colour).toBeVisible();
  expect(await colour.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(await hl.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
});

test("block menu sets block colors on the selection with undo, and copy carries them", async ({ page }) => {
  await freshPage(page);
  await page.keyboard.type("first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  const rows = page.locator(".blocks > .block");
  const content = (i: number) => rows.nth(i).locator("> .block-content");
  await rows.nth(0).hover();
  await rows.nth(0).locator(".handle").click();
  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["Delete", "Duplicate", /Turn into/, /Color/]);
  await menu.getByRole("menuitem", { name: /^Color/ }).click();
  await expect(page.getByRole("menu", { name: "Color" }).getByRole("menuitem")).toHaveCount(20);
  await page.getByRole("menuitem", { name: "Red background" }).click();
  await expect(menu).toBeHidden();
  await expect(content(0)).toHaveClass(/block-color-red_background/);
  expect(await content(0).evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");

  // Multi block: shift click adds to the selection, right click opens the menu for all of it.
  await rows.nth(1).hover();
  await rows.nth(1).locator(".handle").click({ modifiers: ["Shift"] });
  await expect(page.locator(".block.selected")).toHaveCount(2);
  await rows.nth(1).locator(".handle").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Color/ }).click();
  await page.getByRole("menuitem", { name: "Blue text" }).click();
  await expect(content(0)).toHaveClass(/block-color-blue(\s|$)/);
  await expect(content(1)).toHaveClass(/block-color-blue(\s|$)/);

  const data = await page.evaluate(() => {
    const dt = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
    return Object.fromEntries(dt.types.map((t) => [t, dt.getData(t)]));
  });
  expect(data["text/html"]).toContain('data-notion-highlight="blue" style="color:#337ea9"');
  expect(data["application/x-blockwise-blocks-v3"]).toContain('"block_color":"blue"');

  await page.keyboard.press(`${mod}+z`);
  await expect(content(0)).toHaveClass(/block-color-red_background/);
  await expect(content(1)).not.toHaveClass(/block-color/);
});

test("block menu turn into, duplicate and delete", async ({ page }) => {
  await freshPage(page);
  await page.keyboard.type("item");
  const rows = page.locator(".blocks > .block");
  await rows.nth(0).hover();
  await rows.nth(0).locator(".handle").click();
  await page.getByRole("menuitem", { name: /^Turn into/ }).click();
  await page.getByRole("menuitem", { name: "Heading 2" }).click();
  await expect(rows.nth(0)).toHaveAttribute("data-type", "heading_2");
  await rows.nth(0).hover();
  await rows.nth(0).locator(".handle").click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(rows).toHaveCount(2);
  await rows.nth(1).hover();
  await rows.nth(1).locator(".handle").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(rows).toHaveCount(1);
});

test("demo page has a block colored block", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".blocks .block-color-blue_background", { hasText: "Block color" })).toBeVisible();
});
