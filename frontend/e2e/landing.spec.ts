import { expect, test } from "@playwright/test";

test("landing scenes render or show their stills and lead to the account forms", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const fridge = page.locator(".scene-landing");
  const webGL = await page.evaluate(() => {
    const context = document.createElement("canvas").getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  });
  const state = webGL ? "ready" : "fallback";
  await expect(fridge).toHaveAttribute("data-state", state);
  await expect(fridge.locator(webGL ? "canvas" : "img")).toBeVisible();
  if (webGL) {
    const bounds = await fridge.boundingBox();
    if (!bounds) throw new Error("The refrigerator has no visible bounds");
    await fridge.hover({
      position: { x: bounds.width * 0.46, y: bounds.height * 0.45 },
    });
    await expect(fridge).toHaveAttribute("data-hovered", "fridge");
    await page.mouse.move(0, 0);
  }
  await page.screenshot({ path: info.outputPath("desktop-landing.png") });
  const bowl = page.locator(".scene-dashboard");
  await bowl.scrollIntoViewIfNeeded();
  await expect(bowl).toHaveAttribute("data-state", state);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Create an account" }),
  ).toBeVisible();
});

test("a small Thai landing page keeps its artwork and actions without WebGL", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to Thai" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  const fridge = page.locator(".scene-landing");
  await fridge.scrollIntoViewIfNeeded();
  await expect(fridge).toHaveAttribute("data-state", "fallback");
  await expect(fridge.locator("img")).toBeVisible();
  expect(
    await fridge
      .locator("img")
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await page.screenshot({
    path: info.outputPath("mobile-landing-th.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "สร้างบัญชี" }).click();
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toBeVisible();
});
