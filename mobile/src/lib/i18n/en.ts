// English source dictionary. Every key lives here first; hi.ts and mr.ts
// must carry the same keys (enforced by their Record<Key, string> type).
export const en = {

  "home.greeting": "Namaste, {name}",
  "home.subtitle": "Your orders, newest first.",
  "home.newOrder": "New order",
  "home.signOut": "Sign out",
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
  "confirm.signOut.body": "You will need your work email to sign in again.",
  "confirm.cancel": "Cancel",
  "confirm.ok": "Yes, sign out",
  "confirm.discard.title": "Discard this order?",
  "confirm.discard.ok": "Yes, discard",

  "offline.banner": "You are offline. Orders will be saved and sent when signal returns.",
  "offline.queued": "{count} order(s) waiting to be sent.",

  "billing.locked.trial": "Your trial has ended — choose a plan to keep adding orders. Your data is safe.",
  "billing.locked.payment": "Your last payment didn't go through — choose a plan to keep adding orders. Your data is safe.",
  "billing.locked.other": "This workspace is read-only — choose a plan to keep adding orders. Your data is safe.",
  "billing.pastDue": "Your last payment didn't go through. Pay by {date} to keep adding orders. Your data is safe.",
  "billing.ownerHint": "The account owner can choose a plan in Settings → Billing on the web.",
  "tallySync.lastSynced": "Last synced with Tally: {time} ({ago})",
  "tallySync.never": "Tally connector is set up but hasn't synced yet.",
  "tallySync.stale": "Tally hasn't synced for a while. Is the Tally PC on with the Syncit connector running?",
  "tallySync.failing": "Tally sync is failing. Check the Syncit connector on the Tally PC.",
  "tallySync.refreshHint": "Tap to check again",
  "splash.trust": "Your data is encrypted and private to your company",

  "account.title": "Account",
  "account.open": "Account & delete account",
  "account.delete.title": "Delete my account",
  "account.delete.removedTitle": "What is deleted",
  "account.delete.removed": "Your sign-in, your name, phone number and email, your notification settings, and every phone signed in to this account. You lose access to every company in Syncit.",
  "account.delete.keptTitle": "What stays with your company",
  "account.delete.kept": "Orders, payments and notes you recorded are your company's business records. They stay with the company and show your name as \"Former member\".",
  "account.delete.owner": "If you own a company, first make someone else the owner or delete the company (web: Settings → Company).",
  "account.delete.typeToConfirm": "Type DELETE to confirm",
  "account.delete.ownerBlocked": "You still own: {companies}. Make someone else the owner, or delete the company, then try again.",
  "account.delete.button": "Delete my account",

  "wizard.step": "Step {n} of {total}",
  "wizard.back": "Back",

  "detail.rejected": "Order rejected",
  "detail.waitingApproval": "Waiting for director approval",
  "detail.waitingApprovalHint":
    "The factory cannot start until an admin approves this order.",
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
  "dues.search": "Search customers",
  "dues.total": "Total outstanding",
  "dues.invoices": "Unpaid invoices",
  "dues.dueOn": "Due {date}",
  "dues.empty": "No unpaid invoices.",
  "dues.updated": "Tally last synced {time}",
  "dues.updatedNever": "Not yet synced from Tally",

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
  "factory.tab.queue": "To produce",
  "factory.tab.inProd": "In progress",
  "factory.tab.blocked": "Blocked",
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

  // ── Queue-summary chip ────────────────────────────────────────────
  "queue.online.hint": "Retrying automatically. Tap Retry now to push straight away.",
  "queue.offline.hint": "You're offline. Items will send automatically when you're back online.",

  // ── Errors (mirror lib/errors.ts categories) ──────────────────────
  "error.network": "No signal. Try again in a moment.",
  "error.queued": "Saved on your phone — will sync when you're back online.",
  "error.auth": "You've been signed out. Sign in again to continue.",
  "error.permission": "You don't have permission for that. Ask an admin.",
  "error.rate": "Too many attempts. Wait a minute and try again.",
  "error.unknown": "Something went wrong. Try again.",

  // ── common ──
  "common.approvals": "Approvals",
  "common.team": "Team",
  "common.factory": "Factory",
  "common.approveFailed": "Approve failed",

  // ── adminApprovals ──
  "adminApprovals.nowOnTheFactoryFloor": "{orderNumber} — {partyName}\nNow on the factory floor.",
  "adminApprovals.rateApprovedFactoryCanStart": "{orderNumber} — rate approved. Factory can start production.",
  "adminApprovals.rateApprovals": "Rate approvals",
  "adminApprovals.rateExceptionsCanOnlyBe": "Rate exceptions can only be approved or left pending.",
  "adminApprovals.reject": "Reject {orderNumber}?",
  "adminApprovals.theSalespersonWillGetA": "The salesperson will get a push notification.",

  // ── common ──
  "common.reject": "Reject",
  "common.rejectFailed": "Reject failed",

  // ── adminApprovals ──
  "adminApprovals.swipeRightToApproveSwipe": "Swipe right to approve. Swipe left to reject with reason.",

  // ── common ──
  "common.approve": "Approve",

  // ── adminApprovals ──
  "adminApprovals.orderApproval": "ORDER APPROVAL",
  "adminApprovals.rateException": "RATE EXCEPTION",

  // ── adminFactory ──
  "adminFactory.readOnlyViewOfThe": "Read-only view of the shop floor. Averages are over the last 60 days.",
  "adminFactory.stage": "Stage",
  "adminFactory.stuck24H": "Stuck > 24 h",
  "adminFactory.nothingStuckEveryInFlight": "Nothing stuck. Every in-flight order moved within 24 h.",

  // ── adminHome ──
  "adminHome.switchToSalespersonView": "Switch to salesperson view",
  "adminHome.totalOutstanding": "Total outstanding",
  "adminHome.overdueInvoices": "Overdue invoices",
  "adminHome.collectedThisMonth": "Received this month",
  "adminHome.placedToday": "Placed today",
  "adminHome.placedThisWeek": "Placed this week",
  "adminHome.awaitingMyApproval": "Awaiting MY approval",
  "adminHome.rateApprovalsPending": "Rate approvals pending",
  "adminHome.overdueDeliveries": "Overdue deliveries",

  // ── common ──
  "common.onHold": "On hold",

  // ── adminHome ──
  "adminHome.dispatchedThisMonth": "Dispatched this month",
  "adminHome.liveUpdatesWheneverASales": "Live · updates whenever a sales order changes.",

  // ── adminTeam ──
  "adminTeam.reactivate": "Reactivate {ownerName}?",
  "adminTeam.deactivate": "Deactivate {ownerName}?",
  "adminTeam.theyWillBeAbleTo": "They will be able to sign in and place orders again.",
  "adminTeam.theyWillBeSignedOut": "They will be signed out and blocked from signing in. All their historical data stays.",
  "adminTeam.reactivate2": "Reactivate",
  "adminTeam.deactivate2": "Deactivate",

  // ── common ──
  "common.couldNotUpdate": "Could not update",

  // ── adminTeam ──
  "adminTeam.noTeamMembers": "No team members.",
  "adminTeam.deactivateUser": "Deactivate user",
  "adminTeam.reactivateUser": "Reactivate user",
  "adminTeam.orders": "Orders",
  "adminTeam.value": "Value",
  "adminTeam.avgOD": "Avg O→D",
  "adminTeam.overdue": "Overdue",

  // ── authCode ──
  "authCode.enterThe6DigitCode": "Enter the 6-digit code.",
  "authCode.dev": "{error}\n[dev] {message}",
  "authCode.enterYourCode": "Enter your code",
  "authCode.devPhoneEnterDevOtp": "Dev phone {identifier}. Enter dev OTP.",
  "authCode.ifIsRegisteredA6": "If {identifier} is registered, a 6-digit code is on its way. Enter it below.",
  "authCode.6DigitCode": "6-digit code",
  "authCode.verify": "Verify",
  "authCode.resendInS": "Resend in {cooldownLeft}s",
  "authCode.resendCode": "Resend code",
  "authCode.changePhone": "Change phone",
  "authCode.changeEmail": "Change email",

  // ── authEmail ──
  "authEmail.dismiss": "Dismiss",
  "authEmail.signInToSyncit": "Sign in to Syncit",
  "authEmail.sendCode": "Send code",
  "authCode.password": "Password",
  "authCode.enterYourPassword": "Enter your password.",
  "authCode.enterYourPasswordTitle": "Enter your password",
  "authCode.wrongPassword": "Email or password is incorrect.",
  "authCode.useCodeInstead": "Email me a code instead",
  "authEmail.usePassword": "Sign in with password",
  "authEmail.signIn": "Sign in",
  "join.title": "Join {company}",
  "join.subtitle": "{inviter} invited you as {role}.",
  "join.yourManager": "Your manager",
  "join.role.admin": "Management",
  "join.role.staff": "Sales",
  "join.role.factory": "Factory",
  "join.field.name": "Your name",
  "join.field.phone": "Mobile (optional)",
  "join.field.password": "Choose a password (10+ characters)",
  "join.submit": "Join team",
  "join.err.name": "Enter your name.",
  "join.err.phone": "Enter a 10-digit Indian mobile number.",
  "join.err.password": "Use at least 10 characters for your password.",
  "join.err.network": "No connection. Check your internet and try again.",
  "join.err.generic": "Could not join. Please try again.",
  "join.invalid.title": "Invitation unavailable",
  "join.invalid.body": "This invitation has expired or was cancelled. Ask your manager to send a new one.",
  "join.network.title": "Could not load the invitation",
  "join.network.body": "Check your internet connection and open the link again.",
  "join.goToSignIn": "Go to sign in",
  "join.exists.body": "{email} already has a Syncit account. Accept the invitation on the web, then sign in here.",
  "join.exists.openWeb": "Accept on the web",

  // ── factoryHome ──
  "factoryHome.order": "order",
  "factoryHome.orders": "orders",

  // ── common ──
  "common.awaitingAdminApproval": "Awaiting admin approval",

  // ── factoryHome ──
  "factoryHome.anAdminMustApproveBefore": "An admin must approve before the shop floor sees this.",
  "factoryHome.noReasonRecorded": "No reason recorded.",
  "factoryHome.belowFloorRate": "Below floor rate",
  "factoryHome.oneOrMoreLinesAre": "One or more lines are below the floor rate and need admin sign-off.",
  "factoryHome.blocked": "Blocked",
  "factoryHome.unknownReason": "Unknown reason.",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.updateFailed": "Update failed",

  // ── common ──
  "common.savedOnYourPhone": "Saved on your phone",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.willApplyAutomaticallyWhenYoure": "Will apply automatically when you're back online.",

  // ── common ──
  "common.couldNotOpenDialer": "Could not open dialer",
  "common.orderNotFound": "Order not found.",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.thisOrderIsntOnThe": "This order isn't on the shop floor yet. An admin needs to approve it before production can start.",

  // ── common ──
  "common.notes": "Notes",
  "common.confirm": "Confirm",
  "common.cancelOrder": "Cancel order",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.cancelOrder": "Cancel order?",
  "factoryOrdersDetail.markAsCancelledThisCant": "Mark {orderNumber} as cancelled. This can't be undone from mobile.",

  // ── common ──
  "common.unknownUser": "Unknown user",
  "common.call": "☎ Call",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.ratePending": "  ·  RATE PENDING",
  "factoryOrdersDetail.line": "Line {lineNumber}: {label}",
  "factoryOrdersDetail.ready": "✓ Ready",

  // ── common ──
  "common.couldNotSave": "Could not save",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.notSet": "Not set",

  // ── common ──
  "common.saving": "Saving…",
  "common.change": "Change",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.set": "Set",

  // ── common ──
  "common.documents": "Documents",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.chooseADocumentTypeFirst": "Choose a document type first, then photograph every page. Multi-page docs (a 3-page LR) upload as one document.",
  "factoryOrdersDetail.whatAreYouUploading": "What are you uploading?",
  "factoryOrdersDetail.changeType": "Change type",
  "factoryOrdersDetail.addPage": "Add page {n}",
  "factoryOrdersDetail.addPageTakePhotoAbove": "Add page {n} (take photo above)",

  // ── common ──
  "common.uploading": "Uploading…",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.page": " — page {pageIndex}",

  // ── common ──
  "common.noDocumentsYet": "No documents yet.",
  "common.couldNotOpen": "Could not open",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.tryAgainLater": "Try again later.",
  "factoryOrdersDetail.pages": " — {pageCount} pages",
  "factoryOrdersDetail.page2": "Page {n} →",
  "factoryOrdersDetail.open": "Open →",

  // ── staffCustomersNew ──
  "staffCustomersNew.addCustomer": "Add customer",
  "staffCustomersNew.onlyAdminUsersCanCreate": "Only ADMIN users can create a customer from the app. Salespeople should place the order with the free-text customer name — an admin promotes it later.",

  // ── common ──
  "common.nameRequired": "Name required",
  "common.enterTheCustomerName": "Enter the customer name.",
  "common.saved": "Saved",

  // ── staffCustomersNew ──
  "staffCustomersNew.added": "{trimmed} added.",
  "staffCustomersNew.onlyNameIsRequiredEverything": "Only name is required — everything else can be filled from the web later.",
  "staffCustomersNew.customerName": "Customer name *",
  "staffCustomersNew.phone10Digits": "Phone (10 digits)",
  "staffCustomersNew.city": "City",
  "staffCustomersNew.address": "Address",
  "staffCustomersNew.creditLimit": "Credit limit (₹)",

  // ── staffHome ──
  "staffHome.couldntCloneOrder": "Couldn't clone order",

  // ── common ──
  "common.pleaseTryAgain": "Please try again.",
  "common.settings": "Settings",

  // ── staffHome ──
  "staffHome.stock": "Stock",

  // ── common ──
  "common.customer": "Customer",

  // ── staffHome ──
  "staffHome.resumeInProgressOrder": "Resume in-progress order",
  "staffHome.resumeOrder": "Resume order",
  "staffHome.draftInProgress": "Draft in progress",

  // ── common ──
  "common.customerDelivery": "Customer & delivery",

  // ── staffHome ──
  "staffHome.deleteThisDraft": "Delete this draft?",
  "staffHome.everythingTypedForThisOrder": "Everything typed for this order will be gone. This cannot be undone.",
  "staffHome.deleteDraft": "Delete draft",
  "staffHome.deleteThisDraft2": "Delete this draft",
  "staffHome.repeatThisOrder": "Repeat this order?",
  "staffHome.opensANewOrderWith": "Opens a new order with the same customer and items pre-filled.",
  "staffHome.repeat": "Repeat",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.editOrderDetails": "Edit order details",
  "staffOrdersDetail.editDetails": "✎ Edit details",
  "staffOrdersDetail.editLineItems": "Edit line items",
  "staffOrdersDetail.editItems": "✎ Edit items",
  "staffOrdersDetail.cancelThisOrder": "Cancel this order",
  "staffOrdersDetail.cancel": "✕ Cancel",
  "staffOrdersDetail.awaitingYourDecision": "Awaiting your decision",
  "staffOrdersDetail.approveToReleaseTheOrder": "Approve to release the order to the factory. Reject with a reason — the salesperson gets a push.",
  "staffOrdersDetail.rejectionReason": "Rejection reason",
  "staffOrdersDetail.eGPriceTooLow": "e.g. price too low / customer credit hold",
  "staffOrdersDetail.rejectWithReason": "Reject with reason",
  "staffOrdersDetail.rejectThisOrder": "Reject this order?",
  "staffOrdersDetail.theSalespersonGetsAPush": "The salesperson gets a push. Reason: \"{reason}\"",
  "staffOrdersDetail.reasonRequired": "Reason required",
  "staffOrdersDetail.aCancellationReasonIsRequired": "A cancellation reason is required so the timeline reads well.",
  "staffOrdersDetail.cancelFailed": "Cancel failed",
  "staffOrdersDetail.keepOrder": "Keep order",
  "staffOrdersDetail.cancel2": "Cancel {orderNumber}?",
  "staffOrdersDetail.thisWillCancelTheOrder": "This will cancel the order and notify the factory.",
  "staffOrdersDetail.couldNotConfirm": "Could not confirm",
  "staffOrdersDetail.savedForRetry": "Saved for retry",
  "staffOrdersDetail.noNetworkRightNowDelivery": "No network right now — delivery will be confirmed automatically when the phone is back online.",
  "staffOrdersDetail.confirmDelivered": "Confirm delivered",
  "staffOrdersDetail.closesTheOrderAndStamps": "Closes the order and stamps the delivery time. Optional: attach a photo of the signed LR / customer confirmation.",
  "staffOrdersDetail.confirming": "Confirming…",
  "staffOrdersDetail.confirmDelivered2": "Confirm delivered?",
  "staffOrdersDetail.stampsTheDeliveryTimeAnd": "Stamps the delivery time and attaches the photo.",
  "staffOrdersDetail.stampsTheDeliveryTimeYou": "Stamps the delivery time. You can attach a photo above first, or confirm without.",
  "staffOrdersDetail.page": " — page {pageIndex}",
  "staffOrdersDetail.attachAnOrderProofCustomer": "Attach an order proof (customer PO, WhatsApp confirmation). Invoice and LR come from the factory.",
  "staffOrdersDetail.type": "Type",
  "staffOrdersDetail.uploadDocument": "Upload document",
  "staffOrdersDetail.pages": " — {pageCount} pages",
  "staffOrdersDetail.openPinchToZoomShare": "Open · pinch to zoom · Share",

  // ── common ──
  "common.couldNotLoad": "Could not load",

  // ── staffOrdersEditItemsDetail ──
  "staffOrdersEditItemsDetail.incompleteLines": "Incomplete lines",
  "staffOrdersEditItemsDetail.everyLineNeedsAProduct": "Every line needs a product, quantity, and rate.",
  "staffOrdersEditItemsDetail.itemsUpdated": "Items updated.",
  "staffOrdersEditItemsDetail.editItems": "Edit items",
  "staffOrdersEditItemsDetail.cannotEditItems": "Cannot edit items",
  "staffOrdersEditItemsDetail.noItemsTapAddItem": "No items. Tap \"Add item\" to add a line.",
  "staffOrdersEditItemsDetail.removeLine": "Remove line",

  // ── common ──
  "common.delete": "Delete",

  // ── staffOrdersEditItemsDetail ──
  "staffOrdersEditItemsDetail.editLine": "Edit line",

  // ── common ──
  "common.newProduct": "New product",
  "common.orderTotal": "Order total",
  "common.addItem": "+ Add item",
  "common.saveChanges": "Save changes",

  // ── staffOrdersEditDetail ──
  "staffOrdersEditDetail.orderDetailsUpdated": "Order details updated.",
  "staffOrdersEditDetail.editOrder": "Edit order",
  "staffOrdersEditDetail.cannotEdit": "Cannot edit",

  // ── common ──
  "common.customerName": "Customer name",
  "common.typeCustomerName": "Type customer name",

  // ── staffOrdersEditDetail ──
  "staffOrdersEditDetail.ledgerCustomer": "✓ Ledger customer",
  "staffOrdersEditDetail.savedAsNewCustomer": "Saved as new customer",

  // ── common ──
  "common.delivery": "Delivery",
  "common.dispatchLocation": "Dispatch location",
  "common.addressGodownOrLedgerLocation": "Address, godown, or ledger location",
  "common.expectedDelivery": "Expected delivery",
  "common.pickADate": "Pick a date",
  "common.paymentTerms": "Payment terms",
  "common.transport": "Transport",
  "common.tokenGift": "Token / gift",
  "common.notesOptional": "Notes (optional)",

  // ── staffOrdersNewHome ──
  "staffOrdersNewHome.noLedgerMatchTheName": "No ledger match — the name you typed will be saved as a new customer.",
  "staffOrdersNewHome.pick": "Pick {name}",
  "staffOrdersNewHome.anythingTheFactoryShouldKnow": "Anything the factory should know",
  "staffOrdersNewHome.eGFragileCallBefore": "e.g. Fragile · call before dispatch",
  "staffOrdersNewHome.continueToItems": "Continue to items",

  // ── staffOrdersNewItems ──
  "staffOrdersNewItems.items": "Items",
  "staffOrdersNewItems.noItemsYetTapAdd": "No items yet. Tap \"Add item\" to add the first SKU.",
  "staffOrdersNewItems.review": "Review",

  // ── common ──
  "common.order": "Order",

  // ── staffOrdersNewReview ──
  "staffOrdersNewReview.someFieldsAreStillEmpty": "Some fields are still empty.",
  "staffOrdersNewReview.orderNotPlaced": "Order not placed",
  "staffOrdersNewReview.orderPlaced": "Order placed",
  "staffOrdersNewReview.theFactoryWillSeeIt": "The factory will see it immediately.",
  "staffOrdersNewReview.theOrderWillBeSent": "The order will be sent automatically when you're back online.",
  "staffOrdersNewReview.reviewPlace": "Review & place",
  "staffOrdersNewReview.overCreditLimit": "Over credit limit",
  "staffOrdersNewReview.1LineBelowFloorRate": "1 line below floor rate",
  "staffOrdersNewReview.linesBelowFloorRate": "{count} lines below floor rate",
  "staffOrdersNewReview.dispatchTo": "Dispatch to",
  "staffOrdersNewReview.payment": "Payment",
  "staffOrdersNewReview.token": "Token",
  "staffOrdersNewReview.cashDiscount": "Cash discount",
  "staffOrdersNewReview.customDiscountOptional": "Custom discount % (optional)",
  "staffOrdersNewReview.subtotal": "Subtotal",
  "staffOrdersNewReview.cashDiscount2": "Cash discount ({discountPct}%)",
  "staffOrdersNewReview.taxableAmount": "Taxable amount",
  "staffOrdersNewReview.grandTotal": "Grand total",
  "staffOrdersNewReview.placing": "Placing…",
  "staffOrdersNewReview.placeOrder": "Place order",
  "staffOrdersNewReview.placeOrder2": "Place order?",
  "staffOrdersNewReview.theOrderWillGoTo": "The order will go to admin approval before the factory sees it.",

  // ── staffPaymentsDetail ──
  "staffPaymentsDetail.paymentNotFound": "Payment not found.",
  "staffPaymentsDetail.onAccountPayment": "On-account payment",
  "staffPaymentsDetail.addProof": "Add proof",
  "staffPaymentsDetail.snapTheBankUpiScreen": "Snap the bank / UPI screen or the cheque now — makes recon easy.",
  "staffPaymentsDetail.proofType": "Proof type",
  "staffPaymentsDetail.referenceNoteOptional": "Reference note (optional)",
  "staffPaymentsDetail.utrChequeNoAnyReference": "UTR / cheque no. / any reference",
  "staffPaymentsDetail.uploadProof": "Upload proof",
  "staffPaymentsDetail.proofs": "Proofs ({count})",
  "staffPaymentsDetail.noProofsUploadedYet": "No proofs uploaded yet.",
  "staffPaymentsDetail.unableToOpenTheFile": "Unable to open the file — try again later.",
  "staffPaymentsDetail.openFullSize": "Open full-size →",

  // ── common ──
  "common.loading": "Loading…",

  // ── staffPaymentsHome ──
  "staffPaymentsHome.recordedCollectionsAndProofsTap": "Payments you recorded, with their proofs. Tap + to add one.",
  "staffPaymentsHome.noPaymentsYet": "No payments yet",
  "staffPaymentsHome.tapTheButtonToRecord": "Tap the + button to record a payment you collected today.",
  "staffPaymentsHome.noProof": "No proof",

  // ── staffPaymentsNew ──
  "staffPaymentsNew.searchYourLedger": "Search your ledger…",

  // ── staffSettings ──
  "staffSettings.orderStatusUpdates": "Order status updates",
  "staffSettings.whenAnOrderYouPlaced": "When an order you placed moves forward — In production, Ready to dispatch, LR generated, Dispatched.",
  "staffSettings.invoiceLrUploaded": "Invoice / LR uploaded",
  "staffSettings.whenTheFactoryUploadsAn": "When the factory uploads an invoice or lorry receipt against your order.",
  "staffSettings.comments": "Comments",
  "staffSettings.whenAnyonePostsAComment": "When anyone posts a comment on an order you're on.",
  "staffSettings.adminAlerts": "Admin alerts",
  "staffSettings.staleOrders": "Stale orders",
  "staffSettings.anyOrderStillInOrder": "Any order still in Order Placed for longer than the configured stale-hour threshold.",
  "staffSettings.creditCheckFailures": "Credit-check failures",
  "staffSettings.anOrderWasPlacedBut": "An order was placed but did not clear the credit check.",

  // ── staffStock ──
  "staffStock.stockInFactory": "Stock in factory",
  "staffStock.lastTallySync": "Last Tally sync: {latestSync}",
  "staffStock.stockLevelsComeFromTally": "Stock levels come from Tally — this screen will populate once an admin turns Tally on.",
  "staffStock.search": "Search",
  "staffStock.productOrCategory": "Product or category…",
  "staffStock.noStockItemsMatchYour": "No stock items match your search.",
  "staffStock.stockLevelsComeFromTally2": "Stock levels come from Tally. Nothing is tracked here yet — ask an admin to enable the Tally integration.",

  // ── accountDisabled ──
  "accountDisabled.yourAccessHasBeenRemoved": "Your access has been removed",
  "accountDisabled.anAdministratorHasDisabledYour": "An administrator has disabled your Syncit account. Your data is safe — nothing has been deleted. Contact your admin to be reactivated.",
  "accountDisabled.backToSignIn": "Back to sign in",

  // ── unlock ──
  "unlock.biometricUnavailableSignOutAnd": "Biometric unavailable. Sign out and re-enrol with a PIN.",
  "unlock.unlockCancelled": "Unlock cancelled.",
  "unlock.enterYour6DigitPin": "Enter your 6-digit PIN.",
  "unlock.tooManyWrongAttemptsSigned": "Too many wrong attempts. Signed out. Ask your admin for a new enrollment code.",
  "unlock.wrongPinWrongAttemptsSign": "Wrong PIN. {MAX_PIN_ATTEMPTS} wrong attempts sign you out.",
  "unlock.unlock": "Unlock",
  "unlock.useYourFingerprintOrFace": "Use your fingerprint or face.",
  "unlock.thisDeviceIsntSetUp": "This device isn't set up. Sign out and re-enrol.",
  "unlock.unlockWithBiometric": "Unlock with biometric",
  "unlock.signOut": "Sign out",

  // ── updateRequired ──
  "updateRequired.updateRequired": "Update required",
  "updateRequired.unknown": "unknown",
  "updateRequired.checkForUpdates": "Check for updates",

  // ── activityFeed ──
  "activityFeed.activity": "Activity",
  "activityFeed.statusChangesAndCommentsIn": "Status changes and comments in one thread. Append-only.",
  "activityFeed.addACommentCustomerWants": "Add a comment — 'Customer wants 20kg not 25kg'",
  "activityFeed.post": "Post",
  "activityFeed.noActivityYet": "No activity yet.",
  "activityFeed.comment": "Comment",

  // ── backBar ──
  "backBar.back": "Back",

  // ── documentViewer ──
  "documentViewer.shareThisDocument": "Share this document",
  "documentViewer.longPressToCopyThe": "Long-press to copy the link below (valid for 15 min):\n\n",
  "documentViewer.closeViewer": "Close viewer",
  "documentViewer.close": "✕ Close",
  "documentViewer.shareViaWhatsappOrOther": "Share via WhatsApp or other",
  "documentViewer.share": "Share",

  // ── errorBoundary ──
  "errorBoundary.somethingWentWrong": "Something went wrong",
  "errorBoundary.syncitHitAnUnexpectedError": "Syncit hit an unexpected error on this screen. Your data is safe — nothing has been sent or lost. Tap Report so we can fix it, then head back to the home screen.",
  "errorBoundary.reportThisProblemToThe": "Report this problem to the team",
  "errorBoundary.reportAProblem": "Report a problem",
  "errorBoundary.backToHome": "Back to home",

  // ── itemSheet ──
  "itemSheet.customNotInCatalogue": "Custom / not in catalogue",
  "itemSheet.editItem": "Edit item",
  "itemSheet.addItem": "Add item",
  "itemSheet.close": "Close",
  "itemSheet.brand": "Brand",
  "itemSheet.chooseBrand": "Choose brand",
  "itemSheet.privateLabelBrandName": "Private-label brand name",
  "itemSheet.enterTheBrandTheCustomer": "Enter the brand the customer sells under",
  "itemSheet.productGrade": "Product / grade",
  "itemSheet.loadingProducts": "Loading products…",
  "itemSheet.searchByNameOrGrade": "Search by name or grade code",
  "itemSheet.customProductName": "Custom product name",
  "itemSheet.productNameGradeOrPrivate": "Product name, grade, or private-label name",
  "itemSheet.quantity": "Quantity",
  "itemSheet.packing": "Packing",
  "itemSheet.customPackingOptional": "Custom packing (optional)",
  "itemSheet.eG310MlCartridge": "e.g. \"310 ml cartridge\", \"500 ml squeeze bottle\"",
  "itemSheet.size": "Size",
  "itemSheet.customSizeOptionalKgOr": "Custom size (optional, kg or ml)",
  "itemSheet.packingOptional": "Packing (optional)",
  "itemSheet.sizeOptional": "Size / variant (optional)",
  "itemSheet.searchProducts": "Search by product name or code",
  "itemSheet.ratePerUnit": "Rate per unit",
  "itemSheet.lineTotal": "Line total",
  "itemSheet.save": "Save",
  "itemSheet.add": "Add",

  // ── numberPad ──
  "numberPad.backspace": "backspace",

  // ── orderCard ──
  "orderCard.call": "Call {salespersonName}",
  "orderCard.repeatThisOrder": "Repeat this order",
  "orderCard.repeat": "↻ Repeat",

  // ── photoPicker ──
  "photoPicker.cameraAccessNeeded": "Camera access needed",
  "photoPicker.enableCameraInSettingsSo": "Enable camera in Settings so Syncit can capture the proof.",
  "photoPicker.photoAccessNeeded": "Photo access needed",
  "photoPicker.enablePhotoAccessInSettings": "Enable photo access in Settings so Syncit can attach the proof.",
  "photoPicker.removeSelectedPhoto": "Remove selected photo",
  "photoPicker.remove": "✕ Remove",
  "photoPicker.retakePhoto": "Retake photo",
  "photoPicker.takePhoto": "Take photo",
  "photoPicker.fromGallery": "From gallery",

  // ── pickerField ──
  "pickerField.opensPicker": "{label}: {n}. Opens picker.",

  // ── common ──
  "common.closePicker": "Close picker",

  // ── pickerField ──
  "pickerField.recent": "Recent",
  "pickerField.all": "All",
  "pickerField.noMatches": "No matches.",

  // ── common ──
  "common.stillWaiting": "Still waiting",
  "common.nothingNewToSync": "Nothing new to sync.",
  "common.youreOfflineTheQueueWill": "You're offline. The queue will drain when you're back online.",
  "common.someFailed": "Some failed",

  // ── queueSummary ──
  "queueSummary.syncedStillWaitingCheckIndividual": "{sent} synced · {failed} still waiting. Check individual items for the reason.",
  "queueSummary.failedToSendTapFor": "{stuckCount} failed to send. Tap for details.",
  "queueSummary.waitingToSyncTapFor": "{total} waiting to sync. Tap for details.",
  "queueSummary.failedTapToSeeWhy": "{stuckCount} failed — tap to see why",
  "queueSummary.waitingToSync": "{total} waiting to sync",
  "queueSummary.waitingToSync2": "Waiting to sync",
  "queueSummary.someItemsFailedToSend": "Some items failed to send. Check the reason under each — this usually means the server is missing a database migration or the action isn't allowed. Retrying won't help until that's fixed.",
  "queueSummary.retryingAutomaticallyTapRetryNow": "Retrying automatically. Tap Retry now to push straight away.",
  "queueSummary.youreOfflineItemsWillSend": "You're offline. Items will send automatically when you're back online.",
  "queueSummary.orders": "Orders · {count}",
  "queueSummary.statusChanges": "Status changes · {count}",
  "queueSummary.documents": "Documents · {count}",
  "queueSummary.page": " — page {pageIndex}",

  // ── common ──
  "common.retrySyncingNow": "Retry syncing now",
  "common.syncing": "Syncing…",
  "common.retryNow": "Retry now",

  // ── selectField ──
  "selectField.opensPicker": "{label}: {n}. Opens picker.",

  // ── syncPill ──
  "syncPill.sync": "Sync",
  "syncPill.everythingIsUpToDate": "Everything is up to date.",
  "syncPill.orders": "Orders · {count}",
  "syncPill.statusChanges": "Status changes · {count}",
  "syncPill.documents": "Documents · {count}",
  "syncPill.page": " — page {pageIndex}",
  "syncPill.syncedStillWaitingSeeIndividual": "{sent} synced · {failedNow} still waiting. See individual items for the reason.",

  // ── updateBanner ──
  "updateBanner.updateAvailable": "Update available",
  "updateBanner.restartToInstallTheLatest": "Restart to install the latest version.",
  "updateBanner.restartTheAppToInstall": "Restart the app to install the update",
  "updateBanner.restart": "Restart",

  // ── common ──
  "common.expoPublicAppUrlIs": "EXPO_PUBLIC_APP_URL is not set.",

  // ── accountDeletion ──
  "accountDeletion.youreSignedOutSignIn": "You're signed out. Sign in again and retry.",
  "accountDeletion.requestFailed": "Request failed ({status}).",
  "accountDeletion.noConnectionTryAgainWhen": "No connection. Try again when you're online.",

  // ── errors ──
  "errors.savedOnYourPhoneWill": "Saved on your phone — will sync when you're back online.",
  "errors.noSignalTryAgainIn": "No signal. Try again in a moment.",
  "errors.youveBeenSignedOutSign": "You've been signed out. Sign in again to continue.",
  "errors.youDontHavePermissionFor": "You don't have permission for that. Ask an admin.",
  "errors.tooManyAttemptsWaitA": "Too many attempts. Wait a minute and try again.",
  "errors.somethingWentWrongTryAgain": "Something went wrong. Try again.",

  // ── orderCommentQueries ──
  "orderCommentQueries.saySomethingBeforeSending": "Say something before sending.",
  "orderCommentQueries.tooLong4000CharMax": "Too long (4000 char max).",

  // ── common ──
  "common.notSignedIn": "Not signed in.",

  // ── requestCode ──
  "requestCode.tooManyCodeRequestsTry": "Too many code requests. Try again later.",
  "requestCode.requestFailed": "Request failed ({status}).",

  // ── uploads ──
  "uploads.fileNoLongerExistsOn": "File no longer exists on device.",
  "uploads.fileMustBe10Mb": "File must be 10 MB or smaller.",
  "uploads.uploadEndpointNotConfigured": "Upload endpoint not configured.",
  "uploads.uploadFailed": "Upload failed.",
  "uploads.uploadFailed2": "Upload failed: {message}",

  // ── useOptimisticStatus ──
  "useOptimisticStatus.couldntUpdateStatus": "Couldn't update status",

  // ── whatsapp ──
  "whatsapp.whatsappNotAvailable": "WhatsApp not available",
  "whatsapp.installWhatsappOrCopyThe": "Install WhatsApp or copy the message manually.",

  // ── paymentTerm ──
  "paymentTerm.ADVANCE": "Advance",
  "paymentTerm.CREDIT": "Credit",
  "paymentTerm.PDC": "PDC",
  "paymentTerm.IMMEDIATE": "Immediate",
  "paymentTerm.AGAINST_DISPATCH": "Against dispatch",
  "paymentTerm.OTHER": "Other",

  // ── transport ──
  "transport.PAID": "Paid",
  "transport.TO_PAY": "To pay",
  "transport.GODOWN": "Godown",
  "transport.DOOR": "Door",
  "transport.OTHER": "Other",

  // ── paymentMethod ──
  "paymentMethod.CASH": "Cash",
  "paymentMethod.CHEQUE": "Cheque",
  "paymentMethod.NEFT": "NEFT",
  "paymentMethod.RTGS": "RTGS",
  "paymentMethod.UPI": "UPI",
  "paymentMethod.OTHER": "Other",

  // ── paymentDoc ──
  "paymentDoc.BANK_SCREENSHOT": "Bank screenshot",
  "paymentDoc.CHEQUE_PHOTO": "Cheque photo",
  "paymentDoc.UPI_SCREENSHOT": "UPI screenshot",
  "paymentDoc.RECEIPT": "Signed receipt",
  "paymentDoc.OTHER": "Other",

  // ── orderDoc ──
  "orderDoc.INVOICE": "Invoice",
  "orderDoc.LORRY_RECEIPT": "Lorry receipt",
  "orderDoc.ORDER_PROOF": "Order proof",
  "orderDoc.OTHER": "Other",

  // ── holdReason ──
  "holdReason.RAW_MATERIAL_SHORTAGE": "Raw material shortage",
  "holdReason.AWAITING_CUSTOMER_CONFIRMATION": "Waiting for customer to confirm",
  "holdReason.PAYMENT_HOLD": "Payment hold",
  "holdReason.OTHER": "Other",

  // ── lineStatus ──
  "lineStatus.PENDING": "Pending",
  "lineStatus.IN_PRODUCTION": "In production",
  "lineStatus.READY": "Ready",

  // ── role ──
  "role.ADMIN": "Management",
  "role.STAFF": "Sales",
  "role.FACTORY": "Factory",

  // ── common ──
  "common.unknownCustomer": "Unknown customer",

  // ── payments ──
  "payments.invoiceNumber": "Invoice {number}",
  "payments.recordedBy": "Recorded by {name}",

  // ── common ──
  "common.placedOn": "Placed {date}",

  // ── adminApprovals ──
  "adminApprovals.empty": "Nothing pending. All caught up.",

  // ── adminFactory ──
  "adminFactory.avg": "Avg {time}",

  // ── time ──
  "time.hoursShort": "{n} h",
  "time.daysShort": "{n} d",

  // ── adminFactory ──
  "adminFactory.lastChange": "{status} · last change {date}",

  // ── adminTeam ──
  "adminTeam.subtitle": "Last {days} days · tap a row to see orders · long-press the pill to turn a person on or off.",

  // ── authCode ──
  "authCode.genericError": "That code didn't work. Ask for a fresh code from the email screen.",
  "authCode.networkError": "Couldn't reach Syncit to check the code. Check your internet and tap Verify again — your code is still valid.",

  // ── factoryHome ──
  "factoryHome.lastOrderArrived": "Last order arrived {when}",
  "factoryHome.chaseAdmin": "Ask: management.",
  "factoryHome.chasePerson": "Ask: {name}.",
  "factoryHome.chaseSalesperson": "Ask: the salesperson.",

  // ── factoryStep ──
  "factoryStep.IN_PRODUCTION": "Start production",
  "factoryStep.READY_TO_DISPATCH": "Mark packed and ready",
  "factoryStep.DISPATCHED": "Mark dispatched",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.moveTo": "Move {orderNumber} to {status}?",
  "factoryOrdersDetail.pendingChanges.one": "{count} status change is waiting to sync for this order. It will apply by itself when the phone is back online.",
  "factoryOrdersDetail.pendingChanges.other": "{count} status changes are waiting to sync for this order. They will apply by themselves when the phone is back online.",

  // ── common ──
  "common.placedBy": "Placed by {name}",
  "common.salesperson": "salesperson",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.lineStart": "Start",
  "factoryOrdersDetail.lineMarkReady": "Mark ready",
  "factoryOrdersDetail.lineDone": "Done",

  // ── common ──
  "common.pageN": "Page {n}",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.uploadPages.one": "Upload {count} page",
  "factoryOrdersDetail.uploadPages.other": "Upload {count} pages",
  "factoryOrdersDetail.waitingToUpload": "{count} waiting to upload",

  // ── common ──
  "common.queuedOn": "Queued {date}",
  "common.attempts.one": "{count} attempt",
  "common.attempts.other": "{count} attempts",

  // ── home ──
  "home.viewing": "Viewing: {scope}",

  // ── common ──
  "common.items.one": "{count} item",
  "common.items.other": "{count} items",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.cancelReasonPrompt": "Give a short reason — it shows on the order timeline.",
  "staffOrdersDetail.openDoc": "Open {name}",
  "staffOrdersDetail.openDocPages": "Open {name}, {count} pages",

  // ── staffOrdersEdit ──
  "staffOrdersEdit.lockedItems": "This order is {status}. Items can only be changed before dispatch.",
  "staffOrdersEdit.locked": "This order is {status}. It can only be changed before dispatch.",

  // ── staffOrdersNew ──
  "staffOrdersNew.ledgerCustomer": "Ledger customer",
  "staffOrdersNew.moreMatches": "+{count} more — keep typing to narrow.",

  // ── staffOrdersNewReview ──
  "staffOrdersNewReview.overLimitBody": "Outstanding {outstanding} + this order {order} = {projected}, which is over the {limit} limit. Management may need to approve.",
  "staffOrdersNewReview.belowFloorLine": "Line {line} · {product}: {rate} is below the floor rate {floor}. Management must approve before the factory sees the order.",
  "staffOrdersNewReview.itemsHeader.one": "Items · {count} line",
  "staffOrdersNewReview.itemsHeader.other": "Items · {count} lines",

  // ── payments ──
  "payments.proofs.one": "{count} proof",
  "payments.proofs.other": "{count} proofs",

  // ── updateRequired ──
  "updateRequired.body": "Your company has released a required security update. You are on Syncit {current}; the oldest version allowed is {minimum}.\n\nInstall the latest version from the Play Store or the link your manager gave you, then open Syncit again.",

  // ── sync ──
  "sync.itemsSynced.one": "{count} item synced.",
  "sync.itemsSynced.other": "{count} items synced.",
  "sync.pill.syncing": "Syncing…",
  "sync.pill.failed": "{count} failed",
  "sync.pill.queued": "{count} waiting",
  "sync.pill.offlineQueued": "Offline · {count} waiting",
  "sync.pill.synced": "Synced",
  "sync.pill.offline": "Offline",
  "sync.a11y.syncing": "Syncing now. Tap for details.",
  "sync.a11y.failed.one": "{count} item failed to sync. Tap to see why.",
  "sync.a11y.failed.other": "{count} items failed to sync. Tap to see why.",
  "sync.a11y.queued.one": "{count} item waiting to sync. Tap for details.",
  "sync.a11y.queued.other": "{count} items waiting to sync. Tap for details.",
  "sync.a11y.synced": "Everything synced. Tap for details.",
  "sync.a11y.offline": "You're offline. Tap for details.",
  "sync.sheet.failed": "Some items could not be sent. The reason is shown under each one. Trying again will not help until that is fixed — tell your manager.",
  "sync.sheet.syncing": "Sending now.",
  "sync.sheet.nothing": "Nothing waiting.",
  "sync.sheet.offline": "You're offline.",
  "sync.queuedMeta": "Saved {date}",
  "sync.retries.one": "{count} retry",
  "sync.retries.other": "{count} retries",

  // ── stock ──
  "stock.out": "Out of stock",
  "stock.low": "Low",
  "stock.in": "In stock",

  // ── itemSheet ──
  "itemSheet.typeNameBelow": "Type a name below",

  // ── common ──
  "common.choose": "Choose…",
  "common.searchEllipsis": "Search…",

  // ── timeline ──
  "timeline.overdueBy.one": "Overdue by {count} day",
  "timeline.overdueBy.other": "Overdue by {count} days",

  // ── auth ──
  "auth.revoked": "This phone was signed out by your manager.",

  // ── notifications ──
  "notifications.channel": "Order updates",

  // ── time ──
  "time.justNow": "just now",
  "time.minutesAgo.one": "{count} minute ago",
  "time.minutesAgo.other": "{count} minutes ago",
  "time.hoursAgo.one": "{count} hour ago",
  "time.hoursAgo.other": "{count} hours ago",
  "time.daysAgo.one": "{count} day ago",
  "time.daysAgo.other": "{count} days ago",

  // ── adminHome ──
  "adminHome.acrossAllCustomers": "Across all customers",
  "adminHome.dsoHint": "Average days customers take to pay (approx.)",
  "adminHome.pastExpected": "Past the expected delivery date",
  "adminHome.lastMonth": "Last month: {amount}",
  "adminHome.vsLastMonth": "{arrow} {percent}% vs last month ({amount})",

  // ── tabs ──
  "tabs.today": "Today",
  "tabs.customers": "Customers",
  "tabs.orders": "Orders",
  "tabs.payments": "Payments",
  "tabs.toMake": "To make",
  "tabs.toDispatch": "To dispatch",
  "tabs.doneToday": "Done today",
  "tabs.home": "Home",

  // ── today ──
  "today.count.one": "{count} customer to follow up",
  "today.count.other": "{count} customers to follow up",
  "today.empty": "All caught up for today.",
  "today.emptyBody": "No payments to follow up right now. Pull down to check again.",
  "today.daysOverdue.one": "{count} day overdue",
  "today.daysOverdue.other": "{count} days overdue",
  "today.dueNow": "Payment due",
  "today.brokenPromise": "Promised {date} — not paid",
  "today.promiseDueToday": "Promised to pay today",
  "today.call": "Call",
  "today.whatsapp": "WhatsApp",
  "today.promise": "Promise",
  "today.payment": "Payment",
  "today.callA11y": "Call {name}",
  "today.whatsappA11y": "Send {name} a WhatsApp reminder",
  "today.promiseA11y": "Note a payment promise from {name}",
  "today.paymentA11y": "Record a payment from {name}",
  "today.noPhone": "No phone number saved for this customer.",
  "today.rowA11y": "{name}, {amount} outstanding, {overdue}",

  // ── promise ──
  "promise.title": "Payment promise",
  "promise.subtitle": "{name} · {amount} outstanding",
  "promise.amount": "Amount promised (₹)",
  "promise.amountInvalid": "Enter the amount promised.",
  "promise.when": "When will they pay?",
  "promise.tomorrow": "Tomorrow",
  "promise.inDays": "In {count} days",
  "promise.pickDate": "Pick a date",
  "promise.summary": "Will pay {amount} on {date}.",
  "promise.save": "Save promise",
  "promise.saved": "Promise saved: {amount} on {date}",

  // ── customers ──
  "customers.subtitle": "Tap a customer to see what they owe.",
  "customers.empty": "No customers yet.",
  "customers.emptyBody": "Customers your manager assigns to you appear here.",
  "customers.noMatch": "No customer matches that name.",
  "customers.nothingDue": "Nothing due",
  "customers.add": "Add customer",
  "customers.rowA11yOwes": "{name}, {amount} outstanding",
  "customers.rowA11yClear": "{name}, nothing due",

  // ── payments ──
  "payments.record": "Record payment",
  "payments.amount": "Amount received (₹)",
  "payments.amountPlaceholder": "e.g. 12500",
  "payments.method": "How was it paid?",
  "payments.reference": "Reference (UTR / cheque no.)",
  "payments.save": "Save payment",
  "payments.saved": "Saved: {amount} from {name}",
  "payments.proofHint": "Next: add a photo of the bank or UPI screenshot so the accounts team does not have to ask.",
  "payments.proofSaved": "Proof added",
  "payments.changeCustomer": "Change customer",
  "payments.rowA11y": "{name}, {amount}, {date}",

  // ── common ──
  "common.close": "Close",
  "common.notNow": "Not now",
  "common.optional": "Optional",

  // ── list ──
  "list.errorTitle": "Could not load",

  // ── auth ──
  "auth.email.label": "Work email",
  "auth.email.subtitle": "We will email you a 6-digit code.",
  "auth.email.invalid": "Enter a valid email address.",
  "auth.email.newHere": "New to Syncit? Ask your manager to invite you, or create your company at",
  "auth.email.newHereInviteOnly": "New to Syncit? Ask your manager to send an invite to your email address.",
  "auth.email.openWebsite": "Open getsyncit.app in the browser",

  // ── lock ──
  "lock.offerTitle": "Lock Syncit with your fingerprint?",
  "lock.offerPinTitle": "Lock Syncit with a PIN?",
  "lock.offerBody": "Keeps your customers and orders private if someone else picks up this phone. You can change this later in Settings.",
  "lock.requiredBody": "Your company requires a lock on this app. It keeps customers and orders private if someone else picks up this phone.",
  "lock.turnOn": "Turn on",
  "lock.turnedOn": "App lock is on",
  "lock.usePinInstead": "Use a PIN instead",
  "lock.useFingerprintInstead": "Use fingerprint instead",
  "lock.choosePin": "Choose a 6-digit PIN",
  "lock.confirmPin": "Type the PIN again",
  "lock.pinSixDigits": "The PIN must be exactly 6 digits.",
  "lock.pinMismatch": "The two PINs do not match.",
  "lock.pinSaveFailed": "Could not save the PIN. Try again.",
  "lock.biometricCancelled": "Fingerprint was not confirmed. Try again, or use a PIN.",
  "lock.confirmPrompt": "Confirm to turn on app lock",
  "lock.unlockPrompt": "Unlock Syncit",
  "lock.usePin": "Use PIN",

  // ── push ──
  "push.reason": "Get told when your order is dispatched.",
  "push.turnOn": "Turn on",
  "push.enabled": "Notifications are on",
  "push.blocked": "Notifications are blocked. Allow them for Syncit in your phone's settings.",

  // ── settings ──
  "settings.open": "Open settings",
  "settings.language": "Language",
  "settings.notifications": "Notifications",
  "settings.role": "Signed in as: {role}",
  "settings.couldNotSave": "Could not save. Check your signal and try again.",
  "settings.lock.section": "App lock",
  "settings.lock.label": "Lock Syncit",
  "settings.lock.hint": "Ask for your fingerprint when the app opens.",
  "settings.lock.pinHint": "Ask for your PIN when the app opens.",
  "settings.lock.requiredHint": "Your company requires this. It cannot be turned off.",
  "settings.lock.offTitle": "Turn off app lock?",
  "settings.lock.offBody": "Anyone who picks up this phone will be able to open Syncit.",
  "settings.lock.offConfirm": "Turn off",
  "settings.lock.turnedOff": "App lock is off",

  // ── wizard ──
  "wizard.leave.body": "You can save it and finish later, or discard everything you entered.",
  "wizard.leave.keep": "Keep editing",
  "wizard.leave.saveDraft": "Save for later",
  "wizard.leave.close": "Close this order",

  // ── orders ──
  "orders.productPlusMore": "{name} · +{count} more",
  "orders.lines.one": "{count} line",
  "orders.lines.other": "{count} lines",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.statusUpdated": "Updated: {status}",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.cancelled": "{orderNumber} cancelled",

  // ── adminApprovals ──
  "adminApprovals.rejected": "{orderNumber} rejected",

  // ── activity ──
  "activity.commentPosted": "Comment posted",

  // ── uploads ──
  "uploads.pagesUploaded.one": "{count} page uploaded",
  "uploads.pagesUploaded.other": "{count} pages uploaded",
  "uploads.someQueued": "{uploaded} uploaded · {queued} saved on your phone — they will send when you are back online.",

  // ── timeline ──
  "timeline.minutesAfter": "{n} min after the previous step",
  "timeline.hoursAfter": "{n} h after the previous step",
  "timeline.daysAfter": "{n} d after the previous step",

  // ── whatsapp ──
  "whatsapp.hello": "Hello {name},",
  "whatsapp.helloNoName": "Hello,",
  "whatsapp.pendingFor.one": "A gentle reminder — {amount} has been pending for {count} day on your account.",
  "whatsapp.pendingFor.other": "A gentle reminder — {amount} has been pending for {count} days on your account.",
  "whatsapp.due": "A gentle reminder — {amount} is due on your account.",
  "whatsapp.payOnline": "You can pay online here: {url}",
  "whatsapp.whenCanWeExpect": "Please let me know when we can expect the payment.",
  "whatsapp.thanks": "Thank you!",

  // ── statement ──
  "statement.share": "Send statement",
  "statement.shareA11y": "Send {name} their statement of account",
  "statement.title": "Statement of account — {name}",
  "statement.failed": "Could not prepare the statement. Try again.",
  "statement.linkMessage": "Statement of account for {name}. Open it here (link works for {days} days): {url}",
  "settings.dailyPlan.label": "Daily follow-up summary",
  "settings.dailyPlan.hint": "At 9 in the morning: how many customers to follow up with today, and how much. Not sent on Sundays.",
  "admin.needsYou.title": "Needs you",
  "admin.needsYou.brokenPromises.one": "{count} customer missed a payment promise",
  "admin.needsYou.brokenPromises.other": "{count} customers missed a payment promise",
  "admin.needsYou.more": "+{count} more in Sales view → Today",
  "admin.needsYou.rowA11y": "{name}, {amount} outstanding, promised {date}, not paid",
  "settings.help": "Help and how-to guides",
} as const;

export type Key = keyof typeof en;
