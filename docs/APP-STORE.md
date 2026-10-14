# App Store listing — Syncit

Everything to paste into App Store Connect. Submit to Apple **after** Google
Play has approved the same build of the app. Release steps:
[MOBILE-RELEASE.md](./MOBILE-RELEASE.md). Play equivalent:
[PLAY-STORE.md](./PLAY-STORE.md).

Bundle id: `app.getsyncit` · Primary category: **Business** · Secondary:
Productivity · Price: Free · iPhone only (`supportsTablet: false`)

---

## 1. App information

**Name** (30 max — this is 26)

```
Syncit – Orders & Payments
```

**Subtitle** (30 max — this is 30)

```
Sales, factory, payments: one.
```

**Promotional text** (170 max)

```
Every order, dispatch and payment in one app — for sales, the factory and management. In English, Hindi and Marathi.
```

**Description** (4000 max)

```
Syncit is the order-to-cash app for Indian manufacturers and distributors who sell on credit. Every order, dispatch and payment lives in one place — so sales, the factory and management all see the same thing, and nobody has to ask "what happened to that order?" on WhatsApp.

Syncit is for teams. Your company invites you by email; you then sign in here with that email.

FOR SALES
• Today: the customers to follow up with today, most important first — amount due and days overdue on every row.
• One tap to call, send a polite WhatsApp reminder, note the date a customer promised to pay, or record a payment.
• Place an order in three short steps: customer, items, review. Repeat a past order in two taps.
• Works without signal. Orders are saved on the phone and sent when the network returns.
• Attach a photo of the bank or UPI screenshot, cheque or signed receipt to any payment.
• Get a notification when your order is dispatched.

FOR THE FACTORY
• Three lists: To make, To dispatch, Done today — oldest first.
• Mark each line as started or ready; upload the invoice and lorry receipt (LR) as photos.
• See why an order is blocked and who to ask.

FOR MANAGEMENT
• Home: orders placed today and this week, total outstanding, overdue invoices, late deliveries.
• Approve or reject orders with a swipe.
• See each salesperson's orders and value, and what is stuck on the shop floor.

BUILT FOR THE FIELD
• English, Hindi and Marathi. Change language any time in Settings.
• Large text and buttons.
• Optional Face ID, Touch ID or PIN lock.
• Amounts in ₹ with Indian digit grouping.

YOUR DATA
• Each company's data is separate. You only see the customers assigned to you.
• Data is encrypted in transit.
• You can delete your account in the app: Settings → Account → Delete my account.

Questions? support@getsyncit.app
```

Apple-specific differences from the Play text, on purpose: no mention of where
to sign up or of pricing, no "Android", no other platform names (guideline
2.3.10), no web address for creating an account (3.1.1).

**Keywords** (100 max, comma-separated, no spaces — this is 97)

```
orders,sales order,dispatch,invoice,payment,outstanding,distributor,factory,field sales,tally,b2b
```

**Support URL:** `https://getsyncit.app/contact`
**Marketing URL:** `https://getsyncit.app`
**Privacy Policy URL:** `https://getsyncit.app/privacy`
**Copyright:** `2026 <legal entity name>`
**Contact email:** `support@getsyncit.app`

Wording to keep out of every field, screenshot and reviewer reply:
"debt collection", "debtor", "recovery agent".

---

## 2. Screenshots

