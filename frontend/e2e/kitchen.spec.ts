import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { localDay } from "../lib/pantry";

const suffix = () => crypto.randomUUID().slice(0, 8);
const password = "pantry workflow test password";
async function register(
  page: Page,
  name: string,
  profile?: { first: string; last: string },
) {
  if (page.url() === "about:blank") await page.goto("/");
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create an account", exact: true }),
  ).toBeVisible();
  if (profile) {
    await page.getByLabel("First name (optional)").fill(profile.first);
    await page.getByLabel("Last name (optional)").fill(profile.last);
  }
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your household" }),
  ).toBeVisible();
}
async function go(page: Page, name: string) {
  await expect(page.getByText("My household", { exact: true })).toBeVisible();
  const nav = page.getByRole("navigation");
  if (!(await nav.isVisible()))
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  await nav.getByRole("link", { name, exact: true }).click();
}
function backendSessions(action: "count" | "expire", username: string) {
  return execFileSync(
    ".venv/bin/python",
    ["../frontend/e2e/database.py", action, username],
    {
      cwd: "../backend",
      env: { ...process.env, PYTHONPATH: "." },
      encoding: "utf8",
    },
  ).trim();
}

test("workspace navigation stays on the left and opens as a drawer on mobile", async ({
  page,
}, info) => {
  await register(page, "sidebar" + suffix());
  await page.getByRole("button", { name: "Create household" }).click();

  const nav = page.getByRole("navigation", { name: "Navigation" });
  const inventory = nav.getByRole("link", { name: "Inventory", exact: true });
  const history = nav.getByRole("link", { name: "History", exact: true });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const main = page.getByRole("main");
  await expect(inventory).toHaveAttribute("aria-current", "page");
  await expect(menu).toBeHidden();
  expect((await nav.boundingBox())!.x).toBeLessThan(
    (await main.boundingBox())!.x,
  );
  await page.screenshot({ path: info.outputPath("desktop-sidebar.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav).toBeHidden();
  await menu.focus();
  await menu.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Navigation menu" });
  const close = drawer.getByRole("button", { name: "Close menu" });
  await expect(close).toBeFocused();
  await page.screenshot({ path: info.outputPath("mobile-sidebar.png") });
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await close.click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");

  await menu.click();
  await page.mouse.click(380, 200);
  await expect(drawer).toBeHidden();

  await menu.click();
  await history.click();
  await expect(drawer).toBeHidden();
  await expect(main).toBeFocused();
  await expect(
    main.getByRole("heading", { name: "History", exact: true }),
  ).toBeVisible();
  await menu.click();
  await expect(history).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(drawer).toBeHidden();
  await expect(history).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(inventory).toHaveAttribute("aria-current", "page");
});

test("NextAuth revokes one backend session and isolates each member's query cache", async ({
  page,
  browser,
}) => {
  const username = "auth" + suffix();
  await register(page, username, { first: "มาลี", last: "Santos" });
  const publicSession = await (
    await page.request.get("/api/auth/session")
  ).json();
  expect(publicSession).toEqual({
    user: {
      id: expect.any(String),
      name: username,
      firstName: "มาลี",
      lastName: "Santos",
      image: null,
    },
    expires: expect.any(String),
  });
  expect(Date.parse(publicSession.expires)).toBeGreaterThan(Date.now());
  expect(backendSessions("count", username)).toBe("1");
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await go(page, "Settings");
  await page.getByLabel("Ingredient name").fill("Cashews");
  await page
    .getByRole("group")
    .filter({ has: page.getByLabel("Ingredient name") })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await expect(page.getByText("Cashews", { exact: true })).toBeVisible();

  const sibling = await page.context().newPage();
  const secondBrowser = await browser.newContext({
    baseURL: "http://127.0.0.1:3310",
  });
  try {
    await sibling.goto("/");
    await expect(
      sibling.getByRole("heading", { name: "Inventory", exact: true }),
    ).toBeVisible();
    const second = await secondBrowser.newPage();
    await second.goto("/");
    await second.getByRole("link", { name: "Sign in", exact: true }).click();
    await second
      .getByLabel("Username", { exact: true })
      .fill(username.toUpperCase());
    await second.getByLabel("Password", { exact: true }).fill("wrong password");
    await second.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      second.getByText("Check your username and password."),
    ).toBeVisible();
    await second.getByLabel("Password", { exact: true }).fill(password);
    await second.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      second.getByRole("heading", { name: "Inventory", exact: true }),
    ).toBeVisible();
    await expect(second.getByText("มาลี Santos", { exact: true })).toBeVisible();
    expect(backendSessions("count", username)).toBe("2");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      sibling.getByRole("heading", { name: /Good food/ }),
    ).toBeVisible();
    expect((await page.request.get("/api/household")).status()).toBe(401);
    expect((await second.request.get("/api/household")).status()).toBe(200);
    expect(backendSessions("count", username)).toBe("1");

    await page.getByRole("button", { name: "Switch to Thai" }).click();
    await page.getByRole("link", { name: "สร้างบัญชี", exact: true }).click();
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill(username);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
    await expect(page.getByText("มีผู้ใช้ชื่อนี้แล้ว กรุณาเลือกชื่อใหม่")).toBeVisible();
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("fresh" + suffix());
    await page.getByRole("button", { name: "สร้างบัญชี", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "ครัวเรือนของคุณ" }),
    ).toBeVisible();
    expect(await (await page.request.get("/api/preferences")).json()).toEqual({
      language: "th",
    });
    await page.getByRole("button", { name: "เปลี่ยนเป็นภาษาอังกฤษ" }).click();
    await page
      .getByRole("button", { name: "Create household", exact: true })
      .click();
    await page.route(
      "**/api/preferences/foods-to-avoid",
      (route) => route.abort("failed"),
      { times: 1 },
    );
    await go(page, "Settings");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByText("Cashews", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("No foods on your list.")).toBeVisible();

    backendSessions("expire", username);
    await go(second, "History");
    await expect(
      second.getByText("Your session ended. Sign in again."),
    ).toBeVisible();
    expect(
      await (await second.request.get("/api/auth/session")).json(),
    ).toEqual({});
  } finally {
    await sibling.close();
    await secondBrowser.close();
  }
});
test("members share inventory, record a cooked meal and retain depleted history", async ({
  page,
  browser,
}, info) => {
  const owner = "cook" + suffix();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.locator(".scene-landing")).toHaveAttribute(
    "data-state",
    /^(ready|fallback)$/,
  );
  await page.screenshot({ path: info.outputPath("sign-in.png") });
  await register(page, owner);
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await expect(page.locator(".scene-dashboard")).toHaveAttribute(
    "data-state",
    /^(ready|fallback)$/,
  );
  await page.screenshot({ path: info.outputPath("inventory.png") });
  await page.getByRole("button", { name: "Add groceries" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Item name", { exact: true }).fill("Spinach");
  await dialog
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("each");
  await dialog.getByLabel("Storage location").selectOption("fridge");
  await dialog.getByLabel("Quantity").fill("1.5");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(dialog.getByRole("alert")).toContainText("whole number");
  await dialog
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("g");
  await dialog.getByLabel("Quantity").fill("100");
  await dialog.getByLabel("Expiry date").fill(localDay());
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByRole("button", { name: /Spinach/ })).toContainText(
    "100 g",
  );
  await go(page, "Use soon");
  await expect(page.getByRole("button", { name: /Spinach/ })).toContainText(
    "Due today",
  );
  await go(page, "Settings");
  const equipment = page.getByRole("region", { name: "Cooking equipment" });
  await expect(equipment.getByRole("textbox")).toHaveCount(0);
  await equipment.getByText("Skillet", { exact: true }).click();
  const riceCooker = equipment.getByRole("button", { name: "Rice cooker" });
  await riceCooker.focus();
  await riceCooker.press("Space");
  await expect(riceCooker).toHaveAttribute("aria-pressed", "true");
  await expect(riceCooker).toBeEnabled();
  await equipment.screenshot({ path: info.outputPath("equipment-cards.png") });
  await page.getByLabel("Ingredient name").fill("Peanuts");
  await page
    .getByRole("group")
    .filter({ has: page.getByLabel("Ingredient name") })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await expect(page.getByText("Peanuts", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create invitation code" }).click();
  const token = await page
    .getByRole("textbox", { name: /^Invitation code/ })
    .inputValue();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: "http://127.0.0.1:3310",
  });
  const member = await context.newPage();
  try {
    await register(member, "member" + suffix());
    await member.getByRole("button", { name: "Join", exact: true }).click();
    await member.getByLabel("Invitation code").fill(token);
    await member.getByRole("button", { name: "Join household" }).click();
    await member.getByRole("button", { name: /Spinach/ }).click();
    await member.getByLabel("Amount").fill("101");
    await member.getByRole("button", { name: "Save usage" }).click();
    await expect(member.getByRole("dialog").getByRole("alert")).toContainText(
      "exceeds",
    );
    // Lose the acknowledgement after FastAPI commits. Retrying must not deduct twice.
    await member.route(
      "**/api/inventory/*/events?*",
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await member.getByLabel("Amount").fill("75");
    await member.getByRole("button", { name: "Save usage" }).click();
    await expect(member.getByRole("dialog").getByRole("alert")).toContainText(
      "request could not be completed",
    );
    await expect(member.getByLabel("Amount")).toHaveValue("75");
    await member.getByRole("button", { name: "Save usage" }).click();
    await expect(member.getByRole("button", { name: /Spinach/ })).toContainText(
      "25 g",
    );
    await member.screenshot({
      path: info.outputPath("mobile-inventory.png"),
      fullPage: true,
    });
    expect(
      await member.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await go(member, "Settings");
    await expect(
      member.getByRole("button", { name: "Skillet" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(member.getByText("No foods on your list.")).toBeVisible();
    await member.getByRole("button", { name: "Switch to Thai" }).click();
    await expect(
      member.getByRole("heading", { name: "การตั้งค่า", exact: true }),
    ).toBeVisible();
    const thaiSkillet = member.getByRole("button", { name: "กระทะแบน" });
    await expect(thaiSkillet).toHaveAttribute("aria-pressed", "true");
    await member.getByText("กระทะแบน", { exact: true }).click();
    await expect(thaiSkillet).toHaveAttribute("aria-pressed", "false");
    await expect(thaiSkillet).toBeEnabled();
    await member.reload();
    await expect(
      member.getByRole("heading", { name: "การตั้งค่า", exact: true }),
    ).toBeVisible();
    await expect(thaiSkillet).toHaveAttribute("aria-pressed", "false");
    await expect(
      member.getByRole("button", { name: "หม้อหุงข้าว" }),
    ).toHaveAttribute("aria-pressed", "true");
    await member.getByRole("region", { name: "อุปกรณ์ทำอาหาร" }).screenshot({
      path: info.outputPath("mobile-equipment-cards.png"),
    });
    expect(
      await member.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
  await page.reload();
  await expect(
    equipment.getByRole("button", { name: "Skillet" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(riceCooker).toHaveAttribute("aria-pressed", "true");
  await go(page, "Inventory");
  await expect(page.getByRole("button", { name: /Spinach/ })).toContainText(
    "25 g",
  );
  await page.getByRole("button", { name: /Spinach/ }).click();
  await dialog.getByRole("button", { name: "Record discard" }).click();
  await dialog.getByLabel("Amount").fill("25");
  await dialog.getByRole("button", { name: "Save discard" }).click();
  await expect(page.getByText("Your pantry is empty")).toBeVisible();
  await go(page, "History");
  await expect(page.getByText("Used 75 g")).toBeVisible();
  await expect(page.getByText("Discarded 25 g")).toBeVisible();
  await go(page, "Meal ideas");
  await expect(page.getByText(/Add in-date or undated/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: /Good food/ })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Username", { exact: true }).fill(owner.toUpperCase());
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await go(page, "History");
  await expect(page.getByText("Discarded 25 g")).toBeVisible();
});
test("equipment cards retain earlier names and recover from a failed save", async ({
  page,
}) => {
  await register(page, "tools" + suffix());
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await expect(page.getByText("My household", { exact: true })).toBeVisible();
  for (const name of ["SKILLET", "กระทะแบน", "Pasta roller"]) {
    const response = await page.request.post("/api/equipment", {
      headers: { Origin: new URL(page.url()).origin },
      data: { name },
    });
    expect(response.status()).toBe(201);
  }
  await go(page, "Settings");
  const skillet = page.getByRole("button", { name: "Skillet" });
  await expect(skillet).toHaveAttribute("aria-pressed", "true");
  await skillet.click();
  await expect(skillet).toHaveAttribute("aria-pressed", "false");
  await expect(skillet).toBeEnabled();
  const custom = page.getByRole("button", { name: "Pasta roller" });
  await expect(custom).toHaveAttribute("aria-pressed", "true");
  await custom.click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(custom).toHaveAttribute("aria-pressed", "true");
  await custom.click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(custom).toHaveCount(0);
  const oven = page.getByRole("button", { name: "Oven" });
  await page.route("**/api/equipment", (route) => route.abort("failed"), {
    times: 1,
  });
  await oven.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(oven).toHaveAttribute("aria-pressed", "false");
  await oven.click();
  await expect(oven).toHaveAttribute("aria-pressed", "true");
  await expect(oven).toBeEnabled();
  const saved = await page.request.get("/api/equipment");
  expect(await saved.json()).toEqual([
    { id: expect.any(String), name: "Oven" },
  ]);
});
test("barcode review, availability errors, edit and removal", async ({
  page,
}) => {
  await register(page, "intake" + suffix());
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await page.getByRole("button", { name: "Add groceries" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Photo", exact: true }).click();
  await dialog.getByLabel("Grocery photo").setInputFiles({
    name: "test.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("photo test fixture"),
  });
  await dialog.getByRole("button", { name: "Analyze photo" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Photo analysis is unavailable",
  );
  await page.route("**/api/barcodes/*", (route) =>
    route.fulfill({
      json: {
        name: "Rice",
        name_en: "Rice",
        name_th: "ข้าว",
        brands: "Example",
        package_size: "500 g",
      },
    }),
  );
  await dialog.getByRole("button", { name: "Barcode", exact: true }).click();
  await dialog.getByLabel("Barcode digits").fill("12345678");
  await dialog.getByRole("button", { name: "Look up product" }).click();
  await expect(dialog.getByLabel("Item name", { exact: true })).toHaveValue(
    "Rice",
  );
  await expect(dialog.getByLabel("Quantity")).toHaveValue("");
  await expect(dialog.getByText(/Example · 500 g/)).toBeVisible();
  await dialog.getByLabel("Quantity").fill("250");
  await dialog
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("g");
  await dialog.getByLabel("Storage location").selectOption("pantry");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await go(page, "Meal ideas");
  await page.getByRole("button", { name: "Generate menu" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Menu generation is unavailable",
  );
  await go(page, "Inventory");
  await page.getByRole("button", { name: /Rice/ }).click();
  await dialog.getByRole("button", { name: "Edit entry" }).click();
  await dialog.getByLabel("Storage location").selectOption("other");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByRole("button", { name: /Rice/ })).toContainText(
    "Other",
  );
  await page.getByRole("button", { name: "Switch to Thai" }).click();
  await expect(page.getByRole("button", { name: /ข้าว/ })).toContainText(
    "250 กรัม",
  );
  await page.getByRole("button", { name: "เปลี่ยนเป็นภาษาอังกฤษ" }).click();
  await page.getByRole("button", { name: /Rice/ }).click();
  await dialog.getByRole("button", { name: "Remove entry" }).click();
  await dialog.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByText("Your pantry is empty")).toBeVisible();
});

test("reviews photo suggestions, preserves a failed save and switches menu language", async ({
  page,
}) => {
  await register(page, "photo" + suffix());
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  const eggs = { en: "Chicken eggs", th: "ไข่ไก่" };
  await page.route("**/api/photos/analyze", (route) =>
    route.fulfill({
      json: {
        suggestions: [
          { name: eggs, quantity: "6", unit: "each", expiry_date: null },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "Add groceries" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Photo", exact: true }).click();
  await dialog.getByLabel("Grocery photo").setInputFiles("public/kitchen.jpg");
  await dialog.getByRole("button", { name: "Analyze photo" }).click();
  await expect(
    dialog.getByLabel("Thai name (optional)", { exact: true }),
  ).toHaveValue(eggs.th);
  await expect(dialog.getByLabel("Quantity")).toHaveValue("6");
  await expect(dialog.getByLabel("Expiry date")).toHaveValue("");
  await dialog
    .getByRole("combobox", { name: "Storage location", exact: true })
    .selectOption("fridge");
  await page.route("**/api/inventory?*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 503,
      json: { code: "database_unavailable" },
    });
  });
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "database is unavailable",
  );
  await expect(dialog.getByLabel("Quantity")).toHaveValue("6");
  await page.unroute("**/api/inventory?*");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(
    page.getByRole("button", { name: /Chicken eggs/ }),
  ).toContainText("6 each");
  await go(page, "Settings");
  await page.getByLabel("Ingredient name").fill(eggs.th);
  await page
    .getByRole("group")
    .filter({ has: page.getByLabel("Ingredient name") })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await expect(page.getByText(eggs.th, { exact: true })).toBeVisible();
  let requests = 0;
  const dish = {
    name: { en: "Eggs", th: "เมนูไข่" },
    ingredients: [
      { reference: "eggs", name: eggs, quantity: "2", unit: "each" },
    ],
    equipment: [],
    steps: [{ en: "Peel the cooked eggs.", th: "ปอกเปลือกไข่ต้ม" }],
  };
  await page.route("**/api/menus", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    requests++;
    await route.fulfill({
      json: {
        id: "menu-1",
        created_at: new Date().toISOString(),
        dishes: [dish],
      },
    });
  });
  await go(page, "Meal ideas");
  await expect(
    page.getByText(
      "Your Foods to avoid list excludes every available ingredient.",
    ),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("link", { name: "Review foods to avoid" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm removal" }).click();
  await go(page, "Meal ideas");
  await page.getByRole("button", { name: "Generate menu" }).click();
  await expect(page.getByText(dish.steps[0].en)).toBeVisible();
  await page.getByRole("button", { name: "Switch to Thai" }).click();
  await expect(page.getByText(dish.steps[0].th)).toBeVisible();
  await expect(page.getByText("ไข่ไก่ · 2 ชิ้น")).toBeVisible();
  expect(requests).toBe(1);
});
