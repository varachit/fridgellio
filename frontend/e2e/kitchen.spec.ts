import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { localDay } from "../lib/pantry";

const suffix = () => crypto.randomUUID().slice(0, 8);
const password = "eight888";
async function register(
  page: Page,
  name: string,
  profile = { first: "Pantry", last: "Tester" },
) {
  if (page.url() === "about:blank") await page.goto("/");
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create an account", exact: true }),
  ).toBeVisible();
  await page.getByLabel("First name", { exact: true }).fill(profile.first);
  await page.getByLabel("Last name", { exact: true }).fill(profile.last);
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
  await expect(page.getByText(/^(My household|ครัวเรือนของฉัน)$/)).toBeVisible();
  const nav = page.getByRole("navigation");
  if (!(await nav.isVisible()))
    await page.getByRole("button", { name: /^(Menu|เมนู)$/ }).click();
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

async function useTestCamera(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const video = constraints?.video;
      if (
        constraints?.audio !== false ||
        typeof video !== "object" ||
        typeof video.facingMode !== "object" ||
        !("ideal" in video.facingMode) ||
        video.facingMode.ideal !== "environment"
      )
        throw new Error("Unexpected camera constraints");
      const frame = document.createElement("canvas");
      frame.width = 320;
      frame.height = 240;
      const context = frame.getContext("2d")!;
      const stream = frame.captureStream(10);
      const track = stream.getVideoTracks()[0];
      context.fillStyle = "white";
      const timer = setInterval(() => {
        if (track.readyState === "ended") clearInterval(timer);
        else context.fillRect(0, 0, frame.width, frame.height);
      }, 100);
      return stream;
    };
  });
}

function cameraTrack(dialog: Locator) {
  return dialog.locator("video").evaluateHandle((element) => {
    const stream = (element as HTMLVideoElement).srcObject as MediaStream;
    return stream.getVideoTracks()[0];
  });
}

test("household profile menu edits names without losing the invitation draft", async ({
  page,
}, info) => {
  await register(page, "profile" + suffix());
  const trigger = page.getByRole("button", { name: "Profile menu" });
  await expect(trigger).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.getByLabel("Invitation code").fill("ABCD-EFGH");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Profile menu" });
  await expect(
    menu.getByRole("menuitem", { name: "Edit profile" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Edit profile" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Edit profile", exact: true }),
  ).toBeFocused();
  const saveProfile = page.getByRole("button", { name: "Save profile" });
  await expect(saveProfile).toBeEnabled();
  await saveProfile.click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(saveProfile).toBeEnabled();
  const firstName = page.getByLabel("First name", { exact: true });
  const lastName = page.getByLabel("Last name", { exact: true });
  await firstName.fill("");
  await expect(saveProfile).toBeDisabled();
  await firstName.fill("   ");
  await expect(saveProfile).toBeDisabled();
  await firstName.fill("Pantry");
  await lastName.fill("");
  await expect(saveProfile).toBeDisabled();
  await lastName.fill("   ");
  await expect(saveProfile).toBeDisabled();
  await page.getByLabel("Last name", { exact: true }).fill("Cook");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(trigger).toContainText("PC");
  await page.getByRole("button", { name: "Back to your household" }).click();
  await expect(page.getByLabel("Invitation code")).toHaveValue("ABCD-EFGH");
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.screenshot({
    path: info.outputPath("household-profile-menu.png"),
  });
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: /Good food/ })).toBeVisible();
  expect((await page.request.get("/api/household")).status()).toBe(401);
});

