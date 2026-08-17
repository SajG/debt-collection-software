// Tiny in-memory i18n. English only today. Adding Hindi / Marathi is a
// matter of dropping a full copy of the `en` object into `dictionaries`
// under the new key — every string call goes through t() so nothing is
// hard-coded on the screens.
//
// A future upgrade path (context + AsyncStorage-persisted language +
// re-render on change) can slot in without touching call sites.

export type Language = "en" | "hi" | "mr";

const en = {
  "app.name": "PayTrack Sales",

  "auth.phone.title": "Sign in",
  "auth.phone.subtitle": "We will text you a 6-digit code.",
  "auth.phone.label": "Your phone number",
  "auth.phone.hint": "10-digit mobile, no country code",
  "auth.phone.send": "Send code",
  "auth.phone.invalid": "Enter a valid 10-digit mobile number.",
  "auth.phone.error": "Could not send code. Try again in a minute.",

  "auth.verify.title": "Enter the code",
  "auth.verify.subtitle": "We texted a code to {phone}.",
  "auth.verify.label": "6-digit code",
  "auth.verify.submit": "Verify and sign in",
  "auth.verify.resend": "Resend code",
  "auth.verify.resendIn": "Resend in {seconds}s",
  "auth.verify.change": "Use a different number",
  "auth.verify.invalid": "That code is not right. Try again.",
  "auth.verify.error": "Could not verify. Try again.",

  "home.greeting": "Namaste, {name}",
  "home.subtitle": "Your orders, newest first.",
  "home.newOrder": "New order",
  "home.signOut": "Sign out",
  "home.dues": "Customer dues",
  "home.filter.all": "All",
  "home.filter.active": "Active",
  "home.filter.dispatched": "Dispatched",
  "home.scope.mine": "My orders",
  "home.scope.all": "All orders",
  "home.placedBy": "by {name}",
  "home.empty.all": "No orders yet. Tap ‘New order’ to book one.",
  "home.empty.active": "No active orders right now.",
  "home.empty.dispatched": "No dispatched orders yet.",
  "home.pending": "Pending sync",
  "home.error": "Could not load orders. Pull to try again.",

  "status.ORDER_PLACED": "Placed",
  "status.IN_PRODUCTION": "In production",
  "status.READY_TO_DISPATCH": "Ready to dispatch",
  "status.LR_GENERATED": "LR generated",
  "status.DISPATCHED": "Dispatched",
  "status.CANCELLED": "Cancelled",

  "confirm.signOut.title": "Sign out?",
  "confirm.signOut.body": "You will need to sign in again with your phone.",
  "confirm.cancel": "Cancel",
  "confirm.ok": "Yes, sign out",
  "confirm.discard.title": "Discard this order?",
  "confirm.discard.body": "Everything you have entered so far will be lost.",
  "confirm.discard.ok": "Yes, discard",
  "confirm.submit.title": "Book this order?",
  "confirm.submit.body": "This sends the order to the office.",
  "confirm.submit.ok": "Yes, book it",

  "offline.banner": "You are offline. Orders will be saved and sent when signal returns.",
  "offline.queued": "{count} order(s) waiting to be sent.",

  "wizard.step": "Step {n} of {total}",
  "wizard.back": "Back",
  "wizard.next": "Next",
  "wizard.startOver": "Start over",

  "wizard.customer.title": "Who is this order for?",
  "wizard.customer.search": "Search by name",
  "wizard.customer.empty": "No customers match. Ask office to add.",
  "wizard.customer.selected": "Selected: {name}",

  "wizard.brand.title": "Which brand?",

  "wizard.product.title": "Which product?",
  "wizard.product.noBrand": "Pick a brand first.",

  "wizard.quantity.title": "How much?",
  "wizard.quantity.enter": "Enter quantity",
  "wizard.quantity.unit": "Unit",
  "wizard.quantity.invalid": "Enter a quantity greater than zero.",

  "wizard.packing.title": "Packing and size",
  "wizard.packing.pack": "Packing",
  "wizard.packing.size": "Size (kg)",
  "wizard.packing.custom": "Type your own",
  "wizard.packing.customPack": "Type packing name",
  "wizard.packing.customSize": "Type size in kg",

  "wizard.rate.title": "What rate?",
  "wizard.rate.hint": "Write it however you say it — e.g. 125++, last rate + 15/-",

  "wizard.terms.title": "Payment and transport",
  "wizard.terms.payment": "Payment terms",
  "wizard.terms.transport": "Transport",

  "wizard.delivery.title": "When should it be delivered?",
  "wizard.delivery.default": "Tomorrow is the default. Change if needed.",
  "wizard.delivery.pick": "Change date",

  "wizard.notes.title": "Anything else?",
  "wizard.notes.label": "Notes (optional)",
  "wizard.notes.skip": "Skip",

  "wizard.review.title": "Check the order",
  "wizard.review.customer": "Customer",
  "wizard.review.product": "Product",
  "wizard.review.brand": "Brand",
  "wizard.review.quantity": "Quantity",
  "wizard.review.packing": "Packing",
  "wizard.review.size": "Size",
  "wizard.review.rate": "Rate",
  "wizard.review.payment": "Payment terms",
  "wizard.review.transport": "Transport",
  "wizard.review.delivery": "Expected delivery",
  "wizard.review.notes": "Notes",
  "wizard.review.submit": "Book order",
  "wizard.review.submitting": "Sending…",
  "wizard.review.submittedOnline": "Order sent to office.",
  "wizard.review.submittedOffline":
    "You are offline. Order saved on this phone and will send when signal returns.",
  "wizard.review.error": "Could not book order. Try again.",
  "wizard.review.missing": "Please complete every step first.",
  "wizard.review.change": "Change",

  "detail.title": "Order",
  "detail.customer": "Customer",
  "detail.product": "Product",
  "detail.quantity": "Quantity",
  "detail.rate": "Rate",
  "detail.payment": "Payment",
  "detail.transport": "Transport",
  "detail.expected": "Expected delivery",
  "detail.notes": "Notes",
  "detail.timeline": "Progress",
  "detail.futureStep": "Coming up",
  "detail.byLine": "by {name}",
  "detail.notFound": "Order not found.",

  "dues.title": "Customer dues",
  "dues.subtitle": "Search a customer to see what they owe.",
  "dues.search": "Search customers",
  "dues.total": "Total outstanding",
  "dues.invoices": "Unpaid invoices",
  "dues.overdue": "{days} days overdue",
  "dues.dueOn": "Due {date}",
  "dues.empty": "No unpaid invoices.",
  "dues.updated": "Tally last synced {time}",
  "dues.updatedNever": "Not yet synced from Tally",
  "dues.pickCustomer": "Pick a customer above to see dues.",

  "unsupported.title": "This app is for salespeople",
  "unsupported.body":
    "Your account is set up as {role}. Please use the PayTrack web console on a computer.",
  "unsupported.signOut": "Sign out",

  "noProfile.title": "Account not ready",
  "noProfile.body":
    "Your account has not been fully set up yet. Please ask the office to finish it, then sign in again.",
  "noProfile.signOut": "Sign out",

  "loading": "Loading…",
  "retry": "Try again",
} as const;

type Key = keyof typeof en;

const dictionaries: Record<Language, Record<Key, string>> = {
  en,
  // Placeholder maps — every key falls back to English until translations
  // are provided. Do not remove; keeps the type contract honest.
  hi: en,
  mr: en,
};

let current: Language = "en";

export function setLanguage(lang: Language) {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  const template = dictionaries[current][key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined ? `{${k}}` : String(v);
  });
}