6.9" iPhone (1320 × 2868) is the only size Apple requires; it scales the rest.
Same six screens, captions and steps as [PLAY-STORE.md §2](./PLAY-STORE.md#2-screenshots),
taken on an iPhone simulator signed in to the Syncit Demo company. Do not show
an Android status bar or any Google Play wording.

1. Today list · 2. New order · 3. Order status · 4. Record payment ·
5. Management summary · 6. Hindi screen

---

## 3. App Privacy ("nutrition label")

**Do you or your third-party partners collect data from this app?** Yes

For every type: **Linked to the user: Yes · Used for tracking: No.**
The app does not track (no advertising id, no data brokers), so no App Tracking
Transparency prompt is needed.

| Apple data type | What it is in Syncit | Purpose |
|---|---|---|
| Contact Info → **Name** | Name on the profile | App Functionality |
| Contact Info → **Email Address** | Sign-in email | App Functionality |
| Contact Info → **Phone Number** | Staff phone on the profile | App Functionality |
| Financial Info → **Other Financial Info** | The company's invoices, amounts outstanding and payments received | App Functionality |
| User Content → **Photos or Videos** | Photos the user attaches (payment proof, lorry receipt, invoice) | App Functionality |
| User Content → **Other User Content** | Orders, comments, follow-up notes, customer records the company enters | App Functionality |
| Identifiers → **User ID** | Internal account id | App Functionality |
| Identifiers → **Device ID** | Push token and per-install id used to list and revoke signed-in phones | App Functionality |
| Diagnostics → **Crash Data** | Crash reports | App Functionality |
| Diagnostics → **Performance Data** | App start time | App Functionality |

Not collected: location, contacts, health, browsing or search history,
purchases, payment card details, audio, sensitive info, advertising data.

---

## 4. Age rating

All "None" / "No": cartoon or realistic violence, sexual content or nudity,
profanity, alcohol/tobacco/drugs, mature or suggestive themes, horror, medical
information, gambling, contests, unrestricted web access.
**User-generated content:** colleagues in one company can comment on an order —
not public, no strangers; answer "No" to *unrestricted* user-generated content.
Result: **4+**. Made for Kids: No.

---

## 5. Export compliance, rights, sign-in

| Question | Answer |
|---|---|
| Does the app use encryption? | Only exempt encryption (HTTPS, and hashing the app-lock PIN). `ITSAppUsesNonExemptEncryption = false` is set in `app.json`, so App Store Connect does not ask on each upload. |
| Third-party content | No |
| Advertising identifier (IDFA) | No |
| Sign in with Apple | Not required — the app offers only its own email sign-in, no third-party login (guideline 4.8). |
| Account deletion (5.1.1(v)) | In the app: Settings (avatar, top right) → Account → Delete my account. |
| In-app purchases | None |

---

## 6. App Review information

**Sign-in required:** Yes
**User name:** `review-sales@getsyncit.app`
**Password:** `<REVIEW_LOGIN_CODE>` (the same six digits as on Play — see
[PLAY-STORE.md §5](./PLAY-STORE.md#5-reviewer-access-app-access) for how it
works, how every use is logged, and how to seed the demo company)

**Contact:** first name, last name, phone, `support@getsyncit.app`

**Notes**

```
Syncit is a business app used by the staff of manufacturers and distributors. Accounts are created by a company's administrator, who invites staff by email. There is no in-app sign-up and no purchase in the app.

TO SIGN IN
1. Type the user name above in "Work email" and tap "Send code".
2. Type the 6-digit password above as the code (it is fixed for the demo accounts; no email is sent) and tap "Verify".
3. The app offers a Face ID / PIN lock — tap "Not now".

OTHER ROLES (same 6-digit code)
• review-manager@getsyncit.app — Management: Home, Approvals, Team, Factory
• review-factory@getsyncit.app — Factory: To make, To dispatch, Done today
To switch, tap the round avatar (top right) → Sign out.

The demo company's customers, orders and amounts are invented.

ACCOUNT DELETION: avatar → Settings → Account → Delete my account. The Management demo account owns the demo company, so the app asks it to hand over ownership first; use the Sales or Factory account to see deletion complete.

PERMISSIONS
• Camera / Photos: only when the user taps "Take photo" or "From gallery" to attach a payment proof or a delivery document.
• Face ID: only if the user turns on the optional app lock.
• Notifications: asked after the first order is placed or from the Today screen, to tell the user when their order is dispatched.

"WhatsApp" on a customer row opens WhatsApp with a reminder the user can edit and send themselves; the app sends nothing on its own.
```

---

## 7. Known review risks — check before submitting

1. **Guideline 3.1.1 / 3.1.3 (pointing to purchases outside the app).** On iOS
   the sign-in screen shows "Ask your manager to invite you" with no link to the
   website (done in `mobile/app/(auth)/email.tsx`). One screen still mentions
   plans: the banner shown when a company's trial has ended says the owner "can
   choose a plan in Settings → Billing on the web". Reviewers will not see it in
   the demo company (it is exempt from billing), but for a first-try pass change
   that line on iOS to "Ask your account owner" before submitting.
2. **Guideline 2.1 (demo must work).** Run `npm run review:seed` the day you
   submit and sign in once on the TestFlight build with all three accounts.
3. **Guideline 5.1.1 (permission strings).** The camera, photo and Face ID
   purpose strings in `app.json` say what the photo or scan is for. There is no
   microphone string because the microphone is not used
   (`microphonePermission: false`).
4. **Guideline 4.2 (minimum functionality).** Not expected to be an issue; the
   notes above explain the three roles so the reviewer sees more than one screen.
5. **Hard-coded "With Synergy Barcode Token"** appears in the new-order token
   picker for every company. Harmless for review, but it is another company's
   name in a multi-company app — worth moving into company settings.

---

## Still to do before the first submission

- [ ] Replace `PLACEHOLDER_APPLE_ID` and `PLACEHOLDER_ASC_APP_ID` in
      `mobile/eas.json` (`submit.production.ios`).
- [ ] `eas build -p ios --profile production` → `eas submit -p ios`.
- [ ] Six 6.9" screenshots.
- [ ] Copyright line and review contact phone number above.
- [ ] After approval: set `IOS_LIVE="true"` and `IOS_APP_STORE_URL` on the web
      deployment and redeploy.