test("inventory expiry notifications review past-date entries without changing stock", async ({
  page,
}, info) => {
  await register(page, "expiry" + suffix());
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory", exact: true }),
  ).toBeVisible();
  const today = localDay();
  const yesterday = new Date(today + "T12:00:00");
  yesterday.setDate(yesterday.getDate() - 1);
  for (const [name, expiry_date] of [
    ["Spinach", localDay(yesterday)],
    ["Milk", localDay(yesterday)],
    ["Eggs", today],
  ]) {
    const response = await page.request.post("/api/inventory", {
      headers: { Origin: new URL(page.url()).origin },
      data: {
        name,
        quantity: "100",
        unit: "g",
        location: "fridge",
        expiry_date,
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.reload();
  const alert = page.getByRole("alert", { name: "Expired groceries" });
  await expect(alert).toContainText("2 grocery entries");
  const bell = page.getByRole("button", {
    name: "Notifications, 2 expired entries",
    exact: true,
  });
  await expect(bell.locator(".notification-count")).toHaveText("2");
  await bell.click();
  const notifications = page.getByRole("dialog", {
    name: "Notifications",
    exact: true,
  });
  await expect(notifications.getByRole("listitem")).toHaveCount(2);
  await expect(bell.locator(".notification-count")).toHaveCount(0);
  await expect(notifications).not.toContainText("Eggs");
  await page.screenshot({
    path: info.outputPath("inventory-expiry-notifications.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(bell).toBeFocused();
  await expect(bell.locator(".notification-count")).toHaveCount(0);
  await alert.getByRole("button", { name: "Review expired items" }).click();
  await expect(page.locator("#past-date-groceries")).toBeFocused();
  const inventory = await (
    await page.request.get("/api/inventory?today=" + today)
  ).json();
  expect(inventory).toHaveLength(3);
  expect(
    inventory.every(
      (entry: { quantity: string }) => Number(entry.quantity) === 100,
    ),
  ).toBe(true);
});

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
  await expect(page.locator(".workspace-sidebar .user")).toHaveCount(0);
  await expect(page.locator(".workspace-sidebar .language")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Profile menu" }),
  ).toBeVisible();
  await expect(page.locator(".scene-groceries")).toHaveAttribute(
    "data-state",
    /^(ready|fallback)$/,
  );
  expect(
    await page
      .locator(".pantry-head")
      .evaluate((element) => getComputedStyle(element).borderTopWidth),
  ).toBe("0px");
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
  await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "มาลี",
  );
  await expect(page.getByLabel("Last name", { exact: true })).toHaveValue(
    "Santos",
  );
  await page.getByLabel("Last name", { exact: true }).fill("  Reyes  ");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Profile menu" }),
  ).toContainText("มR");
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
    await expect(
      second.getByRole("button", { name: "Profile menu" }),
    ).toContainText("มR");
    await go(second, "Settings");
    const firstName = second.getByLabel("First name", { exact: true });
    const lastName = second.getByLabel("Last name", { exact: true });
    const saveProfile = second.getByRole("button", { name: "Save profile" });
    await expect(firstName).toHaveAttribute("required", "");
    await expect(lastName).toHaveAttribute("required", "");
    await expect(lastName).toHaveValue("Reyes");
    await lastName.clear();
    await expect(saveProfile).toBeDisabled();
    await lastName.fill("   ");
    await expect(saveProfile).toBeDisabled();
    await expect(
      second.getByText("Please fill in both your first and last name."),
    ).toBeVisible();
    await expect(
      second.getByRole("button", { name: "Profile menu" }),
    ).toContainText("มR");
    await second.reload();
    await expect(firstName).toHaveValue("มาลี");
    await expect(lastName).toHaveValue("Reyes");
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
    const signUpFirstName = page.getByLabel("ชื่อ", { exact: true });
    const signUpLastName = page.getByLabel("นามสกุล", { exact: true });
    const createAccount = page.getByRole("button", {
      name: "สร้างบัญชี",
      exact: true,
    });
    await expect(signUpFirstName).toHaveAttribute("required", "");
    await expect(signUpLastName).toHaveAttribute("required", "");
    await createAccount.click();
    await expect(signUpFirstName).toBeFocused();
    await signUpFirstName.fill("   ");
    await signUpLastName.fill("Tester");
    await createAccount.click();
    await expect(page.getByText("กรอกทั้งชื่อและนามสกุล")).toBeVisible();
    await signUpFirstName.fill("Pantry");
    await createAccount.click();
    await expect(page.getByText("มีผู้ใช้ชื่อนี้แล้ว กรุณาเลือกชื่อใหม่")).toBeVisible();
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("fresh" + suffix());
    await createAccount.click();
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
  await page.clock.install();
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
  await register(page, owner, { first: "Mali", last: "Santos" });
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await expect(page.locator(".scene-groceries")).toHaveAttribute(
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
  await go(page, "Household");
  await page.getByRole("button", { name: "Create invitation code" }).click();
  const revokedToken = await page
    .getByRole("textbox", { name: "Invitation code" })
    .inputValue();
  await page.reload();
  const revoke = page.getByRole("button", { name: /^Remove invite/ });
  await revoke.focus();
  await expect(revoke).toBeFocused();
  await revoke.press("Enter");
  await expect(page.getByText("Invitation removed.")).toBeVisible();
  await expect(revoke).toHaveCount(0);
  await page.getByRole("button", { name: "Create invitation code" }).click();
  const token = await page
    .getByRole("textbox", { name: "Invitation code" })
    .inputValue();
  expect(token).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  await page.getByRole("region", { name: "Invitations" }).screenshot({
    path: info.outputPath("household-invitation-code.png"),
  });
  await page.reload();
  await expect(revoke).toBeVisible();
  await page.screenshot({ path: info.outputPath("owner-household.png") });
  const desktopViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(revoke).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("mobile-owner-household.png"),
  });
  await page.setViewportSize(desktopViewport);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: "http://127.0.0.1:3310",
  });
  const member = await context.newPage();
  await member.clock.install();
  try {
    await register(member, "member" + suffix(), {
      first: "Niran",
      last: "Lee",
    });
    await member.getByRole("button", { name: "Join", exact: true }).click();
    await member.getByLabel("Invitation code").fill(revokedToken);
    await member.getByRole("button", { name: "Join household" }).click();
    await expect(
      member
        .getByRole("alert")
        .filter({ hasText: "This invitation code is no longer available." }),
    ).toBeVisible();
    await member
      .getByLabel("Invitation code")
      .fill(token.toLowerCase().replace("-", ""));
    await member.getByRole("button", { name: "Join household" }).click();
    await go(member, "Household");
    await expect(
      member.getByRole("region", { name: "Invitations" }),
    ).toHaveCount(0);
    const roster = member.getByRole("main").getByRole("listitem");
    await expect(roster.filter({ hasText: "Mali Santos" })).toContainText(
      "Owner",
    );
    await expect(roster.filter({ hasText: "Niran Lee" })).toContainText("You");
    await expect(
      roster.filter({ hasText: "Niran Lee" }).locator(".avatar"),
    ).toHaveText("NL");
    await member.screenshot({
      path: info.outputPath("mobile-household-members.png"),
      fullPage: true,
    });
    await go(member, "Inventory");
    await go(page, "Inventory");
    await page.getByRole("button", { name: /Spinach/ }).click();
    const ownerQuantity = dialog.locator(".detail-meta");
    await expect(ownerQuantity).toContainText("100 g");
    await member.getByRole("button", { name: /Spinach/ }).click();
    const activity = member.getByRole("dialog").getByRole("listitem");
    await expect(activity.filter({ hasText: "Added 100 g" })).toContainText(
      "Mali Santos",
    );
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
    await member.clock.fastForward(30_000);
    await expect(
      member.getByRole("dialog").locator(".detail-meta"),
    ).toContainText("25 g");
    await expect(member.getByLabel("Amount")).toHaveValue("75");
    await member.getByRole("button", { name: "Save usage" }).click();
    await expect(member.getByRole("button", { name: /Spinach/ })).toContainText(
      "25 g",
    );
    await page.bringToFront();
    await page.clock.fastForward(30_000);
    await expect(ownerQuantity).toContainText("25 g");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
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
    await member.getByRole("combobox", { name: "Display language" }).click();
    await member.getByRole("option", { name: "ไทย", exact: true }).click();
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
  await go(page, "Settings");
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
  const records = page.getByRole("main").getByRole("listitem");
  await expect(records.filter({ hasText: "Added 100 g" })).toContainText(
    "Mali Santos",
  );
  await expect(records.filter({ hasText: "Used 75 g" })).toContainText(
    "Niran Lee",
  );
  await expect(records.filter({ hasText: "Discarded 25 g" })).toContainText(
    "Mali Santos",
  );
  await page.screenshot({
    path: info.outputPath("inventory-history.png"),
    fullPage: true,
  });
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
test("camera retries unreadable frames and automatically looks up a barcode once", async ({
  page,
}) => {
  await useTestCamera(page);
  await register(page, "camera" + suffix());
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();

  const digits = "012345678905";
  let reads = 0;
  let lookups = 0;
  let releaseFirstRead!: () => void;
  const firstRead = new Promise<void>((resolve) => {
    releaseFirstRead = resolve;
  });
  await page.route("**/api/barcodes/decode", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["content-type"]).toContain("multipart/form-data");
    expect(request.postData()).toContain(
      'name="photo"; filename="barcode.jpg"',
    );
    reads += 1;
    expect(lookups).toBe(0);
    if (reads === 1) {
      await firstRead;
      return route.fulfill({ json: digits }).catch(() => {});
    }
    if (reads === 2)
      return route.fulfill({
        status: 404,
        json: { code: "barcode_not_found" },
      });
    return route.fulfill({ json: digits });
  });
  await page.route("**/api/barcodes/" + digits + "?*", (route) => {
    expect(route.request().method()).toBe("GET");
    expect(new URL(route.request().url()).searchParams.get("language")).toBe(
      "en",
    );
    lookups += 1;
    return route.fulfill({
      headers: { "X-Barcode-Source": "https://example.com/rice" },
      json: { name: "Rice", brands: "Example", Quantity: 500, Unit: "g" },
    });
  });

  await page.getByRole("button", { name: "Add groceries" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Barcode", exact: true }).click();
  await dialog.getByRole("button", { name: "Scan barcode" }).click();
  await expect.poll(() => reads).toBe(1);
  const cancelled = page.waitForEvent("requestfailed", (request) =>
    request.url().endsWith("/api/barcodes/decode"),
  );
  await dialog.getByRole("button", { name: "Stop camera" }).click();
  await cancelled;
  releaseFirstRead();
  await expect(dialog.getByLabel("Barcode digits")).toHaveValue("");

  await dialog.getByRole("button", { name: "Scan barcode" }).click();
  await expect(dialog.getByLabel("Item name", { exact: true })).toHaveValue(
    "Rice",
  );
  await expect(dialog.getByLabel("Quantity")).toHaveValue("500");
  await expect(
    dialog.getByRole("combobox", { name: "Unit", exact: true }),
  ).toHaveValue("g");
  await expect(
    dialog.getByRole("link", { name: "Product source" }),
  ).toHaveAttribute("href", "https://example.com/rice");
  await expect(dialog.getByRole("button", { name: "Stop camera" })).toHaveCount(
    0,
  );
  expect(reads).toBe(3);
  expect(lookups).toBe(1);
});

test("photo intake, barcode review, pantry request preview, edit and removal", async ({
  page,
}, info) => {
  await useTestCamera(page);
  await register(page, "intake" + suffix());
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await test.step("Retry denied camera access and release the webcam on exit", () =>
    checkCameraAccess(page, info));
  await page.getByRole("button", { name: "Add groceries" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Photo", exact: true }).click();
  await dialog.screenshot({
    path: info.outputPath("grocery-photo-options.png"),
  });
  const picker = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Choose image" }).click();
  await (await picker).setFiles("public/kitchen.jpg");
  await expect(
    dialog.getByRole("img", { name: "Grocery photo preview" }),
  ).toBeVisible();
  await expect(dialog.locator("video")).toHaveCount(0);
  await page.route("**/api/photos/analyze", (route) =>
    route.fulfill({ status: 503, json: { code: "photo_unavailable" } }),
  );
  const analysis = page.waitForRequest("**/api/photos/analyze");
  await dialog.getByRole("button", { name: "Analyze photo" }).click();
  expect((await analysis).headers()["content-type"]).toContain(
    "multipart/form-data",
  );
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
        Quantity: 500,
        Unit: "g",
      },
    }),
  );
  await dialog.getByRole("button", { name: "Barcode", exact: true }).click();
  await dialog.getByLabel("Barcode digits").fill("12345678");
  await dialog.getByRole("button", { name: "Look up product" }).click();
  await expect(dialog.getByLabel("Item name", { exact: true })).toHaveValue(
    "Rice",
  );
  await expect(dialog.getByLabel("Quantity")).toHaveValue("500");
  await expect(
    dialog.getByRole("combobox", { name: "Unit", exact: true }),
  ).toHaveValue("g");
  await expect(dialog.getByText(/Example · 500 g/)).toBeVisible();
  await dialog.getByLabel("Quantity").fill("250");
  await dialog.getByLabel("Storage location").selectOption("pantry");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await go(page, "Meal ideas");
  await page.getByRole("button", { name: "Generate menu" }).click();
  await expect(
    page.getByRole("region", { name: "Request preview" }),
  ).toContainText("250 g");
  await go(page, "Inventory");
  await page.getByRole("button", { name: /Rice/ }).click();
  await dialog.getByRole("button", { name: "Edit entry" }).click();
  await dialog.getByLabel("Storage location").selectOption("other");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByRole("button", { name: /Rice/ })).toContainText(
    "Other",
  );
  await go(page, "Settings");
  await page.getByRole("combobox", { name: "Display language" }).click();
  await page.getByRole("option", { name: "ไทย", exact: true }).click();
  await go(page, "คลังอาหาร");
  await expect(page.getByRole("button", { name: /ข้าว/ })).toContainText(
    "250 กรัม",
  );
  await go(page, "การตั้งค่า");
  await page.getByRole("combobox", { name: "ภาษาที่แสดง" }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await go(page, "Inventory");
  await page.getByRole("button", { name: /Rice/ }).click();
  await dialog.getByRole("button", { name: "Remove entry" }).click();
  await dialog.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByText("Your pantry is empty")).toBeVisible();
});

