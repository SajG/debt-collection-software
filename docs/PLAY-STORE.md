# Google Play listing — Syncit

Everything to paste into Play Console, in the order the console asks for it.
Release steps are in [MOBILE-RELEASE.md](./MOBILE-RELEASE.md); the Apple
equivalent of this file is [APP-STORE.md](./APP-STORE.md).

Package: `app.getsyncit` · Category: **Business** · Free · No ads · No in-app purchases

---

## 1. Store listing

**App name** (30 max — this is 26)

```
Syncit – Orders & Payments
```

**Short description** (80 max — this is 75)

```
Orders, dispatch and payments in one app for sales, factory and management.
```

**Full description** (4000 max)

```
Syncit is the order-to-cash app for Indian manufacturers and distributors who sell on credit. Every order, dispatch and payment lives in one place — so sales, the factory and management all see the same thing, and nobody has to ask "what happened to that order?" on WhatsApp.

Syncit is for teams. Your company creates its account at getsyncit.app and invites you by email; you then sign in here with that email.

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
• Large text and buttons; works on budget Android phones.
• Optional fingerprint or PIN lock.
• Amounts in ₹ with Indian digit grouping.

YOUR DATA
• Each company's data is separate. You only see the customers assigned to you.
• Data is encrypted in transit.
• You can delete your account in the app (Settings → Account) or at getsyncit.app/delete-account.

Syncit sends reminders for your own company's invoices to your own customers. It connects with Tally and other accounting tools through the web console at getsyncit.app.

Questions? support@getsyncit.app
```

**App category:** Business
**Tags:** Business, Productivity
**Contact email:** `support@getsyncit.app`
**Website:** `https://getsyncit.app`
**Privacy policy URL:** `https://getsyncit.app/privacy`
**Delete-account URL** (Data safety → "Delete account URL"): `https://getsyncit.app/delete-account`

Wording to keep out of every store field, screenshot and reply to a reviewer:
"debt collection", "debtor", "recovery agent". Syncit is order-to-cash software
that a business uses for its own invoices.

---

## 2. Screenshots

Six phone screenshots, portrait, 1080 × 1920 or larger, PNG/JPEG, no device
frame needed. Take them from the **Syncit Demo** company (§5) so no real
customer appears. Run `npm run review:seed` first so the data is fresh.

| # | Screen | Sign in as | How to get there | Caption |
|---|---|---|---|---|
| 1 | Today list | review-sales@ | Opens on it | Who to follow up with today |
| 2 | New order | review-sales@ | Orders → New order → add two items → Review | Place an order in three steps |
| 3 | Order status | review-sales@ | Orders → tap an "In production" order | Track every order to delivery |
| 4 | Record payment | review-sales@ | Today → Payment on any row → type an amount | Record a payment in seconds |
| 5 | Management summary | review-manager@ | Opens on Home | The whole business on one screen |
| 6 | Hindi screen | review-sales@ | Avatar → Settings → हिन्दी → back to Today | English, हिन्दी and मराठी |

Also required: app icon 512 × 512 (`mobile/assets/icon.png`, export at 512) and a
feature graphic 1024 × 500 (not in the repo yet — see "Still to do").

---

## 3. App content declarations

| Section | Answer |
|---|---|
| Privacy policy | `https://getsyncit.app/privacy` |
| Ads | No, the app does not contain ads |
| App access | **All or some functionality is restricted** → add the three sign-ins from §5 |
| Target audience | 18 and over. Not designed for children. |
| News app | No |
| COVID-19 contact tracing / status | No |
| Data safety | §4 |
| Government app | No |
| Financial features | "My app doesn't provide any financial features". Syncit records orders, invoices and payments a business has already received; it does not lend, hold or move money. |
| Health | No health features |

**Content rating questionnaire (IARC)** — category: *Utility, Productivity, Communication or Other*

| Question | Answer |
|---|---|
| Violence | No |
| Sexuality | No |
| Language (profanity, crude humour) | No |
| Controlled substances | No |
| Gambling, simulated gambling | No |
| Fear / horror | No |
| Users can interact or exchange content with each other | **Yes** — colleagues in the same company can post comments on an order. Not public; there are no strangers. |
| Shares the user's location with other users | No |
| Allows purchase of digital goods | No |
| Unrestricted internet access (browser) | No |

Expected result: Everyone / PEGI 3 / IARC 3+.

---

## 4. Data safety

