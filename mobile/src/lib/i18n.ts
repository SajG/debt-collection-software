// Tiny in-memory i18n. English only today. Adding Hindi / Marathi is a
// matter of dropping a full copy of the `en` object into `dictionaries`
// under the new key — every string call goes through t() so nothing is
// hard-coded on the screens.
//
// A future upgrade path (context + AsyncStorage-persisted language +
// re-render on change) can slot in without touching call sites.

export type Language = "en" | "hi" | "mr";

const en = {
  "app.name": "Syncit",

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
  "home.filter.waiting": "Waiting for approval",
  "home.filter.active": "Active",
  "home.filter.dispatched": "Dispatched",
  "home.scope.mine": "My orders",
  "home.scope.all": "All orders",
  "home.placedBy": "by {name}",
  "home.empty.all": "No orders yet. Tap ‘New order’ to book one.",
  "home.empty.waiting": "No orders waiting for approval.",
  "home.empty.active": "No active orders right now.",
  "home.empty.dispatched": "No dispatched orders yet.",
  "home.pending": "Pending sync",
  "home.error": "Could not load orders. Pull to try again.",

  "status.ORDER_PLACED": "Placed",
  "status.IN_PRODUCTION": "In production",
  "status.ON_HOLD": "On hold",
  "status.READY_TO_DISPATCH": "Ready to dispatch",
  "status.LR_GENERATED": "LR generated",
  "status.PARTIALLY_DISPATCHED": "Partially dispatched",
  "status.DISPATCHED": "Dispatched",
  "status.DELIVERED": "Delivered",
  "status.PENDING_APPROVAL": "Awaiting approval",
  "status.REJECTED": "Rejected",
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

  "detail.rejected": "Order rejected",
  "detail.waitingApproval": "Waiting for director approval",
  "detail.waitingApprovalHint":
    "The factory cannot start until an admin approves this order.",
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
    "Your account is set up as {role}. Please use the Syncit web console on a computer.",
  "unsupported.signOut": "Sign out",

  "noProfile.title": "Account not ready",
  "noProfile.body":
    "Your account has not been fully set up yet. Please ask the office to finish it, then sign in again.",
  "noProfile.signOut": "Sign out",

  "loading": "Loading…",
  "retry": "Try again",

  // ── Factory + admin surfaces (moved off hardcoded strings) ────────
  "factory.title": "Factory · {name}",
  "factory.subtitle": "All salesperson orders. Tap a line to advance production.",
  "factory.tab.queue": "To produce",
  "factory.tab.inProd": "In progress",
  "factory.tab.ready": "Ready to dispatch",
  "factory.tab.dispatched": "Dispatched today",
  "factory.tab.blocked": "Blocked",
  "factory.group.byStage": "By stage",
  "factory.group.bySalesperson": "By salesperson",
  "factory.search": "Search",
  "factory.search.placeholder": "Order number, customer, salesperson",
  "factory.empty.queue": "Nothing waiting to produce.",
  "factory.empty.inProd": "Nothing on the shop floor right now.",
  "factory.empty.ready": "No orders packed and waiting to dispatch.",
  "factory.empty.dispatched": "No dispatches so far today.",
  "factory.empty.blocked": "Nothing blocked. All open orders can be worked on.",
  "factory.empty.search": "No matches. Try a different search term.",

  "detail.dispatchTo": "Dispatch to",
  "detail.expectedDelivery": "Expected delivery",
  "detail.expectedProduction": "Expected production date",
  "detail.tokenGift": "Token / Gift",
  "detail.callSalesperson": "Call {name}",
  "detail.lineItems": "Line items · {count}",

  "admin.title": "Management · {name}",
  "admin.subtitle": "Live command centre. Tap any tile to open the filtered list.",
  "admin.switchToStaff": "Sales view →",
  "admin.tile.today": "Placed today",
  "admin.tile.week": "Placed this week",
  "admin.tile.pending": "Awaiting MY approval",
  "admin.tile.rate": "Rate approvals pending",
  "admin.tile.overdue": "Overdue vs expected",
  "admin.tile.hold": "On hold",
  "admin.tile.dispatched": "Dispatched this month",

  // ── Queue-summary chip ────────────────────────────────────────────
  "queue.chip": "{count} waiting to sync",
  "queue.title": "Waiting to sync",
  "queue.retry": "Retry now",
  "queue.retrying": "Syncing…",
  "queue.online.hint": "Retrying automatically. Tap Retry now to push straight away.",
  "queue.offline.hint": "You're offline. Items will send automatically when you're back online.",
  "queue.orders": "Orders · {count}",
  "queue.status": "Status changes · {count}",
  "queue.documents": "Documents · {count}",

  // ── Errors (mirror lib/errors.ts categories) ──────────────────────
  "error.network": "No signal. Try again in a moment.",
  "error.queued": "Saved on your phone — will sync when you're back online.",
  "error.auth": "You've been signed out. Sign in again to continue.",
  "error.permission": "You don't have permission for that. Ask an admin.",
  "error.rate": "Too many attempts. Wait a minute and try again.",
  "error.unknown": "Something went wrong. Try again.",
} as const;

