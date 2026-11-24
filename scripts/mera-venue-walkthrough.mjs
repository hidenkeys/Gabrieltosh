/** Operator-run synthetic portfolio checks. Never run against production.
 * CREDENTIALS is read only; credentials, cookies and preview tokens are never logged.
 * The checklist's transaction journeys are inspected through seeded history; this
 * runner does not settle bills, change stock, launch venues or send messages.
 */
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { buildVenuePortfolio } from "../server/mera/venue-portfolio.js";
const require = createRequire(import.meta.url);
let chromium;
const base = process.env.BASE_URL || "http://127.0.0.1:3011";
const destination = path.resolve("docs/audit/venues");
const checks = [],
  portfolio = buildVenuePortfolio();
let shots = 0,
  browser;
let credentials;
await mkdir(destination, { recursive: true });
async function check(venue, name, fn) {
  try {
    await fn();
    checks.push({
      venue,
      check: name,
      pass: true,
      notes: "Verified through the rendered UI.",
    });
  } catch (error) {
    checks.push({
      venue,
      check: name,
      pass: false,
      notes:
        error?.name === "TimeoutError"
          ? "UI timed out; inspect the named screen and selectors."
          : "Assertion or UI action failed; inspect this check in the runner.",
    });
  }
}
async function navigation(page) {
  const toggle = page.getByRole("button", {
    name: "Workspace menu",
    exact: true,
  });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  return page.getByRole("navigation", {
    name: "Organization workspace",
    exact: true,
  });
}
async function go(page, name) {
  const nav = await navigation(page);
  let target = nav.getByRole("tab", { name, exact: true });
  if (!(await target.isVisible())) {
    const more = nav.getByRole("button", { name: /^More/ });
    if (
      (await more.isVisible()) &&
      (await more.getAttribute("aria-expanded")) !== "true"
    )
      await more.click();
  }
  await target.click();
}
async function snapshot(page, venue, screen) {
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(() => document.fonts.ready);
    await check(
      venue,
      `${screen}: no horizontal overflow at ${width}`,
      async () => {
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
      },
    );
    if (width !== 820 && shots < 60) {
      await page.screenshot({
        path: path.join(destination, `${venue}-${screen}-${width}.png`),
        fullPage: true,
      });
      shots++;
    }
  }
}
function observe(context, errors, network) {
  context.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/^Failed to load resource: the server responded with a status of (403|409)\b/.test(
        message.text(),
      )
    )
      errors.push("Browser console error");
  });
  context.on("weberror", () => errors.push("Uncaught browser error"));
  context.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED")
      network.push("Network request failed");
  });
  context.on("response", (response) => {
    if (
      (response.status() < 200 || response.status() >= 300) &&
      ![403, 409].includes(response.status())
    )
      network.push(`HTTP ${response.status()}`);
  });
}
async function login(org, role) {
  const credential = credentials.find(
    (c) => c.username === `${org.slug}.${role}@example.test`,
  );
  assert(credential, "Missing role credential");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [],
    network = [];
  observe(context, errors, network);
  try {
    await page.goto(new URL("/mera/sign-in", base).href);
    await page
      .getByRole("textbox", { name: "Username", exact: true })
      .fill(credential.username);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credential.password);
    await page
      .getByRole("button", { name: "Open workspace", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Branch", exact: true }).waitFor();
    return { page, context, errors, network };
  } catch (error) {
    await context.close();
    throw error;
  }
}
async function location(page, code) {
  const box = page.getByRole("combobox", { name: "Branch", exact: true });
  await box.fill(code);
  await page
    .getByRole("option")
    .filter({ hasText: new RegExp(`\\b${code}\\b`) })
    .click();
}
try {
  ({
    chromium,
  } = require("/private/tmp/claude-503/pw/node_modules/playwright"));
  try {
    credentials = JSON.parse(
      await readFile(
        process.env.CREDENTIALS ||
          "/private/tmp/claude-503/mera-venues-credentials.json",
        "utf8",
      ),
    ).credentials;
    if (!Array.isArray(credentials)) throw Error();
  } catch {
    throw Error(
      "Private credentials could not be loaded; check the file path and structure.",
    );
  }

  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const org of portfolio) {
    const venue = org.slug;
    for (const role of org.users.map((u) => u.role)) {
      let session;
      await check(
        venue,
        `${role}: real UI sign-in and authorized location codes`,
        async () => {
          session = await login(org, role);
          const { page } = session;
          await page
            .getByRole("combobox", { name: "Branch", exact: true })
            .click();
          const expected =
            role === "owner" || role === "finance" || role === "central_stock"
              ? org.branches
              : role === "area_manager" ||
                  (venue === "kerbside-grill" && role === "branch_manager")
                ? org.branches.slice(0, 2)
                : org.branches.slice(0, 1);
          for (const branch of expected)
            await page
              .getByRole("option")
              .filter({ hasText: new RegExp(`\\b${branch.code}\\b`) })
              .waitFor();
          await page.keyboard.press("Escape");
        },
      );
      if (!session) continue;
      const { page, context, errors, network } = session;
      try {
        if (role === "owner") {
          await check(
            venue,
            "venue capability navigation and All locations",
            async () => {
              const nav = await navigation(page);
              const caps = org.branches[0].settings.capabilities;
              for (const [label, required] of [
                ["Tables & visits", "table_service"],
                ["Reservations", "reservations"],
                ["Door & guest list", "guest_list"],
              ])
                assert.equal(
                  await nav
                    .getByRole("tab", { name: label, exact: true })
                    .count(),
                  caps.includes(required) ? 1 : 0,
                );
              if (venue === "kerbside-grill") {
                assert.equal(
                  await nav
                    .getByRole("tab", { name: "Tables & visits", exact: true })
                    .count(),
                  0,
                );
                assert.equal(
                  await nav
                    .getByRole("tab", { name: "Reservations", exact: true })
                    .count(),
                  0,
                );
              }
              if (venue === "pulse") {
                await go(page, "Door & guest list");
                await page
                  .getByRole("heading", {
                    name: "Door & guest list",
                    exact: true,
                  })
                  .waitFor();
              }
              if (venue === "harbour-hotel") {
                await go(page, "Stock transfers");
                await page
                  .getByRole("heading", {
                    name: "Transfer history",
                    exact: true,
                  })
                  .waitFor();
              }
              await go(page, "All locations");
              await page.locator(".mw-location-totals dd").first().waitFor();
              const totals = await page
                .locator(".mw-location-totals dd")
                .allTextContents();
              assert(Number(totals[0].replace(/[^\d.]/g, "")) > 0);
              assert(Number(totals[1].replace(/[^\d.]/g, "")) > 0);
            },
          );
          await snapshot(page, venue, "all-locations");
          if (venue === "kerbside-grill")
            await check(
              venue,
              "SUR/LKI main price override and independent stock",
              async () => {
                const observations = [];
                for (const code of ["SUR", "LKI"]) {
                  await location(page, code);
                  await go(page, "Menu & stock");
                  const row = page.locator(".mw-menu-product-row").filter({
                    has: page.getByText("Grilled main", { exact: true }),
                  });
                  await row.waitFor();
                  if (observations.length)
                    await page.waitForFunction(
                      (previous) =>
                        [
                          ...document.querySelectorAll(".mw-menu-product-row"),
                        ].find(
                          (r) =>
                            r.querySelector("b")?.textContent ===
                            "Grilled main",
                        )?.textContent !== previous,
                      observations[0].text,
                    );
                  observations.push({
                    text: await row.textContent(),
                    price: await row
                      .locator(".mw-menu-product-identity small")
                      .textContent(),
                    stock: await row.locator(".mw-pill").textContent(),
                  });
                }
                assert.notEqual(observations[0].price, observations[1].price);
                assert.notEqual(observations[0].stock, observations[1].stock);
              },
            );
          await check(
            venue,
            "QR URL and phone preview with orders off",
            async () => {
              await location(page, org.branches[0].code);
              await go(page, "Menu QR codes");
              const preview = page.getByRole("region", {
                name: "QR link preview",
                exact: true,
              });
              await preview
                .getByRole("link", { name: "Open in new tab", exact: true })
                .waitFor();
              const url = await preview
                .getByRole("link", { name: "Open in new tab", exact: true })
                .getAttribute("href");
              assert(new URL(url).searchParams.has("preview"));
              assert(
                (
                  await preview.locator(".mw-qr-destination").textContent()
                ).includes(url),
              );
              await page
                .frameLocator('iframe[title="Guest menu preview"]')
                .getByText("Preview - orders are off", { exact: true })
                .waitFor();
            },
          );
          await snapshot(page, venue, "qr-preview");
          // Inspect seeded journey destinations without mutating their financial state.
          const destinations = [
            "Overview",
            "Orders",
            "Transactions",
            "Shifts & cash",
          ];
          if (!["kerbside-grill"].includes(venue))
            destinations.push("Tables & visits");
          if (
            [
              "saffron-room",
              "velvet-lounge",
              "pulse",
              "harbour-hotel",
            ].includes(venue)
          )
            destinations.push("Reservations");
          if (venue === "pulse") destinations.push("Door & guest list");
          if (venue === "harbour-hotel") destinations.push("Stock transfers");
          for (const name of destinations)
            await check(
              venue,
              `Journey checklist: inspect ${name}`,
              async () => {
                await go(page, name);
                await page.locator("main").first().waitFor();
              },
            );
          if (venue === "harbour-hotel")
            await check(venue, "Charge to room payment choice", async () => {
              await go(page, "Transactions");
              await page.getByText("Charge to room", { exact: true }).waitFor();
            });
          await check(
            venue,
            "Getting started: venue cards and guided steps (no Go live)",
            async () => {
              await go(page, "Getting started");
              const resume = page.getByRole("button", {
                name: "Resume guided setup",
                exact: true,
              });
              if (await resume.isVisible()) await resume.click();
              const steps = page.getByRole("navigation", {
                name: "Owner setup steps",
                exact: true,
              });
              for (const name of [
                "Account",
                "Your business",
                "Kind of venue",
                "Locations",
                "Payments",
                "Review & go live",
              ])
                await steps
                  .getByRole("button", { name, exact: true })
                  .waitFor();
              // Continue only through account/business to reveal venue choices; never launch.
              for (
                let i = 0;
                i < 3 &&
                !(await page
                  .getByRole("radiogroup", {
                    name: "Kind of venue",
                    exact: true,
                  })
                  .isVisible());
                i++
              ) {
                const target = steps.getByRole("button", {
                  name: "Kind of venue",
                  exact: true,
                });
                if (await target.isEnabled()) await target.click();
                else
                  await page
                    .getByRole("button", { name: "Continue", exact: true })
                    .click();
              }
              assert.equal(
                await page
                  .getByRole("radiogroup", {
                    name: "Kind of venue",
                    exact: true,
                  })
                  .getByRole("radio")
                  .count(),
                7,
              );
            },
          );
          await snapshot(page, venue, "getting-started");
        }
        if (venue === "kerbside-grill" && role === "cashier")
          await check(venue, "SUR cashier cannot reach LKI", async () => {
            await page
              .getByRole("combobox", { name: "Branch", exact: true })
              .fill("LKI");
            assert.equal(await page.getByRole("option").count(), 0);
            await page.keyboard.press("Escape");
            // A UI-originated fetch proves the server boundary as well as the hidden option.
            const status = await page.evaluate(
              async ({ org, id }) =>
                (
                  await fetch(
                    `/api/mera/v1/organizations/${org}/branches/${id}/orders`,
                  )
                ).status,
              { org: org.id, id: org.branches[1].id },
            );
            assert.equal(status, 403);
          });
        if (venue === "kerbside-grill" && role === "branch_manager")
          await check(venue, "SUR manager becomes LKI cashier", async () => {
            await location(page, "SUR");
            await go(page, "Menu & stock");
            await location(page, "LKI");
            const nav = await navigation(page);
            assert.equal(
              await nav
                .getByRole("tab", { name: "Menu & stock", exact: true })
                .count(),
              0,
            );
          });
      } finally {
        await context.close();
        checks.push({
          venue,
          check: `${role}: console and network`,
          pass: !errors.length && !network.length,
          notes:
            [...errors, ...network].join("; ") ||
            "No console errors or unexpected failed requests.",
        });
      }
    }
    // Counter guest menu checks use a fresh context, never a staff preview token.
    await check(
      venue,
      "counter QR: package table requirement and combo min/max sheet",
      async () => {
        const context = await browser.newContext();
        const errors = [],
          network = [];
        observe(context, errors, network);
        try {
          const page = await context.newPage();
          await page.goto(
            new URL(`/mera/menu/${org.slug}/${org.branches[0].id}`, base).href,
          );
          await page
            .getByRole("region", { name: "Products", exact: true })
            .waitFor();
          if (!org.branches[0].settings.capabilities.includes("qr_ordering")) {
            assert(
              await page
                .getByRole("button", {
                  name: "Choose: Main + side + drink",
                  exact: true,
                })
                .isDisabled(),
            );
            if (["pulse", "velvet-lounge"].includes(venue))
              assert(
                await page
                  .getByRole("button", { name: /^Choose: Bottle service:/ })
                  .isDisabled(),
              );
            return;
          }
          if (["pulse", "velvet-lounge"].includes(venue)) {
            const pack = page.getByRole("button", {
              name: /^Choose: Bottle service:/,
            });
            await pack.waitFor();
            assert(await pack.isDisabled());
          }
          const combo = page.getByRole("button", {
            name: "Choose: Main + side + drink",
            exact: true,
          });
          assert(
            await combo.isEnabled(),
            "Ordering must be on to exercise combo constraints",
          );
          await combo.click();
          const dialog = page.getByRole("dialog");
          const add = dialog.getByRole("button", {
            name: "Add to basket",
            exact: true,
          });
          assert(await add.isDisabled());
          for (const name of ["Main", "Side", "Drink"]) {
            const group = dialog.getByRole("group", {
              name: `${name} · choose 1–1`,
              exact: true,
            });
            await group.getByRole("checkbox").first().check();
            assert.equal(
              await group.getByRole("checkbox", { checked: true }).count(),
              1,
            );
            for (const box of await group
              .getByRole("checkbox", { checked: false })
              .all())
              assert(await box.isDisabled());
          }
          assert(await add.isEnabled());
          await dialog
            .getByRole("group", { name: "Main · choose 1–1", exact: true })
            .getByRole("checkbox")
            .first()
            .uncheck();
          assert(await add.isDisabled());
          await snapshot(page, venue, "combo");
        } finally {
          await context.close();
          checks.push({
            venue,
            check: "Guest menu: console and network",
            pass: !errors.length && !network.length,
            notes:
              [...errors, ...network].join("; ") ||
              "No console errors or unexpected failed requests.",
          });
        }
      },
    );
  }
} catch {
  checks.push({
    venue: "runner",
    check: "walkthrough execution",
    pass: false,
    notes:
      "Runner could not complete. Check local server and private Playwright installation.",
  });
} finally {
  await browser?.close();
  await writeFile(
    path.join(destination, "walkthrough.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        screenshots: shots,
        scope:
          "UI assertions and seeded journey inspection; transaction journeys require operator completion.",
        checks,
      },
      null,
      2,
    ) + "\n",
  );
}
const failed = checks.filter((c) => !c.pass).length;
console.log(
  `Venue walkthrough: ${checks.length - failed} passed, ${failed} failed; ${shots} screenshots.`,
);
process.exitCode = failed ? 1 : 0;