**Does your app collect or share any of the required user data types?** Yes
**Is all of the user data collected by your app encrypted in transit?** Yes
**Do you provide a way for users to request that their data is deleted?** Yes — `https://getsyncit.app/delete-account` (also in the app: Settings → Account → Delete my account)

Nothing is **shared** with third parties as Play defines it (service providers
processing on our behalf — Supabase for hosting, Sentry for crash reports, Expo
for push delivery — are not "sharing"). Nothing is sold. Nothing is used for
advertising or marketing.

For every type below: **Collected: Yes · Shared: No · Processed ephemerally: No ·
Required** (the user cannot turn it off) unless noted.

| Play data type | What it is in Syncit | Purposes |
|---|---|---|
| Personal info → **Name** | The person's name on their profile | App functionality, Account management |
| Personal info → **Email address** | Sign-in email | App functionality, Account management |
| Personal info → **Phone number** | Staff phone on the profile, so colleagues can call each other | App functionality |
| Personal info → **User IDs** | Internal account id | App functionality, Account management |
| Financial info → **Other financial info** | The company's own business records: invoices, amounts outstanding, payments received | App functionality |
| App activity → **Other user-generated content** | Orders, order comments, follow-up notes, customer names and addresses entered by the company | App functionality |
| Photos and videos → **Photos** | Photos the user chooses to attach (payment proof, lorry receipt, invoice). **Optional.** | App functionality |
| App info and performance → **Crash logs** | Crash reports | Analytics (app stability) |
| App info and performance → **Diagnostics** | App start time, error breadcrumbs | Analytics (app stability) |
| Device or other IDs → **Device or other IDs** | Push-notification token and a per-install device id used to show and revoke signed-in phones | App functionality, Fraud prevention, security and compliance |

Not collected: location, contacts from the phone's address book, calendar,
messages, audio, files other than the chosen photos, web history, health,
advertising id.

> Check before submitting: the table above is what the app does today
> (verified against the permissions in §6 and the code). If the privacy policy
> at /privacy lists anything different, change the policy or this form so they
> agree — Play compares them.

---

## 5. Reviewer access (App access)

Reviewers cannot receive the emailed sign-in code, so three accounts in a
separate **Syncit Demo** company sign in with a fixed code.

### What to paste into Play Console → App content → App access

Add three instructions, one per role. Username = the email, Password = the code.

```
Name:      Sales (start here)
Username:  review-sales@getsyncit.app
Password:  <REVIEW_LOGIN_CODE>

Name:      Management
Username:  review-manager@getsyncit.app
Password:  <REVIEW_LOGIN_CODE>

Name:      Factory
Username:  review-factory@getsyncit.app
Password:  <REVIEW_LOGIN_CODE>
```

"Any other information":

```
Syncit is a team app: a company signs up on the web and invites its staff by email. There is no in-app sign-up or purchase.

To sign in:
1. Open the app. Type the email above in "Work email" and tap "Send code".
2. On the next screen type the 6-digit code above (it is fixed for these three demo accounts; no email is sent) and tap "Verify".
3. The app offers a fingerprint/PIN lock — tap "Not now".

The three accounts belong to a demo company with made-up customers in Pune. Each shows a different role: Sales (Today, Customers, Orders, Payments), Management (Home, Approvals, Team, Factory) and Factory (To make, To dispatch, Done today). To switch role, open Settings from the round avatar at the top right and Sign out. Language (English / Hindi / Marathi) and "Delete my account" are also in Settings.

Camera is used only when you tap "Take photo" to attach a payment proof or document. Notifications are asked for only after you place an order or tap "Turn on" on the Today screen.
```

### How it works

`POST /api/auth/review-login { email, code }` — rules in
`lib/platform/review-login.ts`, tests in `lib/__tests__/review-login.test.ts`.
The app calls it only after the normal emailed code is rejected; the app itself
contains no list of review addresses and no code.

It returns a session only when **all** of these hold, and answers
`401 { "error": "Invalid code." }` identically in every other case:

1. `REVIEW_LOGIN_EMAILS` and `REVIEW_LOGIN_CODE` are both set on the web
   deployment and the code is exactly 6 digits.
2. The email is one of the three addresses **hard-coded** in the server
   (`REVIEW_ACCOUNTS`). The env list can only narrow that set; listing any other
   address there does nothing.
3. Fewer than 5 wrong codes for that address in the last 15 minutes.
4. The code matches (constant-time comparison).
5. The account is a member of **exactly one** company and it is the demo company
   (slug `syncit-demo`). If a review address is ever added to a real company,
   sign-in is refused and an error is sent to Sentry.