type Key = keyof typeof en;

// SY25 — Sales + Factory user-facing strings translated first.
// Anything not listed falls back to English via t()'s lookup.
// Reviewers with fluent hi/mr should sweep the sales flow monthly
// and top these up; type is Partial so missing keys aren't fatal.
const hi: Partial<Record<Key, string>> = {
  "app.name": "सिंकिट",

  "auth.phone.title": "साइन इन करें",
  "auth.phone.subtitle": "हम आपको 6-अंकों का कोड भेजेंगे।",
  "auth.phone.label": "आपका मोबाइल नंबर",
  "auth.phone.hint": "10 अंक का मोबाइल, कोड के बिना",
  "auth.phone.send": "कोड भेजें",
  "auth.phone.invalid": "मान्य 10-अंकीय मोबाइल नंबर दर्ज करें।",
  "auth.phone.error": "कोड नहीं भेजा जा सका। एक मिनट बाद पुनः प्रयास करें।",
  "auth.verify.title": "कोड डालें",
  "auth.verify.subtitle": "हमने {phone} पर कोड भेजा है।",
  "auth.verify.label": "6-अंकों का कोड",
  "auth.verify.submit": "साइन इन करें",
  "auth.verify.resend": "कोड फिर से भेजें",
  "auth.verify.resendIn": "{seconds} सेकंड में फिर भेजें",
  "auth.verify.change": "दूसरा नंबर उपयोग करें",
  "auth.verify.invalid": "यह कोड सही नहीं है। फिर कोशिश करें।",
  "auth.verify.error": "सत्यापित नहीं हो सका। फिर कोशिश करें।",

  "home.greeting": "नमस्ते, {name}",
  "home.subtitle": "आपके ऑर्डर, नए सबसे ऊपर।",
  "home.newOrder": "नया ऑर्डर",
  "home.signOut": "साइन आउट",
  "home.dues": "बकाया रकम",
  "home.filter.all": "सभी",
  "home.filter.waiting": "स्वीकृति की प्रतीक्षा में",
  "home.filter.active": "सक्रिय",
  "home.filter.dispatched": "भेजे गए",
  "home.scope.mine": "मेरे ऑर्डर",
  "home.scope.all": "सभी ऑर्डर",
  "home.placedBy": "{name} ने रखा",
  "home.empty.all": "अभी कोई ऑर्डर नहीं। ‘नया ऑर्डर’ दबाएं।",
  "home.empty.waiting": "कोई ऑर्डर स्वीकृति की प्रतीक्षा में नहीं।",
  "home.empty.active": "अभी कोई सक्रिय ऑर्डर नहीं।",
  "home.empty.dispatched": "अभी कोई डिस्पैच किया गया ऑर्डर नहीं।",
  "home.pending": "सिंक की प्रतीक्षा",
  "home.error": "ऑर्डर लोड नहीं हो सके। दोबारा खींचें।",

  "status.ORDER_PLACED": "प्लेस्ड",
  "status.IN_PRODUCTION": "उत्पादन में",
  "status.ON_HOLD": "रोक पर",
  "status.READY_TO_DISPATCH": "डिस्पैच के लिए तैयार",
  "status.LR_GENERATED": "LR तैयार",
  "status.PARTIALLY_DISPATCHED": "आंशिक डिस्पैच",
  "status.DISPATCHED": "डिस्पैच किया",
  "status.DELIVERED": "पहुँच गया",
  "status.PENDING_APPROVAL": "स्वीकृति की प्रतीक्षा",
  "status.REJECTED": "अस्वीकृत",
  "status.CANCELLED": "रद्द",

  "confirm.signOut.title": "साइन आउट करें?",
  "confirm.signOut.body": "आपको फिर से फोन से साइन इन करना होगा।",
  "confirm.cancel": "रद्द करें",
  "confirm.ok": "हां, साइन आउट",
  "confirm.discard.title": "यह ऑर्डर हटाएं?",
  "confirm.discard.body": "अभी तक भरी हुई सब जानकारी हट जाएगी।",
  "confirm.discard.ok": "हां, हटाएं",
  "confirm.submit.title": "यह ऑर्डर बुक करें?",
  "confirm.submit.body": "यह ऑर्डर ऑफिस को भेजेगा।",
  "confirm.submit.ok": "हां, बुक करें",

  "offline.banner": "आप ऑफलाइन हैं। ऑर्डर सेव होकर सिग्नल आने पर भेजे जाएंगे।",
  "offline.queued": "{count} ऑर्डर भेजने के लिए तैयार हैं।",

  "wizard.step": "चरण {n} / {total}",
  "wizard.back": "वापस",
  "wizard.next": "आगे",
  "wizard.startOver": "फिर से शुरू करें",

  "factory.title": "फैक्ट्री · {name}",
  "factory.subtitle": "सभी ऑर्डर। लाइन दबाकर स्थिति आगे बढ़ाएं।",
  "factory.tab.queue": "बनाना है",
  "factory.tab.inProd": "बन रहा है",
  "factory.tab.ready": "डिस्पैच के लिए तैयार",
  "factory.tab.dispatched": "आज भेजे",
  "factory.tab.blocked": "रुका हुआ",
  "factory.search": "खोजें",
  "factory.search.placeholder": "ऑर्डर नंबर, ग्राहक, सेल्समैन",
  "factory.empty.queue": "बनाने के लिए कुछ नहीं।",
  "factory.empty.inProd": "अभी फ्लोर पर कुछ नहीं।",
  "factory.empty.ready": "डिस्पैच के लिए तैयार कुछ नहीं।",
  "factory.empty.dispatched": "आज कोई डिस्पैच नहीं।",
  "factory.empty.blocked": "कुछ भी रुका नहीं। सब ऑर्डर पर काम हो सकता है।",
  "factory.empty.search": "कुछ नहीं मिला। दूसरा शब्द आज़माएं।",

  "admin.title": "मैनेजमेंट · {name}",
  "admin.subtitle": "लाइव कमांड सेंटर। किसी भी टाइल पर टैप करें।",
  "admin.switchToStaff": "सेल्स दृश्य →",

  "error.network": "नेटवर्क नहीं है। थोड़ी देर में फिर कोशिश करें।",
  "error.queued": "फोन में सेव है — नेटवर्क आने पर भेज देंगे।",
  "error.auth": "आप साइन आउट हो गए हैं। फिर से साइन इन करें।",
  "error.permission": "आपको यह अनुमति नहीं है। एडमिन से पूछें।",
  "error.rate": "बहुत अधिक कोशिशें। एक मिनट रुककर फिर कोशिश करें।",
  "error.unknown": "कुछ गड़बड़ हुई। फिर कोशिश करें।",
};

