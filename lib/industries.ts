// SY38 — /industries/[slug]. Each entry is written from how that trade
// actually runs an order from enquiry to payment: its own vocabulary,
// its own places where things go wrong, and what Syncit does at each
// of those points. Nothing here is shared boilerplate — if you add an
// industry, write it the same way.

export type Industry = {
  slug: string;
  /** Short name for breadcrumbs and links. */
  name: string;
  title: string;
  description: string;
  intro: string;
  /** How the trade describes itself — sets the scene. */
  day: string;
  pains: { title: string; body: string }[];
  /** Order → cash, step by step, in this trade's terms. */
  workflow: { step: string; trade: string; syncit: string }[];
  /** Words this trade uses and where they live in Syncit. */
  terms: { word: string; meaning: string }[];
  faq: { q: string; a: string }[];
  related: { href: string; label: string }[];
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "adhesives-chemicals",
    name: "Adhesives & chemicals",
    title: "Order-to-cash for adhesive and chemical manufacturers",
    description:
      "How adhesive, sealant and construction-chemical makers run dealer orders, drum-and-bucket packing, private label, dispatch and dealer credit in Syncit.",
    intro:
      "An adhesive order is never just a product and a quantity. It is a grade, a brand, a packing, a size, a token scheme and a rate the salesperson agreed at the counter.",
    day: "Your salesperson visits plywood and hardware dealers. The dealer says: forty buckets of the waterproof grade, twenty-kilo, with the carpenter token, same rate as last time plus fifteen. That travels to the factory as a WhatsApp message, and from there into someone's notebook.",
    pains: [
      {
        title: "The same product in twelve packings",
        body: "50 kg drums, 20 kg buckets, 1 kg jars in a box of twelve, pouches in a drum of sixty. One wrong word in a WhatsApp order and the factory fills the wrong one.",
      },
      {
        title: "Rates that live in the salesperson's head",
        body: "\"Last rate plus fifteen\" and \"125 plus plus\" mean something to the person who agreed them. The factory dispatches; accounts discover the rate was below cost a month later.",
      },
      {
        title: "Private label and tokens",
        body: "The same grade goes out under your brand, the dealer's brand, with a barcode token, with the customer's own token, or with a gift inside. Miss it and the whole lot comes back.",
      },
      {
        title: "Dealers who buy every week and pay every quarter",
        body: "A dealer with four open bills orders again. Nobody at the factory knows he is over his limit until the lorry has left.",
      },
    ],
    workflow: [
      {
        step: "Order at the dealer's counter",
        trade: "Grade, brand, packing, size, token, rate and where to deliver — all in one go, often with no signal in the market.",
        syncit: "The salesperson picks the dealer, then each line: brand, grade (by name or grade code), quantity, packing, size and rate exactly as agreed. Last time's delivery place, terms and token are pre-filled. It saves offline and sends itself later. Repeat last month's order in two taps.",
      },
      {
        step: "Check before the factory starts",
        trade: "Is the rate above the floor for that grade? Is the dealer within his credit?",
        syncit: "A line under the product's floor rate, or an order that takes the dealer over his limit, is flagged to the salesperson before placing and lands in management's approvals. The factory sees nothing until it is approved.",
      },
      {
        step: "Batch and fill",
        trade: "A four-line order is rarely made together — the D3 grade is in the reactor today, the hotmelt tomorrow.",
        syncit: "The factory marks each line started and ready on its own. The order moves to dispatch only when every line is ready. An expected production date tells sales what to say to the dealer.",
      },
      {
        step: "Dispatch",
        trade: "Drums by transport, to-pay or paid, to the dealer's godown or direct to a site.",
        syncit: "Factory photographs the invoice and LR and marks dispatched. The salesperson is notified and can forward the LR to the dealer from the phone.",
      },
      {
        step: "Follow-up",
        trade: "Thirty to forty-five days, in practice sixty. Dealers pay when the salesperson visits.",
        syncit: "Each salesperson's Today list ranks their dealers by amount and days overdue. Call, send a polite WhatsApp reminder, note the date promised, record the payment with a photo of the UTR or cheque — all from the dealer's row.",
      },
    ],
    terms: [
      { word: "Grade code", meaning: "The factory's code for a product (searchable alongside the marketing name)." },
      { word: "Plus plus", meaning: "Rate before GST and freight — typed in the rate field exactly as said." },
      { word: "Token / gift", meaning: "Scheme printed or packed with the goods; a required choice on every order." },
      { word: "Private label", meaning: "Customer's own brand; the brand name is typed on the line." },
      { word: "Floor rate", meaning: "Minimum rate per product; anything lower needs approval." },
    ],
    faq: [
      {
        q: "Can we keep our own list of brands and packings?",
        a: "Yes. Brands, packings and products are set per company, with a free-text option for anything unusual on a given order.",
      },
      {
        q: "Can the factory be stopped from seeing rates?",
        a: "Yes. Factory users do not see rates unless management allows it.",
      },
      {
        q: "We sell through dealers and also direct to furniture factories. Does it handle both?",
        a: "Yes. Both are customers with their own credit limit and credit period; direct customers usually get a different delivery place on each order.",
      },
      {
        q: "Does it work with Tally?",
        a: "Yes. Dealers, bills and receipts come from Tally through a small connector, so the outstanding your salespeople see is the one in your books.",
      },
    ],
    related: [
      { href: "/help/place-an-order", label: "Placing an order, step by step" },
      { href: "/help/credit-limits", label: "Credit limits and floor rates" },
      { href: "/blog/how-to-reduce-dso-for-a-manufacturing-business", label: "Reducing DSO in a manufacturing business" },
      { href: "/industries/paints", label: "Syncit for paint manufacturers" },
    ],
  },
  {
    slug: "paints",
    name: "Paints & coatings",
    title: "Order-to-cash for paint and coating manufacturers",
    description:
      "How regional paint, primer, putty and coating makers handle dealer orders by shade and pack size, season peaks, damage claims and dealer outstanding in Syncit.",
    intro:
      "Paint is sold by shade and by pack. A dealer's order is thirty lines long, half of it one-litre tins, and all of it wanted before the festival.",
    day: "From August the phones do not stop. Every dealer wants stock before Diwali, every painter wants the shade that is out, and every order is a photograph of a handwritten list. By November the goods are sold and the money is still in the market.",
    pains: [
      {
        title: "Thirty lines, four pack sizes each",
        body: "Emulsion in 1, 4, 10 and 20 litres, primer, putty in 20 and 40 kg bags, a few stainers. Typing that from a photo of a list is where mistakes start.",
      },
      {
        title: "Season stock goes out on trust",
        body: "Pre-season billing is large and on long credit. In the rush nobody checks that a dealer still has last season's bills open.",
      },
      {
        title: "Leakage and dented tins",
        body: "Damage in transit is routine. The dealer deducts it himself from the next payment, and the ledger never agrees again.",
      },
      {
        title: "Schemes settle at year-end",
        body: "Quantity and turnover schemes are paid as credit notes months later. Dealers hold back payment \"until the scheme is adjusted\".",
      },
    ],
    workflow: [
      {
        step: "Dealer order",
        trade: "Shade, product and pack size, line after line, with a season delivery date.",
        syncit: "Lines are added from your own product list with pack size and quantity per line; the same basket can be repeated next week with only the quantities changed. The expected delivery date sits on the order where the factory can see it.",
      },
      {
        step: "Approval in season",
        trade: "Large pre-season orders against old outstanding.",
        syncit: "Every order shows the dealer's outstanding plus this order against his limit. Management approves or rejects with a reason from the phone, so a big order is a decision and not an accident.",
      },
      {
        step: "Production and tinting",
        trade: "Base is made in bulk; shades are tinted and filled per order, so lines finish at different times.",
        syncit: "Each line is marked ready separately. When stock of a base runs short, the order is put on hold with the reason, and the salesperson sees it without phoning.",
      },
      {
        step: "Dispatch and damage",
        trade: "Mixed loads by transport; dents and leaks reported days later.",
        syncit: "LR and invoice photos are attached at dispatch. A damage claim is settled as a credit note against that invoice, so the bill's pending amount drops and the dealer's statement shows it clearly.",
      },
      {
        step: "Getting paid after the season",
        trade: "Sixty to ninety days in practice, with scheme adjustments pending.",
        syncit: "Send the dealer a statement of account — invoices, payments, credit notes, running balance, ageing — as a PDF from the phone. Reminders go before the due date; promises are recorded and the ones missed come back to the top.",
      },
    ],
    terms: [
      { word: "Pack size", meaning: "1 L, 4 L, 10 L, 20 L, 20 kg — the size field on each order line." },
      { word: "Base and shade", meaning: "Entered as the product on the line; uncommon shades can be typed." },
      { word: "Scheme credit", meaning: "A credit note against an invoice; reduces what is pending." },
      { word: "Season billing", meaning: "Orders with a later expected delivery date and longer credit days." },
    ],
    faq: [
      {
        q: "Our dealers send orders as a photo of a list. Does that change?",
        a: "The salesperson enters the lines once, in the app, at the counter. After the first order, repeating and editing the same basket is far quicker than re-typing a photo.",
      },
      {
        q: "How do we handle damage deductions?",
        a: "Issue a credit note against the invoice. It shows on the dealer's statement and reduces the bill's pending amount, so the dealer's figure and yours agree.",
      },
      {
        q: "Can management see season exposure per dealer?",
        a: "Yes. Outstanding, overdue and the oldest bill are visible per dealer and per salesperson, and a weekly email lists the ten most overdue.",
      },
      {
        q: "Do painters or contractors use the app?",
        a: "No. Syncit is for your own sales team, factory and management.",
      },
    ],
    related: [
      { href: "/help/payment-reminders", label: "How reminders and statements work" },
      { href: "/tools/outstanding-ageing-template", label: "Outstanding ageing template" },
      { href: "/blog/polite-payment-reminder-messages-english-hindi", label: "Reminder messages in English and Hindi" },
      { href: "/industries/adhesives-chemicals", label: "Syncit for adhesive manufacturers" },
    ],
  },
  {
    slug: "pipes-fittings",
    name: "Pipes & fittings",
    title: "Order-to-cash for pipe and fitting manufacturers",
    description:
      "How PVC, CPVC and HDPE pipe and fitting makers manage price-list discounts, resin-driven rate changes, bulky dispatch and project credit in Syncit.",
    intro:
      "In pipes, the price changes with resin, the truck fills by volume before weight, and one contractor's project can be a quarter of the month's sales.",
    day: "A dealer orders two hundred lengths across six sizes and a carton of fittings, at list less his discount. Resin went up on Monday. Was this order booked before or after? The lorry can take only half of it. And the contractor who took the last load has not paid for the one before.",
    pains: [
      {
        title: "Which price list was it?",
        body: "Rates move with PVC resin, sometimes twice a month. Orders booked at the old price and dispatched after the revision cause an argument every time.",
      },
      {
        title: "Part loads",
        body: "Pipes are bulky. An order goes in two or three lorries over a week, and nobody is sure what is still pending.",
      },
      {
        title: "Sizes and classes",
        body: "110 mm at 4 kg or 6 kg pressure, SWR or agri, ring-fit or solvent. A wrong class is a returned truck.",
      },
      {
        title: "Project credit",
        body: "Contractors and builders buy large and pay when their own bills clear. One slow project distorts the whole outstanding.",
      },
    ],
    workflow: [
      {
        step: "Booking",
        trade: "Sizes, class and quantity per item, at list less discount, with the date it was booked.",
        syncit: "Each line carries its own rate as agreed and the order carries its booking time, so \"before or after the revision\" is answered by the order itself. Edits before dispatch are recorded on the timeline with who changed what.",
      },
      {
        step: "Rate check",
        trade: "Discounts beyond the slab need the owner's nod.",
        syncit: "Set a floor rate per product. Anything below it is flagged for approval before the factory sees the order.",
      },
      {
        step: "Extrusion and stock",
        trade: "Fast-moving sizes from stock, the rest scheduled on the line.",
        syncit: "Lines available now are marked ready while others stay in production; stock from Tally shows what is on the floor.",
      },
      {
        step: "Dispatch in part loads",
        trade: "First lorry today, balance when the next size is off the line; freight paid or to-pay.",
        syncit: "Each lorry is a dispatch lot with its own quantity and LR. The order shows partially dispatched until the balance goes, and sales can see exactly what is pending.",
      },
      {
        step: "Payment",
        trade: "Dealers at 30 days, projects at whatever was negotiated.",
        syncit: "Credit days and limit are set per customer, so a project's 60 days does not make a dealer's 30 look late. Ageing by salesperson shows where the money is stuck; statements go out as PDF with a pay-now link.",
      },
    ],
    terms: [
      { word: "List less discount", meaning: "Enter the net rate on the line; the floor rate guards the lowest net." },
      { word: "Class / pressure rating", meaning: "Part of the product name or size, so it prints on the order." },
      { word: "Part load", meaning: "A dispatch lot — quantity, LR number and date per lorry." },
      { word: "To-pay / paid", meaning: "The transport field on every order." },
    ],
    faq: [
      {
        q: "Can one order be dispatched in several lorries?",
        a: "Yes. Each dispatch is recorded with its quantity and LR, and the order stays partially dispatched until it is complete.",
      },
      {
        q: "How do we handle a price revision?",
        a: "Orders keep the rate they were booked at, with the time of booking. New orders use the new rate. Update the floor rates when the list changes.",
      },
      {
        q: "Can project customers have longer credit than dealers?",
        a: "Yes. Credit days and credit limit are per customer.",
      },
      {
        q: "Does it replace our ERP or Tally?",
        a: "No. Accounting stays in Tally. Syncit handles the order, the factory's progress, dispatch documents and payment follow-up, and reads bills and receipts from Tally.",
      },
    ],
    related: [
      { href: "/help/factory-workflow", label: "The factory's three lists" },
      { href: "/help/approvals", label: "Approvals and floor rates" },
      { href: "/tools/dso-calculator", label: "DSO calculator" },
      { href: "/industries/electrical", label: "Syncit for electrical manufacturers" },
    ],
  },
  {
    slug: "electrical",
    name: "Electrical goods",
    title: "Order-to-cash for wire, cable and electrical manufacturers",
    description:
      "How wire, cable, switchgear and lighting makers manage copper-linked pricing, coil and box quantities, project orders and distributor credit in Syncit.",
    intro:
      "Copper moves every day, a coil is ninety metres, and the distributor wants yesterday's rate on tomorrow's delivery.",
    day: "A distributor books two hundred coils across four sizes of house wire and some switchgear. The rate is good until Friday. A contractor wants cable cut to length for a site, against a bill of quantities. Dispatch is from two godowns. Payment is thirty days — unless it is a government project.",
    pains: [
      {
        title: "Rates valid for days, not months",
        body: "Wire and cable prices follow copper and aluminium. An order confirmed on WhatsApp at one rate and invoiced at another is a credit note waiting to happen.",
      },
      {
        title: "Coils, boxes and metres",
        body: "House wire by the coil, armoured cable by the metre, switches by the box. Units get mixed up between the salesperson's message and the store.",
      },
      {
        title: "Projects against a BOQ",
        body: "Site orders come in pieces over months, each needing the site name and the contractor's reference.",
      },
      {
        title: "Replacement and warranty returns",
        body: "Returned pieces are adjusted informally and the distributor's account drifts from yours.",
      },
    ],
    workflow: [
      {
        step: "Booking at a rate",
        trade: "Size, colour, coil count and the rate agreed, valid for a few days.",
        syncit: "Rate and quantity are per line with the unit (pieces, numbers or kilos), and the order records when it was booked and by whom. The dealer can be shown the confirmed order rather than a chat message.",
      },
      {
        step: "Management check",
        trade: "Below-list rates and large orders need a senior's approval the same day.",
        syncit: "Approvals arrive on the manager's phone with the reason; one swipe approves. If an order waits more than half an hour, the manager is nudged.",
      },
      {
        step: "Make or pick",
        trade: "Standard sizes from stock; special cable drawn to order.",
        syncit: "Stock lines are marked ready at once, made-to-order lines when they come off the machine. The expected production date tells the salesperson what to promise the site.",
      },
      {
        step: "Dispatch to distributor or site",
        trade: "Different delivery address per order, often a project site.",
        syncit: "Delivery location is on every order, with notes for the site contact. Invoice and LR photos are attached; the salesperson shares them with the contractor straight away.",
      },
      {
        step: "Payment",
        trade: "Distributors at 30 days; contractors when their running bill is paid.",
        syncit: "The Today list shows who to call. When a contractor says \"after the 20th\", that promise is recorded — and if the 20th passes, he is back at the top and visible to management.",
      },
    ],
    terms: [
      { word: "Coil / box / metre", meaning: "Quantity with its unit on each line." },
      { word: "Rate validity", meaning: "The booking time on the order; approval notes record any exception." },
      { word: "Site / project", meaning: "The delivery location and notes on the order." },
      { word: "Replacement", meaning: "A credit note against the original invoice." },
    ],
    faq: [
      {
        q: "Can we record the site and contractor reference on an order?",
        a: "Yes. Each order has its own delivery location and notes, which the factory and dispatch see.",
      },
      {
        q: "How do we stop orders below the day's rate?",
        a: "Set floor rates per product and update them when prices move. Lines below the floor go for approval.",
      },
      {
        q: "We have several salespeople covering the same city. Who sees which distributor?",
        a: "Each customer is assigned to one salesperson, who is the only one to see its orders and outstanding. Management sees all.",
      },
      {
        q: "Can a distributor pay online from a reminder?",
        a: "Yes, if you add your Razorpay keys. Reminders and statements then carry a pay-now link for UPI, card or net banking.",
      },
    ],
    related: [
      { href: "/help/approvals", label: "How approvals work" },
      { href: "/help/roles-explained", label: "Who sees what" },
      { href: "/blog/msme-45-day-payment-rule-43bh-for-distributors", label: "The 45-day MSME payment rule" },
      { href: "/industries/pipes-fittings", label: "Syncit for pipe manufacturers" },
    ],
  },
  {
    slug: "fmcg-distribution",
    name: "FMCG distribution",
    title: "Order-to-cash for FMCG distributors and stockists",
    description:
      "How FMCG distributors and super-stockists run beat orders, godown dispatch, short retailer credit, returns and salesman-wise outstanding in Syncit.",
    intro:
      "A distributor's money is not stuck in ten big bills. It is stuck in four hundred small ones, spread across beats, each a week or two old.",
    day: "Salesmen leave at nine with their beat. Each shop gives a small order and pays for last week's — or says \"next round\". By evening there are sixty orders to pick, forty bills to deliver tomorrow, and a bag of cash and cheques nobody has matched to bills.",
    pains: [
      {
        title: "Hundreds of small bills",
        body: "Retailers get seven to fourteen days. With four hundred open bills, nobody knows which shop has crossed two rounds without paying.",
      },
      {
        title: "Cash and cheques with no bill reference",
        body: "The salesman collects from fifteen shops on a beat. In the evening it is one total; which bill each rupee was for is reconstructed from memory.",
      },
      {
        title: "\"Next round\"",
        body: "The most common promise in distribution, and the least recorded. By the next round the salesman has forgotten who said it.",
      },
      {
        title: "Expiry and damaged-stock returns",
        body: "Returns are deducted on the spot from the payment. Unless a credit note follows, the retailer's ledger is wrong for ever.",
      },
    ],
    workflow: [
      {
        step: "Beat order",
        trade: "Shop by shop, a few lines each, mostly the same as last week.",
        syncit: "The salesman's customers are his beat's shops. Repeat the shop's last order and change quantities; orders taken where there is no signal are saved and sent later.",
      },
      {
        step: "Godown picking",
        trade: "Orders picked and loaded for next-day delivery.",
        syncit: "The godown team uses the factory view: orders to prepare, oldest first; mark ready, then dispatched. No production step is needed — an order goes from placed to ready to dispatched.",
      },
      {
        step: "Delivery",
        trade: "Van delivery with the bill; some shops pay on delivery.",
        syncit: "The bill photo is attached to the order. The salesman marks delivered — with a photo of the signed copy if you want proof.",
      },
      {
        step: "Collection on the beat",
        trade: "Cash, UPI and cheques at each shop, against last round's bills.",
        syncit: "At the shop, the salesman taps Payment on that shop's row, enters the amount and method, and photographs the UPI screen or cheque. Each payment is against a named shop at a known time — the evening total explains itself.",
      },
      {
        step: "The shops that did not pay",
        trade: "\"Next round\", again.",
        syncit: "Tap Promise and pick the date of the next round. The shop leaves today's list and comes back on that day; if it is missed, it goes to the top and management sees it under Needs you. Every morning at nine each salesman gets one line: how many shops, how much.",
      },
    ],
    terms: [
      { word: "Beat", meaning: "The set of customers assigned to one salesman." },
      { word: "Round", meaning: "The next visit; used as the promise date." },
      { word: "Godown", meaning: "Uses the Factory role: to prepare, to dispatch, done today." },
      { word: "Return / expiry", meaning: "A credit note against the bill it came from." },
    ],
    faq: [
      {
        q: "We do not manufacture anything. Is Syncit still a fit?",
        a: "Yes, with the godown team in the Factory role. Orders go from placed to ready to dispatched without a production step. If you only need van sales with on-the-spot billing, a dedicated DMS may suit you better.",
      },
      {
        q: "Can a salesman see only his own beat?",
        a: "Yes. He sees only the customers assigned to him; management sees everyone.",
      },
      {
        q: "Does it work for principal-company claims and schemes?",
        a: "No. Syncit covers your orders, dispatch and retailer payments. Claims to the principal stay in your accounting.",
      },
      {
        q: "How does management see collection per salesman?",
        a: "Outstanding and overdue are shown per salesman, payments recorded today are listed with their proof, and a Monday email summarises received against target.",
      },
    ],
    related: [
      { href: "/help/record-payment", label: "Recording a payment with proof" },
      { href: "/help/payment-reminders", label: "Promises and reminders" },
      { href: "/tools/outstanding-ageing-template", label: "Outstanding ageing template" },
      { href: "/blog/tally-outstanding-report-on-your-phone", label: "Tally outstanding on your phone" },
    ],
  },
];

export function getIndustry(slug: string): Industry | null {
  return INDUSTRIES.find((i) => i.slug === slug) ?? null;
}
