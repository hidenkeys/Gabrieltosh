// Venue types, capabilities and location helpers. Contract: docs/mera/venues/SPEC.md.
export const VENUE_TYPES = [
  "quick_service",
  "cafe",
  "casual_dining",
  "reservation_restaurant",
  "lounge",
  "club",
  "hotel_fb",
];

export const CAPABILITIES = [
  "counter_ordering",
  "qr_ordering",
  "pickup_alerts",
  "table_service",
  "open_tabs",
  "split_bills",
  "reservations",
  "deposits",
  "minimum_spend",
  "waitlist",
  "prep_stations",
  "guest_list",
  "room_charge",
];

export const CAPABILITY_LABELS = {
  counter_ordering: "Order at the counter",
  qr_ordering: "Order from a QR code",
  pickup_alerts: "Ready-for-pickup alerts",
  table_service: "Table service",
  open_tabs: "Open tabs",
  split_bills: "Split bills",
  reservations: "Reservations",
  deposits: "Booking deposits",
  minimum_spend: "Minimum spend",
  waitlist: "Walk-in waitlist",
  prep_stations: "Kitchen and bar screens",
  guest_list: "Door and guest list",
  room_charge: "Charge to room",
};

const daily = [0, 1, 2, 3, 4, 5, 6];
const w = (days, start, end) => ({ days, start, end });

export const TYPE_DEFAULTS = {
  quick_service: {
    label: "Quick service & takeout",
    bestFor: "Counters, kiosks, pickup and food courts",
    youGet: [
      "Order at the counter or by QR",
      "Ready-for-pickup alerts",
      "Kitchen and bar screens",
    ],
    differentBecause: "No tables or bills. Guests pay first and collect fast.",
    capabilities: ["counter_ordering", "qr_ordering", "pickup_alerts", "prep_stations"],
    hours: [w(daily, "08:00", "22:00")],
    cutoff: 0,
  },
  cafe: {
    label: "Café",
    bestFor: "Coffee, tea, bakery and bubble tea",
    youGet: [
      "Order at the counter or from the table",
      "Pickup alerts and drink stickers",
      "Light seating without bills",
    ],
    differentBecause: "Short visits. Guests order and pay first, then sit if they like.",
    capabilities: ["counter_ordering", "qr_ordering", "pickup_alerts", "prep_stations"],
    hours: [w(daily, "07:00", "20:00")],
    cutoff: 0,
  },
  casual_dining: {
    label: "Casual dining restaurant",
    bestFor: "Sit-down restaurants",
    youGet: ["Table service and running bills", "Split bills", "Walk-in waitlist"],
    differentBecause: "Guests are seated and pay at the end. Bills grow during the visit.",
    capabilities: ["qr_ordering", "table_service", "split_bills", "prep_stations", "waitlist"],
    hours: [w(daily, "11:00", "23:00")],
    cutoff: 0,
  },
  reservation_restaurant: {
    label: "Reservation-led restaurant",
    bestFor: "Fine dining and set menus",
    youGet: ["Bookings by time slot", "Deposits and cancellation rules", "Front desk"],
    differentBecause: "The day is planned around bookings. Deposits protect against no-shows.",
    capabilities: [
      "table_service",
      "split_bills",
      "reservations",
      "deposits",
      "prep_stations",
      "waitlist",
    ],
    hours: [w([0, 2, 3, 4, 5, 6], "12:00", "23:00")],
    cutoff: 0,
  },
  lounge: {
    label: "Lounge",
    bestFor: "Lounges, shisha and rooftop bars",
    youGet: ["Open tabs per table", "Minimum spend by section", "Table bookings"],
    differentBecause: "Long stays on one running tab, often past midnight.",
    capabilities: [
      "qr_ordering",
      "table_service",
      "open_tabs",
      "split_bills",
      "minimum_spend",
      "reservations",
      "prep_stations",
    ],
    hours: [w(daily, "16:00", "23:59"), w(daily, "00:00", "02:00")],
    cutoff: 360,
  },
  club: {
    label: "Club & nightlife",
    bestFor: "Clubs and events",
    youGet: ["VIP table bookings and bottle packages", "Minimum spend and deposits", "Door and guest list"],
    differentBecause: "Revenue comes from table packages and entry. The night runs past midnight.",
    capabilities: [
      "table_service",
      "open_tabs",
      "minimum_spend",
      "reservations",
      "deposits",
      "guest_list",
      "prep_stations",
    ],
    hours: [w(daily, "22:00", "23:59"), w(daily, "00:00", "05:00")],
    cutoff: 420,
  },
  hotel_fb: {
    label: "Hotel food & beverage",
    bestFor: "Hotel restaurants, pool bars and room service",
    youGet: ["Several outlets under one property", "Charge to room", "Table bookings"],
    differentBecause: "One property, many outlets, often supplied from one store room.",
    capabilities: [
      "qr_ordering",
      "table_service",
      "split_bills",
      "reservations",
      "room_charge",
      "prep_stations",
    ],
    hours: [w(daily, "06:30", "23:00")],
    cutoff: 0,
  },
};

