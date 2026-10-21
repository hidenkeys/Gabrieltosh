import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "./db.js";
export const defaultReceipt = {
  businessName: "BING CHUN",
  subtitle: "A little joy in every cup.",
  address: "75A Bode Thomas Street, Surulere, Lagos 101241",
  phone: "0901 758 2027",
  footer: "Thank you. Come back for something lovely.",
  showLogo: true,
  showStaff: true,
  showOptions: true,
  showPayment: true,
  showCode: true,
  headingSize: "large",
  align: "center",
  paperWidth: 58,
  labelWidth: 50,
  labelHeight: 30,
  labelShowStaff: false,
};
const rows = [
  [
    "C6",
    "Strawberry Coconut Jasmine Milk Tea",
    "Fruit milk tea",
    3800,
    "700 ml",
  ],
  ["C9", "Lychee Jasmine Milk Tea", "Fruit milk tea", 3800, "700 ml"],
  ["C11", "Original Milk Tea", "Fruit milk tea", 3200, "700 ml"],
  ["C3", "Coconut Milk Tea", "Fruit milk tea", 3800, "700 ml"],
  ["C2", "Brown Sugar Boba Milk Tea", "Fruit milk tea", 3800, "700 ml"],
  ["B6", "Blueberry Fruit Tea", "Fresh fruit tea", 3200, "500 ml"],
  ["B1", "Fresh Lemonade Juice", "Fresh fruit tea", 1500, "700 ml"],
  ["B3", "Jasmine Honey Tea", "Fresh fruit tea", 2200, "700 ml"],
  ["B4", "Lemon Green Tea", "Fresh fruit tea", 2700, "700 ml"],
  ["B5", "Lemon Black Tea", "Fresh fruit tea", 2700, "700 ml"],
  ["B7", "Lychee Jasmine Tea", "Fresh fruit tea", 2700, "700 ml"],
  ["B8", "Grapes Crystal Tea", "Fresh fruit tea", 3800, "700 ml"],
  ["B2", "Strawberry Lemon Tea", "Fresh fruit tea", 3200, "700 ml"],
  ["B16", "Mulberry Popping Pearls Juice", "Fresh fruit tea", 3200, "700 ml"],
  ["B9", "Strawberry Mulberry Tea", "Fresh fruit tea", 3800, "700 ml"],
  ["A1", "Original Ice Cream", "Ice cream series", 1000, ""],
  ["A32", "Chocolate Ice Cream", "Ice cream series", 1500, ""],
  ["A33", "Chocolate Mix Ice Cream", "Ice cream series", 1500, ""],
  ["A5", "Strawberry Sundae", "Ice cream series", 3200, "12 oz"],
  ["A6", "Blueberry Sundae", "Ice cream series", 3200, "12 oz"],
  ["A15", "Mulberry Sundae", "Ice cream series", 3200, "12 oz"],
  ["A4", "Brown Sugar Bubble Sundae", "Ice cream series", 3800, "12 oz"],
  ["A9", "Chocolate Biscuit Sundae", "Ice cream series", 3800, "12 oz"],
  ["A10", "Chocolate Oreo Sundae", "Ice cream series", 4300, "12 oz"],
  ["A34", "Chocolate Boba Sundae", "Ice cream series", 3800, "12 oz"],
  ["G17", "Chocolate Milkshake", "Ice cream series", 3800, "500 ml"],
  ["H1", "Strawberry Smoothie", "Smoothie series", 3200, "500 ml"],
  ["H6", "Blueberry Smoothie", "Smoothie series", 3200, "500 ml"],
  ["H8", "Grape Smoothie", "Smoothie series", 3800, "500 ml"],
  ["H7", "Cocoa Smoothie", "Smoothie series", 3200, "500 ml"],
  ["X2", "Coconut Jelly", "Toppings", 500, "50 g"],
  ["X1", "Boba", "Toppings", 500, "40 g"],
  ["X3", "Jelly", "Toppings", 500, "50 g"],
  ["X4", "Crystals", "Toppings", 500, "35 g"],
];
export async function seed() {
  for (const [key, value] of Object.entries({
    receipt: defaultReceipt,
    business: {
      name: "Bing Chun",
      branch: "Surulere",
      address: defaultReceipt.address,
      phone: defaultReceipt.phone,
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
    worker: { online: false, mode: process.env.PRINT_MODE || "simulation" },
  }))
    await query(
      "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING",
      [key, JSON.stringify(value)],
    );
  // Upgrade only the old scaffold defaults. Preserve customised receipt content and sales.
  if (
    !(await query("SELECT key FROM settings WHERE key='surulere_brand_v1'"))
      .rows.length
  ) {
    const receipt = (
      await query("SELECT value FROM settings WHERE key='receipt'")
    ).rows[0].value;
    const updated = { ...receipt, showLogo: receipt.showLogo ?? true };
    if (
      ["Set your store address", "Your store address"].includes(receipt.address)
    )
      updated.address = defaultReceipt.address;
    if (!receipt.phone) updated.phone = defaultReceipt.phone;
    await query("UPDATE settings SET value=$1 WHERE key='receipt'", [
      JSON.stringify(updated),
    ]);
    const business = (
      await query("SELECT value FROM settings WHERE key='business'")
    ).rows[0].value;
    await query("UPDATE settings SET value=$1 WHERE key='business'", [
      JSON.stringify({
        ...business,
        branch: "Surulere",
        address: defaultReceipt.address,
        phone: defaultReceipt.phone,
      }),
    ]);
    await query(
      "INSERT INTO settings(key,value) VALUES('surulere_brand_v1',$1) ON CONFLICT(key) DO NOTHING",
      [JSON.stringify({ applied: true })],
    );
  }
  if (!(await query("SELECT id FROM products LIMIT 1")).rows.length)
    for (const [code, name, category, naira, size] of rows) {
      const options =
        category === "Fruit milk tea" ||
        category === "Fresh fruit tea" ||
        category === "Smoothie series";
      await query(
        "INSERT INTO products(id,code,name,category,price,size,label_required,options) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          randomUUID(),
          code,
          name,
          category,
          naira * 100,
          size,
          category !== "Toppings",
          options,
        ],
      );
    }
}
export async function createAdmin(name, username, password) {
  if ((await query("SELECT id FROM users LIMIT 1")).rows.length)
    throw new Error(
      "An account already exists. Use the admin workspace to create users.",
    );
  if (password.length < 10)
    throw new Error("Use a password of at least 10 characters.");
  await query(
    "INSERT INTO users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5)",
    [
      randomUUID(),
      name,
      username.toLowerCase(),
      await bcrypt.hash(password, 12),
      "admin",
    ],
  );
}