const mr: Partial<Record<Key, string>> = {
  "app.name": "सिंकिट",

  "auth.phone.title": "साइन इन करा",
  "auth.phone.subtitle": "आम्ही तुम्हाला 6 अंकी कोड पाठवू.",
  "auth.phone.label": "तुमचा मोबाइल नंबर",
  "auth.phone.hint": "10 अंकी मोबाइल, कोडशिवाय",
  "auth.phone.send": "कोड पाठवा",
  "auth.phone.invalid": "10 अंकी वैध मोबाइल नंबर टाका.",
  "auth.phone.error": "कोड पाठवता आला नाही. एका मिनिटानंतर पुन्हा पहा.",
  "auth.verify.title": "कोड टाका",
  "auth.verify.subtitle": "{phone} वर कोड पाठवला आहे.",
  "auth.verify.label": "6 अंकी कोड",
  "auth.verify.submit": "साइन इन करा",
  "auth.verify.resend": "कोड पुन्हा पाठवा",
  "auth.verify.resendIn": "{seconds} सेकंदांत पुन्हा पाठवा",
  "auth.verify.change": "वेगळा नंबर वापरा",
  "auth.verify.invalid": "हा कोड बरोबर नाही. पुन्हा प्रयत्न करा.",
  "auth.verify.error": "पडताळणी झाली नाही. पुन्हा प्रयत्न करा.",

  "home.greeting": "नमस्कार, {name}",
  "home.subtitle": "तुमचे ऑर्डर, नवीन प्रथम.",
  "home.newOrder": "नवीन ऑर्डर",
  "home.signOut": "साइन आउट",
  "home.dues": "ग्राहक येणे",
  "home.filter.all": "सर्व",
  "home.filter.waiting": "मंजुरीच्या प्रतीक्षेत",
  "home.filter.active": "सक्रिय",
  "home.filter.dispatched": "पाठवले",
  "home.scope.mine": "माझे ऑर्डर",
  "home.scope.all": "सर्व ऑर्डर",
  "home.placedBy": "{name} यांनी ठेवला",
  "home.empty.all": "अजून ऑर्डर नाही. ‘नवीन ऑर्डर’ दाबा.",
  "home.empty.waiting": "मंजुरीसाठी कोणताही ऑर्डर नाही.",
  "home.empty.active": "आत्ता सक्रिय ऑर्डर नाही.",
  "home.empty.dispatched": "अजून पाठवलेले ऑर्डर नाही.",
  "home.pending": "सिंक होण्याच्या प्रतीक्षेत",
  "home.error": "ऑर्डर लोड झाले नाहीत. पुन्हा खेचून पहा.",

  "status.ORDER_PLACED": "प्लेस्ड",
  "status.IN_PRODUCTION": "उत्पादनात",
  "status.ON_HOLD": "थांबवले",
  "status.READY_TO_DISPATCH": "पाठवण्यास तयार",
  "status.LR_GENERATED": "LR तयार",
  "status.PARTIALLY_DISPATCHED": "अर्धवट पाठवले",
  "status.DISPATCHED": "पाठवले",
  "status.DELIVERED": "पोहोचले",
  "status.PENDING_APPROVAL": "मंजुरीच्या प्रतीक्षेत",
  "status.REJECTED": "नाकारले",
  "status.CANCELLED": "रद्द",

  "confirm.signOut.title": "साइन आउट करायचे?",
  "confirm.signOut.body": "पुन्हा फोनवरून साइन इन करावे लागेल.",
  "confirm.cancel": "रद्द करा",
  "confirm.ok": "हो, साइन आउट",
  "confirm.discard.title": "हा ऑर्डर टाकून द्यायचा?",
  "confirm.discard.body": "आतापर्यंत भरलेले सर्व निघून जाईल.",
  "confirm.discard.ok": "हो, टाकून द्या",
  "confirm.submit.title": "हा ऑर्डर बुक करायचा?",
  "confirm.submit.body": "हा ऑर्डर ऑफिसला पाठवला जाईल.",
  "confirm.submit.ok": "हो, बुक करा",

  "offline.banner": "तुम्ही ऑफलाइन आहात. ऑर्डर सेव्ह करून सिग्नल आल्यावर पाठवू.",
  "offline.queued": "{count} ऑर्डर पाठवायचे आहेत.",

  "wizard.step": "पायरी {n} / {total}",
  "wizard.back": "मागे",
  "wizard.next": "पुढे",
  "wizard.startOver": "पुन्हा सुरू",

  "factory.title": "फॅक्टरी · {name}",
  "factory.subtitle": "सर्व ऑर्डर. ओळ दाबून स्थिती पुढे करा.",
  "factory.tab.queue": "बनवायचे",
  "factory.tab.inProd": "बनत आहे",
  "factory.tab.ready": "पाठवण्यास तयार",
  "factory.tab.dispatched": "आज पाठवले",
  "factory.tab.blocked": "अडकलेले",
  "factory.search": "शोधा",
  "factory.search.placeholder": "ऑर्डर नंबर, ग्राहक, विक्रेता",
  "factory.empty.queue": "बनवण्यासाठी काही नाही.",
  "factory.empty.inProd": "आत्ता फ्लोअरवर काही नाही.",
  "factory.empty.ready": "पाठवण्यास तयार असे काही नाही.",
  "factory.empty.dispatched": "आज कोणतेही डिस्पॅच नाही.",
  "factory.empty.blocked": "काहीच अडकलेले नाही.",
  "factory.empty.search": "काही सापडले नाही.",

  "admin.title": "मॅनेजमेंट · {name}",
  "admin.subtitle": "लाइव्ह कमांड सेंटर. कोणत्याही टाइलवर टॅप करा.",
  "admin.switchToStaff": "सेल्स व्ह्यू →",

  "error.network": "नेटवर्क नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.",
  "error.queued": "फोनवर सेव्ह आहे — नेटवर्क आल्यावर पाठवू.",
  "error.auth": "तुम्ही साइन आउट झाला आहात. पुन्हा साइन इन करा.",
  "error.permission": "तुम्हाला ही परवानगी नाही. ॲडमिनला विचारा.",
  "error.rate": "खूप वेळा प्रयत्न. एक मिनिट थांबून पुन्हा पहा.",
  "error.unknown": "काहीतरी बिघडले. पुन्हा प्रयत्न करा.",
};

// hi/mr fall back to English for any missing key.
const dictionaries: Record<Language, Partial<Record<Key, string>>> = {
  en,
  hi,
  mr,
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

// Persist across launches. Reads on module load; failures leave
// current='en' unchanged. Every setLanguage() call also writes.
const STORAGE_KEY = "syncit:language";
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const asyncStorage: {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
} = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    return require("@react-native-async-storage/async-storage").default;
  } catch {
    return {
      getItem: async () => null,
      setItem: async () => undefined,
    };
  }
})();

void (async () => {
  try {
    const stored = await asyncStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "hi" || stored === "mr") {
      current = stored;
    }
  } catch {
    /* keep default */
  }
})();

/** Compat alias — the original API expected setLocale/getLocale. */
export const setLocale = (lang: Language) => {
  void asyncStorage.setItem(STORAGE_KEY, lang).catch(() => undefined);
  setLanguage(lang);
};
export const getLocale = getLanguage;