export const LEGACY_MODE_TO_CAPABILITIES = {
  counter_takeaway: ["counter_ordering", "qr_ordering", "pickup_alerts"],
  table_service: ["table_service", "split_bills", "prep_stations"],
  reservations: ["reservations"],
  lounge_club: ["open_tabs", "minimum_spend"],
};

const order = (caps) => CAPABILITIES.filter((c) => caps.includes(c));

export function capabilitiesFromLegacyModes(modes = []) {
  const out = new Set();
  for (const mode of modes) for (const c of LEGACY_MODE_TO_CAPABILITIES[mode] || []) out.add(c);
  return order([...out]);
}

export function capabilitiesToLegacyModes(caps = []) {
  const has = new Set(caps);
  return Object.entries(LEGACY_MODE_TO_CAPABILITIES)
    .filter(([, list]) => list.some((c) => has.has(c)))
    .map(([mode]) => mode)
    .sort();
}

export function effectiveCapabilities(settings = {}) {
  if (Array.isArray(settings.capabilities)) return order(settings.capabilities);
  return capabilitiesFromLegacyModes(
    Array.isArray(settings.serviceModes) ? settings.serviceModes : ["counter_takeaway"],
  );
}

export function deriveVenueType(settings = {}) {
  if (VENUE_TYPES.includes(settings.venueType)) return settings.venueType;
  const modes = Array.isArray(settings.serviceModes) ? settings.serviceModes : [];
  if (modes.includes("lounge_club")) return "lounge";
  if (modes.includes("reservations")) return "reservation_restaurant";
  if (modes.includes("table_service")) return "casual_dining";
  return "quick_service";
}

export function hasCapability(settings, capability) {
  return effectiveCapabilities(settings).includes(capability);
}

// Workspace section -> any-of capabilities. Sections not listed are always shown.
export const CAPABILITY_SECTIONS = {
  tables: ["table_service"],
  reservations: ["reservations"],
  waitlist: ["waitlist", "reservations"],
  door: ["guest_list"],
};

export function sectionEnabled(section, caps = []) {
  const need = CAPABILITY_SECTIONS[section];
  return !need || need.some((c) => caps.includes(c));
}

export const LOCATION_COLORS = ["forest", "lime", "clay", "ocean", "plum", "sun", "stone", "rose"];
export const LOCATION_ROLES = ["outlet", "stock_room"];
export const LOCATION_COUNTS = ["one", "few", "many"];
export const MENU_MODES = ["shared", "per_location"];
export const INVENTORY_MODES = ["per_location", "central"];
export const ITEM_KINDS = ["single", "package", "combo"];

export function defaultLocationCode(name = "", taken = []) {
  let base =
    String(name)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3) || "LOC";
  base = base.padEnd(2, "X");
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const code = `${base.slice(0, 3)}${i}`.slice(0, 5);
    if (!used.has(code)) return code;
  }
  return base;
}