async function checkCameraAccess(page: Page, info: TestInfo) {
  const viewport = page.viewportSize();
  await page.evaluate(() => {
    const open = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async () => {
      navigator.mediaDevices.getUserMedia = open;
      throw new DOMException("Camera access denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "Add groceries" }).click();
  const dialog = page.getByRole("dialog");
  const photo = dialog.getByRole("button", { name: "Photo", exact: true });
  const shutter = dialog.getByRole("button", { name: "Take photo" });
  await photo.click();
  const openCamera = dialog.getByRole("button", { name: "Open camera" });
  await openCamera.click();
  await expect(dialog.getByRole("alert")).toContainText("Camera unavailable");
  await expect(
    dialog.getByRole("button", { name: "Enter manually" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Choose image" }),
  ).toBeEnabled();
  await openCamera.click();
  await expect(shutter).toBeEnabled();
  const desktop = await cameraTrack(dialog);
  await dialog.screenshot({
    path: info.outputPath("grocery-camera-desktop.png"),
  });
  await dialog.getByRole("button", { name: "Manual", exact: true }).click();
  await expect
    .poll(() => desktop.evaluate((track) => track.readyState))
    .toBe("ended");
  await expect(dialog.getByLabel("Item name", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await photo.click();
  await openCamera.click();
  await expect(shutter).toBeEnabled();
  const mobile = await cameraTrack(dialog);
  await dialog.screenshot({
    path: info.outputPath("grocery-camera-mobile.png"),
  });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => mobile.evaluate((track) => track.readyState))
    .toBe("ended");
  if (viewport) await page.setViewportSize(viewport);
}

test("reviews photo suggestions and shows recipes with personal overrides", async ({
  page,
}, info) => {
  await useTestCamera(page);
  await register(page, "photo" + suffix());
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  const eggs = { en: "Chicken eggs", th: "ไข่ไก่" };
  let analyses = 0;
  await page.route("**/api/photos/analyze", async (route) => {
    analyses++;
    const image = (
      await new Response(Uint8Array.from(route.request().postDataBuffer()!), {
        headers: { "content-type": route.request().headers()["content-type"] },
      }).formData()
    ).get("photo") as File;
    expect(image.type).toBe("image/jpeg");
    expect(
      Array.from(new Uint8Array(await image.arrayBuffer()).slice(0, 3)),
    ).toEqual([255, 216, 255]);
    return route.fulfill({
      json: {
        suggestions: [
          { name: eggs, quantity: "6", unit: "each", expiry_date: null },
        ],
      },
    });
  });
  await page.getByRole("button", { name: "Add groceries" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Photo", exact: true }).click();
  await expect(dialog.locator("video")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Open camera" }).click();
  const shutter = dialog.getByRole("button", { name: "Take photo" });
  await expect(shutter).toBeEnabled();
  const track = await cameraTrack(dialog);
  await shutter.press("Enter");
  await expect(
    dialog.getByRole("img", { name: "Grocery photo preview" }),
  ).toBeVisible();
  await expect
    .poll(() => track.evaluate((track) => track.readyState))
    .toBe("ended");
  await dialog.getByRole("button", { name: "Retake photo" }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    dialog.getByRole("img", { name: "Grocery photo preview" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Retake photo" }).click();
  await shutter.click();
  expect(analyses).toBe(0);
  await dialog.getByRole("button", { name: "Analyze photo" }).click();
  await expect(
    dialog.getByLabel("Thai name (optional)", { exact: true }),
  ).toHaveValue(eggs.th);
  await expect(dialog.getByLabel("Quantity")).toHaveValue("6");
  await dialog.getByLabel("Price paid (optional, THB)").fill("30.00");
  expect(analyses).toBe(1);
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
  await page.getByRole("button", { name: "Stove", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stove", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const dish = {
    name: { en: "Eggs", th: "เมนูไข่" },
    ingredients: [
      { reference: "eggs", name: eggs, quantity: "2", unit: "each" },
    ],
    equipment: [],
    steps: [{ en: "Peel the cooked eggs.", th: "ปอกเปลือกไข่ต้ม" }],
  };
  await page.route("**/api/menus?*", (route) =>
    route.fulfill({
      json: [
        { id: "menu-1", created_at: new Date().toISOString(), dishes: [dish] },
      ],
    }),
  );
  await go(page, "Meal ideas");
  const generate = page.getByRole("button", { name: "Generate menu" });
  await expect(generate).toBeDisabled();
  await page.getByRole("button", { name: "Edit foods for this meal" }).click();
  const exclusions = page.getByRole("textbox", {
    name: "Foods to avoid",
    exact: true,
  });
  await expect(exclusions).toHaveValue(eggs.th);
  await exclusions.fill("Peanuts");
  await expect(page.getByLabel("Stove", { exact: true })).toBeChecked();
  await page.getByLabel("Stove", { exact: true }).uncheck();
  await page.getByLabel("Microwave", { exact: true }).check();
  const diet = page
    .locator("details")
    .filter({ has: page.getByText("Diet & nutrition", { exact: true }) });
  await diet.locator("summary").click();
  await diet.getByLabel("Vegan", { exact: true }).check();
  await diet.getByLabel("Other", { exact: true }).check();
  await diet.getByLabel("Other dietary style").fill("Dairy-free");
  await diet
    .getByRole("combobox", { name: "Nutrition goal", exact: true })
    .selectOption("other");
  await diet.getByLabel("Other nutrition goal").fill("More fiber");
  const cuisine = page
    .locator("details")
    .filter({ has: page.getByText("Cuisine & difficulty", { exact: true }) });
  await cuisine.locator("summary").click();
  await cuisine.getByLabel("Thai", { exact: true }).check();
  await cuisine.getByLabel("Japanese", { exact: true }).check();
  await cuisine.getByLabel("Easy", { exact: true }).check();
  await cuisine.getByLabel("Other", { exact: true }).check();
  await cuisine.getByLabel("Other cuisine").fill("Indian");
  await cuisine.locator("summary").click();
  await page.getByLabel("Maximum total time").selectOption("30");
  await page.getByRole("button", { name: "Fewer servings" }).click();
  await expect(
    page.getByRole("button", { name: "Fewer servings" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("meal-planner-desktop.png") });
  await page.route(
    "**/api/menus/recommendations",
    (route) =>
      route.fulfill({
        status: 503,
        json: { code: "database_unavailable" },
      }),
    { times: 1 },
  );
  await generate.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "database is unavailable",
  );
  let recipeRequests = 0;
  const description = { en: "Soft eggs served warm.", th: "ไข่เนื้อนุ่มเสิร์ฟอุ่น ๆ" };
  const secondDish = {
    ...dish,
    id: crypto.randomUUID(),
    name: { en: "Scrambled eggs", th: "ไข่คน" },
    ingredients: [{ name: eggs, quantity: "2", unit: "each" }],
    description: {
      en: "Soft curds of gently scrambled eggs.",
      th: "ไข่คนเนื้อเนียนนุ่ม",
    },
    steps: [{ en: "Stir the eggs as they cook.", th: "คนไข่จนสุก" }],
    equipment: ["Microwave"],
    minutes: 5,
    difficulty: "easy",
  };
  await page.route("**/api/menus/recommendations", async (route) => {
    recipeRequests++;
    expect(route.request().postDataJSON().generate).toBe(true);
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        status: "generated",
        recipes: [
          {
            ...dish,
            ingredients: [{ name: eggs, quantity: "2", unit: "each" }],
            description,
            equipment: ["Microwave"],
            minutes: 10,
            difficulty: "easy",
            estimated_price: "10.00",
            price_coverage: "full",
          },
          secondDish,
        ],
      },
    });
  });
  let imageRequests = 0;
  await page.route("**/api/menus/recommendations/image", async (route) => {
    imageRequests++;
    expect(route.request().postDataJSON()).toEqual({
      name: expect.stringMatching(/^(Eggs|Scrambled eggs)$/),
      ingredients: [eggs.en],
    });
    const image = await readFile("public/illustrations/dashboard.webp");
    await route.fulfill({ json: { webp_base64: image.toString("base64") } });
  });
  const result = page.waitForResponse((response) =>
    response.url().endsWith("/api/menus/recommendations"),
  );
  await generate.click();
  const preview = await (await result).json();
  expect(preview).toMatchObject({
    status: "generated",
    recipe_limit: 5,
    preferences: {
      servings: 3,
      dietary_styles: ["Vegan", "Dairy-free"],
      nutrition_goal: "More fiber",
      cuisines: ["Thai", "Japanese", "Indian"],
      difficulty: "easy",
      max_total_minutes: 30,
      foods_to_avoid: ["Peanuts"],
      equipment: ["Microwave"],
    },
    ingredients: [{ name_th: eggs.th, quantity: "6", unit: "each" }],
  });
  const planner = page.getByRole("region", { name: "Plan this meal" });
  const recipes = page.getByRole("region", { name: "Recommended recipes" });
  const cards = recipes.getByRole("article");
  await expect(recipes).toContainText("3 servings");
  await expect(cards).toHaveCount(2);
  await expect(recipes.getByRole("separator")).toBeVisible();
  await expect(cards.first()).toContainText(description.en);
  await expect(cards.last()).toContainText(secondDish.description.en);
  await expect(recipes.getByText(dish.steps[0].en)).toHaveCount(0);
  const plannerBox = (await planner.boundingBox())!;
  const recipesBox = (await recipes.boundingBox())!;
  expect(recipesBox.width).toBe(plannerBox.width);
  expect(recipesBox.y).toBeGreaterThanOrEqual(plannerBox.y + plannerBox.height);
  expect((await cards.first().boundingBox())!.y).toBe(
    (await cards.last().boundingBox())!.y,
  );
  await expect(
    page.getByRole("img", { name: `AI illustration of ${dish.name.en}` }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await recipes.evaluate((section) =>
    section.scrollIntoView({ block: "center" }),
  );
  await recipes.screenshot({
    path: info.outputPath("recipe-cards-desktop.png"),
  });
  const firstButton = cards
    .first()
    .getByRole("button", { name: dish.name.en, exact: true });
  await firstButton.press("Enter");
  const firstRecipe = page.getByRole("dialog", {
    name: dish.name.en,
    exact: true,
  });
  await expect(firstRecipe).toContainText(dish.steps[0].en);
  await expect(firstRecipe).toContainText(
    /Estimated cost\s+(?:฿|THB)\s*10\.00/,
  );
  await expect(firstRecipe).toContainText("3 servings");
  await expect(firstRecipe).toContainText("10 min");
  await expect(firstRecipe).toContainText("Easy");
  await expect(firstRecipe).toContainText("2 each");
  await expect(firstRecipe).toContainText("Microwave");
  const makeMeal = firstRecipe.getByRole("button", {
    name: "I made this menu",
  });
  await page.route(
    "**/api/menus/cooked",
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(204);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await makeMeal.click();
  await expect(firstRecipe.getByRole("alert")).toBeVisible();
  await makeMeal.click();
  await expect(firstRecipe.getByRole("status")).toContainText(
    "Ingredients deducted from inventory",
  );
  await expect(makeMeal).toBeDisabled();
  const stockAfterCooking = await page.request.get("/api/inventory");
  expect(await stockAfterCooking.json()).toMatchObject([
    { quantity: "4", unit: "each", price: "20.00" },
  ]);
  const usage = await (await page.request.get("/api/inventory-history")).json();
  expect(
    usage.filter((event: { kind: string }) => event.kind === "used"),
  ).toMatchObject([{ quantity: "2", unit: "each" }]);
  await firstRecipe.press("Escape");
  await expect(firstButton).toBeFocused();
  await cards.last().click({ position: { x: 30, y: 30 } });
  const secondRecipe = page.getByRole("dialog", { name: secondDish.name.en });
  await expect(secondRecipe).toContainText(secondDish.steps[0].en);
  await expect(
    secondRecipe.getByRole("button", { name: "I made this menu" }),
  ).toBeEnabled();
  await expect(secondRecipe).not.toContainText(dish.steps[0].en);
  await secondRecipe.screenshot({
    path: info.outputPath("recipe-detail-desktop.png"),
  });
  await secondRecipe.getByRole("button", { name: "Close" }).click();
  await go(page, "Settings");
  await page.getByRole("combobox", { name: "Display language" }).click();
  await page.getByRole("option", { name: "ไทย", exact: true }).click();
  await go(page, "ไอเดียมื้ออาหาร");
  await expect(
    page.getByRole("region", { name: "เมนูแนะนำ" }).getByText(description.th),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "เมนูแนะนำ" })).toContainText(
    "ไมโครเวฟ",
  );
  await expect(
    page.getByRole("img", { name: `ภาพประกอบเมนู ${dish.name.th} สร้างโดย AI` }),
  ).toBeVisible();
  expect(recipeRequests).toBe(1);
  expect(imageRequests).toBe(2);
  await expect(page.getByLabel("จำนวนที่เสิร์ฟ", { exact: true })).toHaveText("2");
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCards = page
    .getByRole("region", { name: "เมนูแนะนำ" })
    .getByRole("article");
  const firstBox = (await mobileCards.first().boundingBox())!;
  expect((await mobileCards.last().boundingBox())!.y).toBeGreaterThanOrEqual(
    firstBox.y + firstBox.height,
  );
  await mobileCards
    .first()
    .screenshot({ path: info.outputPath("recipe-card-mobile.png") });
  await mobileCards.first().getByRole("button", { name: dish.name.th }).click();
  const mobileRecipe = page.getByRole("dialog", { name: dish.name.th });
  await expect(mobileRecipe).toContainText(dish.steps[0].th);
  await expect(
    mobileRecipe.getByRole("button", { name: "ฉันทำเมนูนี้แล้ว" }),
  ).toBeDisabled();
  await mobileRecipe.getByRole("button", { name: "ปิด" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("meal-planner-mobile.png") });
  const cuisineToggle = page
    .locator("summary")
    .filter({ hasText: "สไตล์อาหารและความยาก" });
  await cuisineToggle.focus();
  await cuisineToggle.press("Enter");
  await expect(
    page.getByRole("checkbox", { name: "ไทย", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: "ทุกระดับ", exact: true }),
  ).toBeChecked();
  expect(
    await (await page.request.get("/api/preferences/foods-to-avoid")).json(),
  ).toEqual([{ id: expect.any(String), name: eggs.th }]);
  expect(await (await page.request.get("/api/equipment")).json()).toEqual([
    { id: expect.any(String), name: "Stove" },
  ]);
});