The session is pinned to the demo company. Row-level security then limits it to
that company's rows like any other user.

**Log.** Every successful use writes a `PlatformAuditLog` row (`action =
'review_login'`, with IP and user agent). Every attempt for a review address,
right or wrong, writes a `LoginAttempt` row (`factor = 'REVIEW_CODE'`).

```sql
SELECT "createdAt", "actorEmail", detail FROM "PlatformAuditLog"
 WHERE action = 'review_login' ORDER BY "createdAt" DESC LIMIT 50;
SELECT "createdAt", email, successful FROM "LoginAttempt"
 WHERE factor = 'REVIEW_CODE' ORDER BY "createdAt" DESC LIMIT 50;
```

### Setting it up

1. Apply migration `20261007000000_sy37_review_login` (and
   `20261006000000_sy36_mobile_field_ux` if not yet applied — without it the
   demo sales account cannot record a payment or a promise).
2. Create or reset the demo company: `npm run review:seed`. It writes only to
   the company with slug `syncit-demo`.
3. On the web deployment set, then redeploy:
   ```
   REVIEW_LOGIN_EMAILS="review-manager@getsyncit.app,review-sales@getsyncit.app,review-factory@getsyncit.app"
   REVIEW_LOGIN_CODE="<six digits you choose — not 123456, 000000 or a date>"
   ```
4. Test on a phone with the production build before submitting.

Housekeeping:
- Re-run `npm run review:seed` before each submission. Reviewers place orders,
  record payments, and may delete a review account; the seed restores all of it.
- Change `REVIEW_LOGIN_CODE` if it is ever posted anywhere other than the two
  store consoles.
- When no review is in progress you may empty both variables; the route then
  refuses everything. Remember to set them again before the next update — every
  update is reviewed.

---

## 6. Permissions

Blocked in `mobile/app.json` (`android.blockedPermissions`) because nothing in the
app uses them: `RECORD_AUDIO`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`,
`SYSTEM_ALERT_WINDOW`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`,
`READ_MEDIA_AUDIO`, `ACCESS_MEDIA_LOCATION`.

Final permissions in the release build:

| Permission | Why | Asked at runtime? |
|---|---|---|
| `INTERNET` | Talk to the Syncit server | No |
| `ACCESS_NETWORK_STATE` | Detect offline, so orders are queued instead of failing | No |
| `CAMERA` | Photograph a payment proof, lorry receipt or invoice | Yes — when the user taps "Take photo" |
| `POST_NOTIFICATIONS` | "Your order is dispatched" and similar | Yes — after the first order or from the Today tab, with a one-line reason first |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | Optional app lock | No (system prompt when used) |
| `VIBRATE` | Short buzz when something is saved | No |
| `RECEIVE_BOOT_COMPLETED` | Declared by the notifications library so notifications keep working after a restart | No |
| `WAKE_LOCK`, `com.google.android.c2dm.permission.RECEIVE` | Added by Firebase Cloud Messaging to receive push notifications | No |

Picking a photo from the gallery uses Android's system photo picker, which needs
no permission. None of the above needs a Play permissions declaration form.

To confirm against the real AAB after a build: Play Console → the release →
App bundle explorer → Permissions. If anything outside this table appears, add
it to `blockedPermissions` (if unused) or to this table.

---

## Still to do before the first submission

- [ ] `eas login`, then in `mobile/`: `eas init` (writes the project id) and
      `eas update:configure` (replaces `PLACEHOLDER_EAS_PROJECT_ID` in
      `updates.url`). Not done from this repo — the CLI was not signed in.
- [ ] `eas build -p android --profile production` and confirm no warnings.
- [ ] Sentry: either add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` as
      EAS secrets, or set `SENTRY_DISABLE_AUTO_UPLOAD=true` for the production
      profile. Without one of them the source-map upload step complains.
- [ ] Push on Android needs a Firebase `google-services.json` (EAS → Credentials
      → FCM V1, and `android.googleServicesFile` in `app.json`). The file is
      git-ignored. Without it the app works but no push is delivered.
- [ ] Feature graphic 1024 × 500.
- [ ] `mobile/play-service-account.json` for `eas submit` (git-ignored).
- [ ] Demo company seeded, env set, sign-in tested on a real phone (§5).
- [ ] Six screenshots (§2).
- [ ] Set `ANDROID_LIVE="true"` on the web deployment once the listing is public.
