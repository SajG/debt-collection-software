import type { Key } from "./en";

export const hi: Record<Key, string> = {

  "home.greeting": "नमस्ते, {name}",
  "home.subtitle": "आपके ऑर्डर, नए सबसे ऊपर।",
  "home.newOrder": "नया ऑर्डर",
  "home.signOut": "साइन आउट",
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
  "confirm.signOut.body": "दोबारा साइन इन करने के लिए ऑफिस का ईमेल चाहिए होगा।",
  "confirm.cancel": "रद्द करें",
  "confirm.ok": "हां, साइन आउट",
  "confirm.discard.title": "यह ऑर्डर हटाएं?",
  "confirm.discard.ok": "हां, हटाएं",

  "offline.banner": "आप ऑफलाइन हैं। ऑर्डर सेव होकर सिग्नल आने पर भेजे जाएंगे।",
  "offline.queued": "{count} ऑर्डर भेजने के लिए तैयार हैं।",
  "billing.locked.trial": "आपका ट्रायल खत्म हो गया है — ऑर्डर जोड़ते रहने के लिए प्लान चुनें। आपका डेटा सुरक्षित है।",
  "billing.locked.payment": "पिछला भुगतान नहीं हुआ — ऑर्डर जोड़ते रहने के लिए प्लान चुनें। आपका डेटा सुरक्षित है।",
  "billing.locked.other": "यह वर्कस्पेस अभी सिर्फ देखने के लिए है — ऑर्डर जोड़ते रहने के लिए प्लान चुनें। आपका डेटा सुरक्षित है।",
  "billing.pastDue": "पिछला भुगतान नहीं हुआ। ऑर्डर जोड़ते रहने के लिए {date} तक भुगतान करें। आपका डेटा सुरक्षित है।",
  "billing.ownerHint": "अकाउंट ओनर वेब पर Settings → Billing में प्लान चुन सकते हैं।",
  "tallySync.lastSynced": "Tally से आखिरी सिंक: {time} ({ago})",
  "tallySync.never": "Tally कनेक्टर सेट है, पर अभी तक सिंक नहीं हुआ।",
  "tallySync.stale": "Tally काफी देर से सिंक नहीं हुआ। क्या Tally वाला PC चालू है और Syncit कनेक्टर चल रहा है?",
  "tallySync.failing": "Tally सिंक नहीं हो पा रहा। Tally वाले PC पर Syncit कनेक्टर देखें।",
  "tallySync.refreshHint": "फिर से जांचने के लिए टैप करें",
  "splash.trust": "आपका डेटा एन्क्रिप्टेड है और सिर्फ आपकी कंपनी के लिए है",
  "account.title": "अकाउंट",
  "account.open": "अकाउंट और अकाउंट डिलीट",
  "account.delete.title": "मेरा अकाउंट डिलीट करें",
  "account.delete.removedTitle": "क्या डिलीट होगा",
  "account.delete.removed": "आपका लॉगिन, नाम, फ़ोन नंबर और ईमेल, नोटिफ़िकेशन सेटिंग्स, और इस अकाउंट से जुड़े सभी फ़ोन। Syncit की हर कंपनी से आपकी पहुँच हट जाएगी।",
  "account.delete.keptTitle": "कंपनी के पास क्या रहेगा",
  "account.delete.kept": "आपके दर्ज किए ऑर्डर, पेमेंट और नोट्स कंपनी के रिकॉर्ड हैं। वे कंपनी के पास रहेंगे और आपका नाम \"Former member\" दिखेगा।",
  "account.delete.owner": "अगर आप किसी कंपनी के ओनर हैं, तो पहले किसी और को ओनर बनाएँ या कंपनी डिलीट करें (वेब: Settings → Company)।",
  "account.delete.typeToConfirm": "पुष्टि के लिए DELETE लिखें",
  "account.delete.ownerBlocked": "आप अभी भी ओनर हैं: {companies}। किसी और को ओनर बनाएँ या कंपनी डिलीट करें, फिर दोबारा कोशिश करें।",
  "account.delete.button": "मेरा अकाउंट डिलीट करें",

  "wizard.step": "चरण {n} / {total}",
  "wizard.back": "वापस",

  "factory.tab.queue": "बनाना है",
  "factory.tab.inProd": "बन रहा है",
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

  // ── detail ──
  "detail.rejected": "ऑर्डर अस्वीकृत",
  "detail.waitingApproval": "डायरेक्टर की मंज़ूरी का इंतज़ार",
  "detail.waitingApprovalHint": "जब तक मैनेजमेंट इस ऑर्डर को मंज़ूर नहीं करता, फैक्ट्री काम शुरू नहीं कर सकती।",
  "detail.product": "प्रोडक्ट",
  "detail.quantity": "मात्रा",
  "detail.rate": "रेट",
  "detail.payment": "पेमेंट",
  "detail.transport": "ट्रांसपोर्ट",
  "detail.expected": "डिलीवरी की उम्मीद",
  "detail.notes": "नोट्स",
  "detail.timeline": "प्रगति",
  "detail.futureStep": "आगे",
  "detail.byLine": "{name} द्वारा",
  "detail.notFound": "ऑर्डर नहीं मिला।",

  // ── dues ──
  "dues.title": "ग्राहक का बकाया",
  "dues.search": "ग्राहक खोजें",
  "dues.total": "कुल बकाया",
  "dues.invoices": "बिना चुकाए बिल",
  "dues.dueOn": "देय {date}",
  "dues.empty": "कोई बकाया बिल नहीं।",
  "dues.updated": "Tally से आख़िरी सिंक {time}",
  "dues.updatedNever": "अभी तक Tally से सिंक नहीं हुआ",

  // ── unsupported ──
  "unsupported.title": "यह ऐप सेल्स टीम के लिए है",
  "unsupported.body": "आपका अकाउंट {role} के रूप में बना है। कृपया कंप्यूटर पर Syncit वेब का उपयोग करें।",
  "unsupported.signOut": "साइन आउट",

  // ── noProfile ──
  "noProfile.title": "अकाउंट तैयार नहीं है",
  "noProfile.body": "आपका अकाउंट अभी पूरा सेट नहीं हुआ है। कृपया ऑफिस से इसे पूरा करवाएँ, फिर दोबारा साइन इन करें।",
  "noProfile.signOut": "साइन आउट",

  // ── loading ──
  "loading": "लोड हो रहा है…",

  // ── retry ──
  "retry": "फिर कोशिश करें",

  // ── detail ──
  "detail.dispatchTo": "कहाँ भेजना है",
  "detail.expectedDelivery": "डिलीवरी की उम्मीद",
  "detail.expectedProduction": "बनने की अनुमानित तारीख",
  "detail.tokenGift": "टोकन / गिफ्ट",
  "detail.callSalesperson": "{name} को कॉल करें",
  "detail.lineItems": "आइटम · {count}",

  // ── queue ──
  "queue.online.hint": "अपने आप फिर कोशिश हो रही है। तुरंत भेजने के लिए ‘अभी भेजें’ दबाएँ।",
  "queue.offline.hint": "आप ऑफलाइन हैं। नेटवर्क आने पर सब अपने आप भेज दिया जाएगा।",

  // ── common ──
  "common.approvals": "मंज़ूरी",
  "common.team": "टीम",
  "common.factory": "फैक्ट्री",
  "common.approveFailed": "मंज़ूरी नहीं हो सकी",

  // ── adminApprovals ──
  "adminApprovals.nowOnTheFactoryFloor": "{orderNumber} — {partyName}\nअब फैक्ट्री में है।",
  "adminApprovals.rateApprovedFactoryCanStart": "{orderNumber} — रेट मंज़ूर। फैक्ट्री काम शुरू कर सकती है।",
  "adminApprovals.rateApprovals": "रेट की मंज़ूरी",
  "adminApprovals.rateExceptionsCanOnlyBe": "रेट की छूट को सिर्फ मंज़ूर किया जा सकता है या रुका छोड़ा जा सकता है।",
  "adminApprovals.reject": "{orderNumber} अस्वीकार करें?",
  "adminApprovals.theSalespersonWillGetA": "सेल्समैन को नोटिफिकेशन मिलेगा।",

  // ── common ──
  "common.reject": "अस्वीकार करें",
  "common.rejectFailed": "अस्वीकार नहीं हो सका",

  // ── adminApprovals ──
  "adminApprovals.swipeRightToApproveSwipe": "मंज़ूर करने के लिए दाएँ सरकाएँ। कारण के साथ अस्वीकार करने के लिए बाएँ सरकाएँ।",

  // ── common ──
  "common.approve": "मंज़ूर करें",

  // ── adminApprovals ──
  "adminApprovals.orderApproval": "ऑर्डर की मंज़ूरी",
  "adminApprovals.rateException": "रेट में छूट",

  // ── adminFactory ──
  "adminFactory.readOnlyViewOfThe": "फैक्ट्री का हाल, सिर्फ देखने के लिए। औसत पिछले 60 दिनों का है।",
  "adminFactory.stage": "चरण",
  "adminFactory.stuck24H": "24 घंटे से ज़्यादा अटके",
  "adminFactory.nothingStuckEveryInFlight": "कुछ अटका नहीं। हर चालू ऑर्डर 24 घंटे में आगे बढ़ा।",

  // ── adminHome ──
  "adminHome.switchToSalespersonView": "सेल्स व्यू पर जाएँ",
  "adminHome.totalOutstanding": "कुल बकाया",
  "adminHome.overdueInvoices": "लेट बिल",
  "adminHome.collectedThisMonth": "इस महीने मिला पेमेंट",
  "adminHome.placedToday": "आज के ऑर्डर",
  "adminHome.placedThisWeek": "इस हफ्ते के ऑर्डर",
  "adminHome.awaitingMyApproval": "मेरी मंज़ूरी के लिए",
  "adminHome.rateApprovalsPending": "रेट की मंज़ूरी बाकी",
  "adminHome.overdueDeliveries": "लेट डिलीवरी",

  // ── common ──
  "common.onHold": "रोका गया",

  // ── adminHome ──
  "adminHome.dispatchedThisMonth": "इस महीने भेजा",
  "adminHome.liveUpdatesWheneverASales": "लाइव · ऑर्डर बदलते ही अपडेट होता है।",

  // ── adminTeam ──
  "adminTeam.reactivate": "{ownerName} को फिर चालू करें?",
  "adminTeam.deactivate": "{ownerName} को बंद करें?",
  "adminTeam.theyWillBeAbleTo": "वे फिर से साइन इन कर सकेंगे और ऑर्डर डाल सकेंगे।",
  "adminTeam.theyWillBeSignedOut": "वे साइन आउट हो जाएँगे और साइन इन नहीं कर पाएँगे। उनका पुराना डेटा रहेगा।",
  "adminTeam.reactivate2": "फिर चालू करें",
  "adminTeam.deactivate2": "बंद करें",

  // ── common ──
  "common.couldNotUpdate": "अपडेट नहीं हो सका",

  // ── adminTeam ──
  "adminTeam.noTeamMembers": "टीम में कोई नहीं।",
  "adminTeam.deactivateUser": "यूज़र बंद करें",
  "adminTeam.reactivateUser": "यूज़र फिर चालू करें",
  "adminTeam.orders": "ऑर्डर",
  "adminTeam.value": "रकम",
  "adminTeam.avgOD": "औसत ऑर्डर→डिस्पैच",
  "adminTeam.overdue": "लेट",

  // ── authCode ──
  "authCode.enterThe6DigitCode": "6 अंकों का कोड डालें।",
  "authCode.dev": "{error}\n[dev] {message}",
  "authCode.enterYourCode": "अपना कोड डालें",
  "authCode.devPhoneEnterDevOtp": "Dev phone {identifier}. Enter dev OTP.",
  "authCode.ifIsRegisteredA6": "अगर {identifier} रजिस्टर है, तो 6 अंकों का कोड भेजा जा रहा है। उसे नीचे डालें।",
  "authCode.6DigitCode": "6 अंकों का कोड",
  "authCode.verify": "जाँचें",
  "authCode.resendInS": "{cooldownLeft} सेकंड में फिर भेजें",
  "authCode.resendCode": "कोड फिर भेजें",
  "authCode.changePhone": "फोन बदलें",
  "authCode.changeEmail": "ईमेल बदलें",

  // ── authEmail ──
  "authEmail.dismiss": "हटाएँ",
  "authEmail.signInToSyncit": "Syncit में साइन इन करें",
  "authEmail.sendCode": "कोड भेजें",
  "authCode.password": "पासवर्ड",
  "authCode.enterYourPassword": "अपना पासवर्ड दर्ज करें।",
  "authCode.enterYourPasswordTitle": "अपना पासवर्ड दर्ज करें",
  "authCode.wrongPassword": "ईमेल या पासवर्ड गलत है।",
  "authCode.useCodeInstead": "इसके बजाय मुझे कोड ईमेल करें",
  "authEmail.usePassword": "पासवर्ड से साइन इन करें",
  "authEmail.signIn": "साइन इन करें",
  "join.title": "{company} से जुड़ें",
  "join.subtitle": "{inviter} ने आपको {role} के रूप में आमंत्रित किया है।",
  "join.yourManager": "आपके मैनेजर",
  "join.role.admin": "प्रबंधन",
  "join.role.staff": "सेल्स",
  "join.role.factory": "फैक्टरी",
  "join.field.name": "आपका नाम",
  "join.field.phone": "मोबाइल (वैकल्पिक)",
  "join.field.password": "पासवर्ड चुनें (10+ अक्षर)",
  "join.submit": "टीम से जुड़ें",
  "join.err.name": "अपना नाम दर्ज करें।",
  "join.err.phone": "10 अंकों का भारतीय मोबाइल नंबर दर्ज करें।",
  "join.err.password": "पासवर्ड कम से कम 10 अक्षरों का रखें।",
  "join.err.network": "कनेक्शन नहीं है। इंटरनेट जाँचकर फिर कोशिश करें।",
  "join.err.generic": "जुड़ नहीं सके। कृपया फिर कोशिश करें।",
  "join.invalid.title": "आमंत्रण उपलब्ध नहीं",
  "join.invalid.body": "यह आमंत्रण समाप्त हो गया है या रद्द कर दिया गया है। अपने मैनेजर से नया भेजने को कहें।",
  "join.network.title": "आमंत्रण लोड नहीं हो सका",
  "join.network.body": "इंटरनेट कनेक्शन जाँचें और लिंक फिर खोलें।",
  "join.goToSignIn": "साइन इन पर जाएँ",
  "join.exists.body": "{email} का Syncit खाता पहले से है। वेब पर आमंत्रण स्वीकार करें, फिर यहाँ साइन इन करें।",
  "join.exists.openWeb": "वेब पर स्वीकार करें",

  // ── factoryHome ──
  "factoryHome.order": "ऑर्डर",
  "factoryHome.orders": "ऑर्डर",

  // ── common ──
  "common.awaitingAdminApproval": "मैनेजमेंट की मंज़ूरी का इंतज़ार",

  // ── factoryHome ──
  "factoryHome.anAdminMustApproveBefore": "फैक्ट्री को दिखने से पहले मैनेजमेंट की मंज़ूरी ज़रूरी है।",
  "factoryHome.noReasonRecorded": "कोई कारण दर्ज नहीं।",
  "factoryHome.belowFloorRate": "फ्लोर रेट से कम",
  "factoryHome.oneOrMoreLinesAre": "एक या ज़्यादा आइटम फ्लोर रेट से कम हैं, मैनेजमेंट की मंज़ूरी चाहिए।",
  "factoryHome.blocked": "रुका हुआ",
  "factoryHome.unknownReason": "कारण पता नहीं।",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.updateFailed": "अपडेट नहीं हो सका",

  // ── common ──
  "common.savedOnYourPhone": "फोन में सेव हो गया",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.willApplyAutomaticallyWhenYoure": "नेटवर्क आने पर अपने आप लागू हो जाएगा।",

  // ── common ──
  "common.couldNotOpenDialer": "डायलर नहीं खुल सका",
  "common.orderNotFound": "ऑर्डर नहीं मिला।",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.thisOrderIsntOnThe": "यह ऑर्डर अभी फैक्ट्री में नहीं पहुँचा है। काम शुरू होने से पहले मैनेजमेंट की मंज़ूरी चाहिए।",

  // ── common ──
  "common.notes": "नोट्स",
  "common.confirm": "पक्का करें",
  "common.cancelOrder": "ऑर्डर रद्द करें",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.cancelOrder": "ऑर्डर रद्द करें?",
  "factoryOrdersDetail.markAsCancelledThisCant": "{orderNumber} को रद्द किया जाएगा। मोबाइल से इसे वापस नहीं किया जा सकता।",

  // ── common ──
  "common.unknownUser": "अनजान यूज़र",
  "common.call": "☎ कॉल",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.ratePending": "  ·  रेट बाकी",
  "factoryOrdersDetail.line": "लाइन {lineNumber}: {label}",
  "factoryOrdersDetail.ready": "✓ तैयार",

  // ── common ──
  "common.couldNotSave": "सेव नहीं हो सका",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.notSet": "तय नहीं",

  // ── common ──
  "common.saving": "सेव हो रहा है…",
  "common.change": "बदलें",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.set": "तय करें",

  // ── common ──
  "common.documents": "दस्तावेज़",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.chooseADocumentTypeFirst": "पहले दस्तावेज़ का प्रकार चुनें, फिर हर पन्ने की फोटो लें। कई पन्नों का दस्तावेज़ (जैसे 3 पन्ने की LR) एक ही दस्तावेज़ की तरह अपलोड होता है।",
  "factoryOrdersDetail.whatAreYouUploading": "आप क्या अपलोड कर रहे हैं?",
  "factoryOrdersDetail.changeType": "प्रकार बदलें",
  "factoryOrdersDetail.addPage": "पन्ना {n} जोड़ें",
  "factoryOrdersDetail.addPageTakePhotoAbove": "पन्ना {n} जोड़ें (ऊपर फोटो लें)",

  // ── common ──
  "common.uploading": "अपलोड हो रहा है…",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.page": " — पन्ना {pageIndex}",

  // ── common ──
  "common.noDocumentsYet": "अभी कोई दस्तावेज़ नहीं।",
  "common.couldNotOpen": "नहीं खुल सका",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.tryAgainLater": "थोड़ी देर बाद फिर कोशिश करें।",
  "factoryOrdersDetail.pages": " — {pageCount} पन्ने",
  "factoryOrdersDetail.page2": "पन्ना {n} →",
  "factoryOrdersDetail.open": "खोलें →",

  // ── staffCustomersNew ──
  "staffCustomersNew.addCustomer": "ग्राहक जोड़ें",
  "staffCustomersNew.onlyAdminUsersCanCreate": "ऐप से ग्राहक सिर्फ मैनेजमेंट जोड़ सकता है। सेल्समैन ऑर्डर में ग्राहक का नाम लिख दें — मैनेजमेंट बाद में उसे पक्का कर देगा।",

  // ── common ──
  "common.nameRequired": "नाम ज़रूरी है",
  "common.enterTheCustomerName": "ग्राहक का नाम डालें।",
  "common.saved": "सेव हो गया",

  // ── staffCustomersNew ──
  "staffCustomersNew.added": "{trimmed} जोड़ा गया।",
  "staffCustomersNew.onlyNameIsRequiredEverything": "सिर्फ नाम ज़रूरी है — बाकी सब बाद में वेब से भरा जा सकता है।",
  "staffCustomersNew.customerName": "ग्राहक का नाम *",
  "staffCustomersNew.phone10Digits": "फोन (10 अंक)",
  "staffCustomersNew.city": "शहर",
  "staffCustomersNew.address": "पता",
  "staffCustomersNew.creditLimit": "उधार सीमा (₹)",

  // ── staffHome ──
  "staffHome.couldntCloneOrder": "ऑर्डर दोहराया नहीं जा सका",

  // ── common ──
  "common.pleaseTryAgain": "कृपया फिर कोशिश करें।",
  "common.settings": "सेटिंग्स",

  // ── staffHome ──
  "staffHome.stock": "स्टॉक",

  // ── common ──
  "common.customer": "ग्राहक",

  // ── staffHome ──
  "staffHome.resumeInProgressOrder": "अधूरा ऑर्डर जारी रखें",
  "staffHome.resumeOrder": "ऑर्डर जारी रखें",
  "staffHome.draftInProgress": "अधूरा ऑर्डर",

  // ── common ──
  "common.customerDelivery": "ग्राहक और डिलीवरी",

  // ── staffHome ──
  "staffHome.deleteThisDraft": "यह अधूरा ऑर्डर हटाएँ?",
  "staffHome.everythingTypedForThisOrder": "इस ऑर्डर के लिए भरा हुआ सब कुछ हट जाएगा। इसे वापस नहीं लाया जा सकता।",
  "staffHome.deleteDraft": "अधूरा ऑर्डर हटाएँ",
  "staffHome.deleteThisDraft2": "यह अधूरा ऑर्डर हटाएँ",
  "staffHome.repeatThisOrder": "यह ऑर्डर दोहराएँ?",
  "staffHome.opensANewOrderWith": "उसी ग्राहक और आइटम के साथ नया ऑर्डर खुलेगा।",
  "staffHome.repeat": "दोहराएँ",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.editOrderDetails": "ऑर्डर की जानकारी बदलें",
  "staffOrdersDetail.editDetails": "✎ जानकारी बदलें",
  "staffOrdersDetail.editLineItems": "आइटम बदलें",
  "staffOrdersDetail.editItems": "✎ आइटम बदलें",
  "staffOrdersDetail.cancelThisOrder": "यह ऑर्डर रद्द करें",
  "staffOrdersDetail.cancel": "✕ रद्द करें",
  "staffOrdersDetail.awaitingYourDecision": "आपके फैसले का इंतज़ार",
  "staffOrdersDetail.approveToReleaseTheOrder": "मंज़ूर करने पर ऑर्डर फैक्ट्री को जाएगा। अस्वीकार करें तो कारण लिखें — सेल्समैन को नोटिफिकेशन मिलेगा।",
  "staffOrdersDetail.rejectionReason": "अस्वीकार करने का कारण",
  "staffOrdersDetail.eGPriceTooLow": "जैसे: रेट बहुत कम / ग्राहक का उधार रुका है",
  "staffOrdersDetail.rejectWithReason": "कारण के साथ अस्वीकार करें",
  "staffOrdersDetail.rejectThisOrder": "यह ऑर्डर अस्वीकार करें?",
  "staffOrdersDetail.theSalespersonGetsAPush": "सेल्समैन को नोटिफिकेशन मिलेगा। कारण: \"{reason}\"",
  "staffOrdersDetail.reasonRequired": "कारण ज़रूरी है",
  "staffOrdersDetail.aCancellationReasonIsRequired": "रद्द करने का कारण लिखना ज़रूरी है, ताकि बाद में समझ आए।",
  "staffOrdersDetail.cancelFailed": "रद्द नहीं हो सका",
  "staffOrdersDetail.keepOrder": "ऑर्डर रहने दें",
  "staffOrdersDetail.cancel2": "{orderNumber} रद्द करें?",
  "staffOrdersDetail.thisWillCancelTheOrder": "ऑर्डर रद्द होगा और फैक्ट्री को सूचना जाएगी।",
  "staffOrdersDetail.couldNotConfirm": "पक्का नहीं हो सका",
  "staffOrdersDetail.savedForRetry": "बाद में भेजने के लिए सेव किया",
  "staffOrdersDetail.noNetworkRightNowDelivery": "अभी नेटवर्क नहीं है — नेटवर्क आने पर डिलीवरी अपने आप पक्की हो जाएगी।",
  "staffOrdersDetail.confirmDelivered": "डिलीवरी हो गई",
  "staffOrdersDetail.closesTheOrderAndStamps": "ऑर्डर बंद होगा और डिलीवरी का समय दर्ज होगा। चाहें तो साइन की हुई LR या ग्राहक की पुष्टि की फोटो लगाएँ।",
  "staffOrdersDetail.confirming": "पक्का हो रहा है…",
  "staffOrdersDetail.confirmDelivered2": "डिलीवरी पक्की करें?",
  "staffOrdersDetail.stampsTheDeliveryTimeAnd": "डिलीवरी का समय दर्ज होगा और फोटो लग जाएगी।",
  "staffOrdersDetail.stampsTheDeliveryTimeYou": "डिलीवरी का समय दर्ज होगा। चाहें तो पहले ऊपर फोटो लगाएँ, या बिना फोटो के पक्का करें।",
  "staffOrdersDetail.page": " — पन्ना {pageIndex}",
  "staffOrdersDetail.attachAnOrderProofCustomer": "ऑर्डर का सबूत लगाएँ (ग्राहक का PO, WhatsApp पर पुष्टि)। बिल और LR फैक्ट्री से आते हैं।",
  "staffOrdersDetail.type": "प्रकार",
  "staffOrdersDetail.uploadDocument": "दस्तावेज़ अपलोड करें",
  "staffOrdersDetail.pages": " — {pageCount} पन्ने",
  "staffOrdersDetail.openPinchToZoomShare": "खोलें · ज़ूम करें · शेयर करें",

  // ── common ──
  "common.couldNotLoad": "लोड नहीं हो सका",

  // ── staffOrdersEditItemsDetail ──
  "staffOrdersEditItemsDetail.incompleteLines": "अधूरे आइटम",
  "staffOrdersEditItemsDetail.everyLineNeedsAProduct": "हर आइटम में प्रोडक्ट, मात्रा और रेट ज़रूरी है।",
  "staffOrdersEditItemsDetail.itemsUpdated": "आइटम अपडेट हो गए।",
  "staffOrdersEditItemsDetail.editItems": "आइटम बदलें",
  "staffOrdersEditItemsDetail.cannotEditItems": "आइटम नहीं बदल सकते",
  "staffOrdersEditItemsDetail.noItemsTapAddItem": "कोई आइटम नहीं। जोड़ने के लिए \"आइटम जोड़ें\" दबाएँ।",
  "staffOrdersEditItemsDetail.removeLine": "आइटम हटाएँ",

  // ── common ──
  "common.delete": "हटाएँ",

  // ── staffOrdersEditItemsDetail ──
  "staffOrdersEditItemsDetail.editLine": "आइटम बदलें",

  // ── common ──
  "common.newProduct": "नया प्रोडक्ट",
  "common.orderTotal": "ऑर्डर का कुल",
  "common.addItem": "+ आइटम जोड़ें",
  "common.saveChanges": "बदलाव सेव करें",

  // ── staffOrdersEditDetail ──
  "staffOrdersEditDetail.orderDetailsUpdated": "ऑर्डर की जानकारी अपडेट हो गई।",
  "staffOrdersEditDetail.editOrder": "ऑर्डर बदलें",
  "staffOrdersEditDetail.cannotEdit": "बदल नहीं सकते",

  // ── common ──
  "common.customerName": "ग्राहक का नाम",
  "common.typeCustomerName": "ग्राहक का नाम लिखें",

  // ── staffOrdersEditDetail ──
  "staffOrdersEditDetail.ledgerCustomer": "✓ खाते का ग्राहक",
  "staffOrdersEditDetail.savedAsNewCustomer": "नए ग्राहक के रूप में सेव होगा",

  // ── common ──
  "common.delivery": "डिलीवरी",
  "common.dispatchLocation": "भेजने की जगह",
  "common.addressGodownOrLedgerLocation": "पता, गोदाम या खाते की जगह",
  "common.expectedDelivery": "डिलीवरी की उम्मीद",
  "common.pickADate": "तारीख चुनें",
  "common.paymentTerms": "पेमेंट की शर्तें",
  "common.transport": "ट्रांसपोर्ट",
  "common.tokenGift": "टोकन / गिफ्ट",
  "common.notesOptional": "नोट्स (ज़रूरी नहीं)",

  // ── staffOrdersNewHome ──
  "staffOrdersNewHome.noLedgerMatchTheName": "खाते में यह नाम नहीं मिला — आपका लिखा नाम नए ग्राहक के रूप में सेव होगा।",
  "staffOrdersNewHome.pick": "{name} चुनें",
  "staffOrdersNewHome.anythingTheFactoryShouldKnow": "फैक्ट्री को कुछ बताना हो तो",
  "staffOrdersNewHome.eGFragileCallBefore": "जैसे: नाज़ुक माल · भेजने से पहले कॉल करें",
  "staffOrdersNewHome.continueToItems": "आइटम पर आगे बढ़ें",

  // ── staffOrdersNewItems ──
  "staffOrdersNewItems.items": "आइटम",
  "staffOrdersNewItems.noItemsYetTapAdd": "अभी कोई आइटम नहीं। पहला आइटम जोड़ने के लिए \"आइटम जोड़ें\" दबाएँ।",
  "staffOrdersNewItems.review": "जाँच",

  // ── common ──
  "common.order": "ऑर्डर",

  // ── staffOrdersNewReview ──
  "staffOrdersNewReview.someFieldsAreStillEmpty": "कुछ जानकारी अभी खाली है।",
  "staffOrdersNewReview.orderNotPlaced": "ऑर्डर नहीं गया",
  "staffOrdersNewReview.orderPlaced": "ऑर्डर चला गया",
  "staffOrdersNewReview.theFactoryWillSeeIt": "फैक्ट्री को तुरंत दिख जाएगा।",
  "staffOrdersNewReview.theOrderWillBeSent": "नेटवर्क आने पर ऑर्डर अपने आप भेज दिया जाएगा।",
  "staffOrdersNewReview.reviewPlace": "जाँचें और भेजें",
  "staffOrdersNewReview.overCreditLimit": "उधार सीमा से ज़्यादा",
  "staffOrdersNewReview.1LineBelowFloorRate": "1 आइटम फ्लोर रेट से कम",
  "staffOrdersNewReview.linesBelowFloorRate": "{count} आइटम फ्लोर रेट से कम",
  "staffOrdersNewReview.dispatchTo": "कहाँ भेजना है",
  "staffOrdersNewReview.payment": "पेमेंट",
  "staffOrdersNewReview.token": "टोकन",
  "staffOrdersNewReview.cashDiscount": "कैश डिस्काउंट",
  "staffOrdersNewReview.customDiscountOptional": "अलग डिस्काउंट % (ज़रूरी नहीं)",
  "staffOrdersNewReview.subtotal": "उप-योग",
  "staffOrdersNewReview.cashDiscount2": "कैश डिस्काउंट ({discountPct}%)",
  "staffOrdersNewReview.taxableAmount": "टैक्स योग्य रकम",
  "staffOrdersNewReview.grandTotal": "कुल योग",
  "staffOrdersNewReview.placing": "भेजा जा रहा है…",
  "staffOrdersNewReview.placeOrder": "ऑर्डर भेजें",
  "staffOrdersNewReview.placeOrder2": "ऑर्डर भेजें?",
  "staffOrdersNewReview.theOrderWillGoTo": "फैक्ट्री को दिखने से पहले ऑर्डर मैनेजमेंट की मंज़ूरी के लिए जाएगा।",

  // ── staffPaymentsDetail ──
  "staffPaymentsDetail.paymentNotFound": "पेमेंट नहीं मिला।",
  "staffPaymentsDetail.onAccountPayment": "खाते में जमा पेमेंट",
  "staffPaymentsDetail.addProof": "सबूत जोड़ें",
  "staffPaymentsDetail.snapTheBankUpiScreen": "बैंक / UPI स्क्रीन या चेक की फोटो अभी ले लें — हिसाब मिलाना आसान हो जाता है।",
  "staffPaymentsDetail.proofType": "सबूत का प्रकार",
  "staffPaymentsDetail.referenceNoteOptional": "रेफरेंस नोट (ज़रूरी नहीं)",
  "staffPaymentsDetail.utrChequeNoAnyReference": "UTR / चेक नंबर / कोई भी रेफरेंस",
  "staffPaymentsDetail.uploadProof": "सबूत अपलोड करें",
  "staffPaymentsDetail.proofs": "सबूत ({count})",
  "staffPaymentsDetail.noProofsUploadedYet": "अभी कोई सबूत अपलोड नहीं हुआ।",
  "staffPaymentsDetail.unableToOpenTheFile": "फाइल नहीं खुल सकी — थोड़ी देर बाद फिर कोशिश करें।",
  "staffPaymentsDetail.openFullSize": "पूरा खोलें →",

  // ── common ──
  "common.loading": "लोड हो रहा है…",

  // ── staffPaymentsHome ──
  "staffPaymentsHome.recordedCollectionsAndProofsTap": "दर्ज किए गए पेमेंट और सबूत। नया जोड़ने के लिए + दबाएँ।",
  "staffPaymentsHome.noPaymentsYet": "अभी कोई पेमेंट नहीं",
  "staffPaymentsHome.tapTheButtonToRecord": "आज मिला पेमेंट दर्ज करने के लिए + दबाएँ।",
  "staffPaymentsHome.noProof": "सबूत नहीं",

  // ── staffPaymentsNew ──
  "staffPaymentsNew.searchYourLedger": "अपने खाते में खोजें…",

  // ── staffSettings ──
  "staffSettings.orderStatusUpdates": "ऑर्डर की स्थिति की सूचना",
  "staffSettings.whenAnOrderYouPlaced": "जब आपका ऑर्डर आगे बढ़े — बन रहा है, भेजने को तैयार, LR बनी, भेज दिया।",
  "staffSettings.invoiceLrUploaded": "बिल / LR अपलोड हुई",
  "staffSettings.whenTheFactoryUploadsAn": "जब फैक्ट्री आपके ऑर्डर का बिल या LR अपलोड करे।",
  "staffSettings.comments": "टिप्पणियाँ",
  "staffSettings.whenAnyonePostsAComment": "जब कोई आपके ऑर्डर पर टिप्पणी लिखे।",
  "staffSettings.adminAlerts": "मैनेजमेंट अलर्ट",
  "staffSettings.staleOrders": "अटके ऑर्डर",
  "staffSettings.anyOrderStillInOrder": "जो ऑर्डर तय घंटों से ज़्यादा समय से ‘प्लेस्ड’ में पड़ा है।",
  "staffSettings.creditCheckFailures": "उधार जाँच में अटके",
  "staffSettings.anOrderWasPlacedBut": "ऑर्डर डाला गया पर उधार जाँच पास नहीं हुई।",

  // ── staffStock ──
  "staffStock.stockInFactory": "फैक्ट्री का स्टॉक",
  "staffStock.lastTallySync": "Tally से आख़िरी सिंक: {latestSync}",
  "staffStock.stockLevelsComeFromTally": "स्टॉक Tally से आता है — मैनेजमेंट के Tally चालू करने पर यहाँ दिखेगा।",
  "staffStock.search": "खोजें",
  "staffStock.productOrCategory": "प्रोडक्ट या श्रेणी…",
  "staffStock.noStockItemsMatchYour": "आपकी खोज से कोई स्टॉक नहीं मिला।",
  "staffStock.stockLevelsComeFromTally2": "स्टॉक Tally से आता है। अभी यहाँ कुछ नहीं है — मैनेजमेंट से Tally जोड़ने को कहें।",

  // ── accountDisabled ──
  "accountDisabled.yourAccessHasBeenRemoved": "आपकी पहुँच हटा दी गई है",
  "accountDisabled.anAdministratorHasDisabledYour": "मैनेजमेंट ने आपका Syncit अकाउंट बंद किया है। आपका डेटा सुरक्षित है — कुछ भी हटाया नहीं गया। फिर चालू करवाने के लिए अपने मैनेजर से बात करें।",
  "accountDisabled.backToSignIn": "साइन इन पर वापस जाएँ",

  // ── unlock ──
  "unlock.biometricUnavailableSignOutAnd": "फिंगरप्रिंट उपलब्ध नहीं है। साइन आउट करके PIN के साथ दोबारा सेट करें।",
  "unlock.unlockCancelled": "अनलॉक रद्द किया गया।",
  "unlock.enterYour6DigitPin": "अपना 6 अंकों का PIN डालें।",
  "unlock.tooManyWrongAttemptsSigned": "बहुत बार गलत PIN डाला गया। आप साइन आउट हो गए हैं। अपने मैनेजर से नया कोड माँगें।",
  "unlock.wrongPinWrongAttemptsSign": "गलत PIN। {MAX_PIN_ATTEMPTS} बार गलत होने पर आप साइन आउट हो जाएँगे।",
  "unlock.unlock": "अनलॉक करें",
  "unlock.useYourFingerprintOrFace": "अपना फिंगरप्रिंट या चेहरा इस्तेमाल करें।",
  "unlock.thisDeviceIsntSetUp": "यह फोन सेट नहीं है। साइन आउट करके दोबारा सेट करें।",
  "unlock.unlockWithBiometric": "फिंगरप्रिंट से अनलॉक करें",
  "unlock.signOut": "साइन आउट",

  // ── updateRequired ──
  "updateRequired.updateRequired": "अपडेट ज़रूरी है",
  "updateRequired.unknown": "पता नहीं",
  "updateRequired.checkForUpdates": "अपडेट देखें",

  // ── activityFeed ──
  "activityFeed.activity": "गतिविधि",
  "activityFeed.statusChangesAndCommentsIn": "स्थिति में बदलाव और टिप्पणियाँ एक जगह। इन्हें बदला नहीं जा सकता।",
  "activityFeed.addACommentCustomerWants": "टिप्पणी लिखें — जैसे ‘ग्राहक को 25 नहीं, 20 किलो चाहिए’",
  "activityFeed.post": "भेजें",
  "activityFeed.noActivityYet": "अभी कोई गतिविधि नहीं।",
  "activityFeed.comment": "टिप्पणी",

  // ── backBar ──
  "backBar.back": "वापस",

  // ── documentViewer ──
  "documentViewer.shareThisDocument": "यह दस्तावेज़ शेयर करें",
  "documentViewer.longPressToCopyThe": "नीचे दिया लिंक कॉपी करने के लिए दबाकर रखें (15 मिनट तक चलेगा):\n\n",
  "documentViewer.closeViewer": "बंद करें",
  "documentViewer.close": "✕ बंद करें",
  "documentViewer.shareViaWhatsappOrOther": "WhatsApp या किसी और से शेयर करें",
  "documentViewer.share": "शेयर करें",

  // ── errorBoundary ──
  "errorBoundary.somethingWentWrong": "कुछ गड़बड़ हो गई",
  "errorBoundary.syncitHitAnUnexpectedError": "इस स्क्रीन पर Syncit में कोई गड़बड़ हुई। आपका डेटा सुरक्षित है — कुछ भेजा या खोया नहीं गया। ‘रिपोर्ट करें’ दबाएँ ताकि हम इसे ठीक कर सकें, फिर होम पर लौटें।",
  "errorBoundary.reportThisProblemToThe": "यह समस्या टीम को बताएँ",
  "errorBoundary.reportAProblem": "समस्या रिपोर्ट करें",
  "errorBoundary.backToHome": "होम पर वापस",

  // ── itemSheet ──
  "itemSheet.customNotInCatalogue": "अलग / सूची में नहीं",
  "itemSheet.editItem": "आइटम बदलें",
  "itemSheet.addItem": "आइटम जोड़ें",
  "itemSheet.close": "बंद करें",
  "itemSheet.brand": "ब्रांड",
  "itemSheet.chooseBrand": "ब्रांड चुनें",
  "itemSheet.privateLabelBrandName": "प्राइवेट-लेबल ब्रांड का नाम",
  "itemSheet.enterTheBrandTheCustomer": "वह ब्रांड लिखें जिसके नाम से ग्राहक बेचता है",
  "itemSheet.productGrade": "प्रोडक्ट / ग्रेड",
  "itemSheet.loadingProducts": "प्रोडक्ट लोड हो रहे हैं…",
  "itemSheet.searchByNameOrGrade": "नाम या ग्रेड कोड से खोजें",
  "itemSheet.customProductName": "अलग प्रोडक्ट का नाम",
  "itemSheet.productNameGradeOrPrivate": "प्रोडक्ट का नाम, ग्रेड, या प्राइवेट-लेबल नाम",
  "itemSheet.quantity": "मात्रा",
  "itemSheet.packing": "पैकिंग",
  "itemSheet.customPackingOptional": "अलग पैकिंग (ज़रूरी नहीं)",
  "itemSheet.eG310MlCartridge": "जैसे: \"310 ml कार्ट्रिज\", \"500 ml बोतल\"",
  "itemSheet.size": "साइज़",
  "itemSheet.customSizeOptionalKgOr": "अलग साइज़ (ज़रूरी नहीं, kg या ml)",
  "itemSheet.packingOptional": "पैकिंग (ज़रूरी नहीं)",
  "itemSheet.sizeOptional": "साइज़ / वेरिएंट (ज़रूरी नहीं)",
  "itemSheet.searchProducts": "प्रोडक्ट के नाम या कोड से खोजें",
  "itemSheet.ratePerUnit": "प्रति यूनिट रेट",
  "itemSheet.lineTotal": "आइटम का कुल",
  "itemSheet.save": "सेव करें",
  "itemSheet.add": "जोड़ें",

  // ── numberPad ──
  "numberPad.backspace": "मिटाएँ",

  // ── orderCard ──
  "orderCard.call": "{salespersonName} को कॉल करें",
  "orderCard.repeatThisOrder": "यह ऑर्डर दोहराएँ",
  "orderCard.repeat": "↻ दोहराएँ",

  // ── photoPicker ──
  "photoPicker.cameraAccessNeeded": "कैमरे की अनुमति चाहिए",
  "photoPicker.enableCameraInSettingsSo": "फोन की सेटिंग्स में कैमरा चालू करें ताकि Syncit सबूत की फोटो ले सके।",
  "photoPicker.photoAccessNeeded": "फोटो की अनुमति चाहिए",
  "photoPicker.enablePhotoAccessInSettings": "फोन की सेटिंग्स में फोटो की अनुमति दें ताकि Syncit सबूत लगा सके।",
  "photoPicker.removeSelectedPhoto": "चुनी हुई फोटो हटाएँ",
  "photoPicker.remove": "✕ हटाएँ",
  "photoPicker.retakePhoto": "फोटो फिर से लें",
  "photoPicker.takePhoto": "फोटो लें",
  "photoPicker.fromGallery": "गैलरी से",

  // ── pickerField ──
  "pickerField.opensPicker": "{label}: {n}. सूची खुलेगी।",

  // ── common ──
  "common.closePicker": "सूची बंद करें",

  // ── pickerField ──
  "pickerField.recent": "हाल के",
  "pickerField.all": "सभी",
  "pickerField.noMatches": "कुछ नहीं मिला।",

  // ── common ──
  "common.stillWaiting": "अभी भी बाकी",
  "common.nothingNewToSync": "सिंक करने को कुछ नया नहीं।",
  "common.youreOfflineTheQueueWill": "आप ऑफलाइन हैं। नेटवर्क आने पर सब भेज दिया जाएगा।",
  "common.someFailed": "कुछ नहीं जा सके",

  // ── queueSummary ──
  "queueSummary.syncedStillWaitingCheckIndividual": "{sent} सिंक हुए · {failed} अभी बाकी। कारण हर आइटम के नीचे देखें।",
  "queueSummary.failedToSendTapFor": "{stuckCount} नहीं जा सके। जानकारी के लिए दबाएँ।",
  "queueSummary.waitingToSyncTapFor": "{total} सिंक होने बाकी। जानकारी के लिए दबाएँ।",
  "queueSummary.failedTapToSeeWhy": "{stuckCount} नहीं जा सके — कारण देखने के लिए दबाएँ",
  "queueSummary.waitingToSync": "{total} सिंक होने बाकी",
  "queueSummary.waitingToSync2": "सिंक होने बाकी",
  "queueSummary.someItemsFailedToSend": "कुछ आइटम नहीं भेजे जा सके। कारण हर एक के नीचे लिखा है। जब तक वह ठीक नहीं होता, दोबारा कोशिश से फायदा नहीं होगा — अपने मैनेजर को बताएँ।",
  "queueSummary.retryingAutomaticallyTapRetryNow": "अपने आप फिर कोशिश हो रही है। तुरंत भेजने के लिए ‘अभी भेजें’ दबाएँ।",
  "queueSummary.youreOfflineItemsWillSend": "आप ऑफलाइन हैं। नेटवर्क आने पर सब अपने आप भेज दिया जाएगा।",
  "queueSummary.orders": "ऑर्डर · {count}",
  "queueSummary.statusChanges": "स्थिति में बदलाव · {count}",
  "queueSummary.documents": "दस्तावेज़ · {count}",
  "queueSummary.page": " — पन्ना {pageIndex}",

  // ── common ──
  "common.retrySyncingNow": "अभी फिर से सिंक करें",
  "common.syncing": "सिंक हो रहा है…",
  "common.retryNow": "अभी भेजें",

  // ── selectField ──
  "selectField.opensPicker": "{label}: {n}. सूची खुलेगी।",

  // ── syncPill ──
  "syncPill.sync": "सिंक",
  "syncPill.everythingIsUpToDate": "सब कुछ अपडेट है।",
  "syncPill.orders": "ऑर्डर · {count}",
  "syncPill.statusChanges": "स्थिति में बदलाव · {count}",
  "syncPill.documents": "दस्तावेज़ · {count}",
  "syncPill.page": " — पन्ना {pageIndex}",
  "syncPill.syncedStillWaitingSeeIndividual": "{sent} सिंक हुए · {failedNow} अभी बाकी। कारण हर आइटम के नीचे देखें।",

  // ── updateBanner ──
  "updateBanner.updateAvailable": "अपडेट उपलब्ध है",
  "updateBanner.restartToInstallTheLatest": "नया वर्ज़न लगाने के लिए ऐप फिर से शुरू करें।",
  "updateBanner.restartTheAppToInstall": "अपडेट लगाने के लिए ऐप फिर से शुरू करें",
  "updateBanner.restart": "फिर से शुरू करें",

  // ── common ──
  "common.expoPublicAppUrlIs": "EXPO_PUBLIC_APP_URL is not set.",

  // ── accountDeletion ──
  "accountDeletion.youreSignedOutSignIn": "आप साइन आउट हैं। दोबारा साइन इन करके फिर कोशिश करें।",
  "accountDeletion.requestFailed": "अनुरोध पूरा नहीं हुआ ({status})।",
  "accountDeletion.noConnectionTryAgainWhen": "नेटवर्क नहीं है। ऑनलाइन होने पर फिर कोशिश करें।",

  // ── errors ──
  "errors.savedOnYourPhoneWill": "फोन में सेव है — नेटवर्क आने पर भेज दिया जाएगा।",
  "errors.noSignalTryAgainIn": "नेटवर्क नहीं है। थोड़ी देर में फिर कोशिश करें।",
  "errors.youveBeenSignedOutSign": "आप साइन आउट हो गए हैं। आगे बढ़ने के लिए फिर साइन इन करें।",
  "errors.youDontHavePermissionFor": "आपको इसकी अनुमति नहीं है। अपने मैनेजर से पूछें।",
  "errors.tooManyAttemptsWaitA": "बहुत बार कोशिश हुई। एक मिनट रुककर फिर कोशिश करें।",
  "errors.somethingWentWrongTryAgain": "कुछ गड़बड़ हुई। फिर कोशिश करें।",

  // ── orderCommentQueries ──
  "orderCommentQueries.saySomethingBeforeSending": "भेजने से पहले कुछ लिखें।",
  "orderCommentQueries.tooLong4000CharMax": "बहुत लंबा है (ज़्यादा से ज़्यादा 4000 अक्षर)।",

  // ── common ──
  "common.notSignedIn": "साइन इन नहीं है।",

  // ── requestCode ──
  "requestCode.tooManyCodeRequestsTry": "बहुत बार कोड माँगा गया। थोड़ी देर बाद कोशिश करें।",
  "requestCode.requestFailed": "अनुरोध पूरा नहीं हुआ ({status})।",

  // ── uploads ──
  "uploads.fileNoLongerExistsOn": "फाइल अब फोन में नहीं है।",
  "uploads.fileMustBe10Mb": "फाइल 10 MB या उससे छोटी होनी चाहिए।",
  "uploads.uploadEndpointNotConfigured": "अपलोड की सेटिंग नहीं हुई है।",
  "uploads.uploadFailed": "अपलोड नहीं हो सका।",
  "uploads.uploadFailed2": "अपलोड नहीं हो सका: {message}",

  // ── useOptimisticStatus ──
  "useOptimisticStatus.couldntUpdateStatus": "स्थिति अपडेट नहीं हो सकी",

  // ── whatsapp ──
  "whatsapp.whatsappNotAvailable": "WhatsApp उपलब्ध नहीं है",
  "whatsapp.installWhatsappOrCopyThe": "WhatsApp इंस्टॉल करें या मैसेज खुद कॉपी करें।",

  // ── paymentTerm ──
  "paymentTerm.ADVANCE": "एडवांस",
  "paymentTerm.CREDIT": "उधार",
  "paymentTerm.PDC": "PDC",
  "paymentTerm.IMMEDIATE": "तुरंत",
  "paymentTerm.AGAINST_DISPATCH": "डिस्पैच पर",
  "paymentTerm.OTHER": "अन्य",

  // ── transport ──
  "transport.PAID": "पेड",
  "transport.TO_PAY": "टू-पे",
  "transport.GODOWN": "गोदाम",
  "transport.DOOR": "डोर",
  "transport.OTHER": "अन्य",

  // ── paymentMethod ──
  "paymentMethod.CASH": "नकद",
  "paymentMethod.CHEQUE": "चेक",
  "paymentMethod.NEFT": "NEFT",
  "paymentMethod.RTGS": "RTGS",
  "paymentMethod.UPI": "UPI",
  "paymentMethod.OTHER": "अन्य",

  // ── paymentDoc ──
  "paymentDoc.BANK_SCREENSHOT": "बैंक स्क्रीनशॉट",
  "paymentDoc.CHEQUE_PHOTO": "चेक की फोटो",
  "paymentDoc.UPI_SCREENSHOT": "UPI स्क्रीनशॉट",
  "paymentDoc.RECEIPT": "साइन की हुई रसीद",
  "paymentDoc.OTHER": "अन्य",

  // ── orderDoc ──
  "orderDoc.INVOICE": "बिल",
  "orderDoc.LORRY_RECEIPT": "लॉरी रसीद (LR)",
  "orderDoc.ORDER_PROOF": "ऑर्डर का सबूत",
  "orderDoc.OTHER": "अन्य",

  // ── holdReason ──
  "holdReason.RAW_MATERIAL_SHORTAGE": "कच्चे माल की कमी",
  "holdReason.AWAITING_CUSTOMER_CONFIRMATION": "ग्राहक की पुष्टि का इंतज़ार",
  "holdReason.PAYMENT_HOLD": "पेमेंट के कारण रुका",
  "holdReason.OTHER": "अन्य",

  // ── lineStatus ──
  "lineStatus.PENDING": "बाकी",
  "lineStatus.IN_PRODUCTION": "बन रहा है",
  "lineStatus.READY": "तैयार",

  // ── role ──
  "role.ADMIN": "मैनेजमेंट",
  "role.STAFF": "सेल्स",
  "role.FACTORY": "फैक्ट्री",

  // ── common ──
  "common.unknownCustomer": "अनजान ग्राहक",

  // ── payments ──
  "payments.invoiceNumber": "बिल {number}",
  "payments.recordedBy": "{name} ने दर्ज किया",

  // ── common ──
  "common.placedOn": "{date} को डाला",

  // ── adminApprovals ──
  "adminApprovals.empty": "कुछ बाकी नहीं। सब निपट गया।",

  // ── adminFactory ──
  "adminFactory.avg": "औसत {time}",

  // ── time ──
  "time.hoursShort": "{n} घं",
  "time.daysShort": "{n} दिन",

  // ── adminFactory ──
  "adminFactory.lastChange": "{status} · आख़िरी बदलाव {date}",

  // ── adminTeam ──
  "adminTeam.subtitle": "पिछले {days} दिन · ऑर्डर देखने के लिए नाम दबाएँ · किसी को चालू या बंद करने के लिए बटन दबाकर रखें।",

  // ── authCode ──
  "authCode.genericError": "यह कोड नहीं चला। ईमेल वाली स्क्रीन से नया कोड माँगें।",
  "authCode.networkError": "कोड जांचने के लिए Syncit से कनेक्ट नहीं हो पाया। इंटरनेट देखें और फिर से Verify दबाएं — आपका कोड अभी भी मान्य है।",

  // ── factoryHome ──
  "factoryHome.lastOrderArrived": "आख़िरी ऑर्डर {when} आया",
  "factoryHome.chaseAdmin": "पूछें: मैनेजमेंट से।",
  "factoryHome.chasePerson": "पूछें: {name} से।",
  "factoryHome.chaseSalesperson": "पूछें: सेल्समैन से।",

  // ── factoryStep ──
  "factoryStep.IN_PRODUCTION": "बनाना शुरू करें",
  "factoryStep.READY_TO_DISPATCH": "पैक और तैयार",
  "factoryStep.DISPATCHED": "भेज दिया",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.moveTo": "{orderNumber} को {status} में ले जाएँ?",
  "factoryOrdersDetail.pendingChanges.one": "इस ऑर्डर का {count} बदलाव सिंक होना बाकी है। फोन ऑनलाइन होते ही अपने आप लागू हो जाएगा।",
  "factoryOrdersDetail.pendingChanges.other": "इस ऑर्डर के {count} बदलाव सिंक होने बाकी हैं। फोन ऑनलाइन होते ही अपने आप लागू हो जाएँगे।",

  // ── common ──
  "common.placedBy": "{name} ने डाला",
  "common.salesperson": "सेल्समैन",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.lineStart": "शुरू करें",
  "factoryOrdersDetail.lineMarkReady": "तैयार",
  "factoryOrdersDetail.lineDone": "हो गया",

  // ── common ──
  "common.pageN": "पन्ना {n}",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.uploadPages.one": "{count} पन्ना अपलोड करें",
  "factoryOrdersDetail.uploadPages.other": "{count} पन्ने अपलोड करें",
  "factoryOrdersDetail.waitingToUpload": "{count} अपलोड होने बाकी",

  // ── common ──
  "common.queuedOn": "{date} को सेव हुआ",
  "common.attempts.one": "{count} कोशिश",
  "common.attempts.other": "{count} कोशिशें",

  // ── home ──
  "home.viewing": "दिख रहा है: {scope}",

  // ── common ──
  "common.items.one": "{count} आइटम",
  "common.items.other": "{count} आइटम",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.cancelReasonPrompt": "छोटा सा कारण लिखें — यह ऑर्डर के इतिहास में दिखेगा।",
  "staffOrdersDetail.openDoc": "{name} खोलें",
  "staffOrdersDetail.openDocPages": "{name} खोलें, {count} पन्ने",

  // ── staffOrdersEdit ──
  "staffOrdersEdit.lockedItems": "यह ऑर्डर {status} है। आइटम सिर्फ डिस्पैच से पहले बदले जा सकते हैं।",
  "staffOrdersEdit.locked": "यह ऑर्डर {status} है। इसे सिर्फ डिस्पैच से पहले बदला जा सकता है।",

  // ── staffOrdersNew ──
  "staffOrdersNew.ledgerCustomer": "खाते का ग्राहक",
  "staffOrdersNew.moreMatches": "+{count} और — कम करने के लिए और लिखें।",

  // ── staffOrdersNewReview ──
  "staffOrdersNewReview.overLimitBody": "बकाया {outstanding} + यह ऑर्डर {order} = {projected}, जो {limit} की सीमा से ज़्यादा है। मैनेजमेंट की मंज़ूरी लग सकती है।",
  "staffOrdersNewReview.belowFloorLine": "लाइन {line} · {product}: {rate}, फ्लोर रेट {floor} से कम है। फैक्ट्री को दिखने से पहले मैनेजमेंट की मंज़ूरी ज़रूरी है।",
  "staffOrdersNewReview.itemsHeader.one": "आइटम · {count} लाइन",
  "staffOrdersNewReview.itemsHeader.other": "आइटम · {count} लाइन",

  // ── payments ──
  "payments.proofs.one": "{count} सबूत",
  "payments.proofs.other": "{count} सबूत",

  // ── updateRequired ──
  "updateRequired.body": "आपकी कंपनी ने एक ज़रूरी सुरक्षा अपडेट जारी किया है। आपके पास Syncit {current} है; कम से कम {minimum} चाहिए।\n\nPlay Store से या अपने मैनेजर के दिए लिंक से नया वर्ज़न लगाएँ, फिर Syncit दोबारा खोलें।",

  // ── sync ──
  "sync.itemsSynced.one": "{count} आइटम सिंक हुआ।",
  "sync.itemsSynced.other": "{count} आइटम सिंक हुए।",
  "sync.pill.syncing": "सिंक हो रहा है…",
  "sync.pill.failed": "{count} नहीं गए",
  "sync.pill.queued": "{count} बाकी",
  "sync.pill.offlineQueued": "ऑफलाइन · {count} बाकी",
  "sync.pill.synced": "सिंक हो गया",
  "sync.pill.offline": "ऑफलाइन",
  "sync.a11y.syncing": "सिंक हो रहा है। जानकारी के लिए दबाएँ।",
  "sync.a11y.failed.one": "{count} आइटम सिंक नहीं हुआ। कारण देखने के लिए दबाएँ।",
  "sync.a11y.failed.other": "{count} आइटम सिंक नहीं हुए। कारण देखने के लिए दबाएँ।",
  "sync.a11y.queued.one": "{count} आइटम सिंक होना बाकी। जानकारी के लिए दबाएँ।",
  "sync.a11y.queued.other": "{count} आइटम सिंक होने बाकी। जानकारी के लिए दबाएँ।",
  "sync.a11y.synced": "सब सिंक हो गया। जानकारी के लिए दबाएँ।",
  "sync.a11y.offline": "आप ऑफलाइन हैं। जानकारी के लिए दबाएँ।",
  "sync.sheet.failed": "कुछ आइटम नहीं भेजे जा सके। कारण हर एक के नीचे लिखा है। जब तक वह ठीक नहीं होता, दोबारा कोशिश से फायदा नहीं होगा — अपने मैनेजर को बताएँ।",
  "sync.sheet.syncing": "अभी भेजा जा रहा है।",
  "sync.sheet.nothing": "कुछ बाकी नहीं।",
  "sync.sheet.offline": "आप ऑफलाइन हैं।",
  "sync.queuedMeta": "{date} को सेव हुआ",
  "sync.retries.one": "{count} बार फिर कोशिश",
  "sync.retries.other": "{count} बार फिर कोशिश",

  // ── stock ──
  "stock.out": "स्टॉक खत्म",
  "stock.low": "कम",
  "stock.in": "स्टॉक में",

  // ── itemSheet ──
  "itemSheet.typeNameBelow": "नीचे नाम लिखें",

  // ── common ──
  "common.choose": "चुनें…",
  "common.searchEllipsis": "खोजें…",

  // ── timeline ──
  "timeline.overdueBy.one": "{count} दिन लेट",
  "timeline.overdueBy.other": "{count} दिन लेट",

  // ── auth ──
  "auth.revoked": "आपके मैनेजर ने इस फोन को साइन आउट किया है।",

  // ── notifications ──
  "notifications.channel": "ऑर्डर की सूचना",

  // ── time ──
  "time.justNow": "अभी-अभी",
  "time.minutesAgo.one": "{count} मिनट पहले",
  "time.minutesAgo.other": "{count} मिनट पहले",
  "time.hoursAgo.one": "{count} घंटा पहले",
  "time.hoursAgo.other": "{count} घंटे पहले",
  "time.daysAgo.one": "{count} दिन पहले",
  "time.daysAgo.other": "{count} दिन पहले",

  // ── adminHome ──
  "adminHome.acrossAllCustomers": "सभी ग्राहकों का",
  "adminHome.dsoHint": "ग्राहक औसतन कितने दिन में पेमेंट करते हैं (लगभग)",
  "adminHome.pastExpected": "डिलीवरी की तारीख निकल चुकी",
  "adminHome.lastMonth": "पिछला महीना: {amount}",
  "adminHome.vsLastMonth": "{arrow} {percent}% पिछले महीने से ({amount})",

  // ── tabs ──
  "tabs.today": "आज",
  "tabs.customers": "ग्राहक",
  "tabs.orders": "ऑर्डर",
  "tabs.payments": "पेमेंट",
  "tabs.toMake": "बनाना है",
  "tabs.toDispatch": "भेजना है",
  "tabs.doneToday": "आज हो गया",
  "tabs.home": "होम",

  // ── today ──
  "today.count.one": "{count} ग्राहक से बात करनी है",
  "today.count.other": "{count} ग्राहकों से बात करनी है",
  "today.empty": "आज का सब काम हो गया।",
  "today.emptyBody": "अभी किसी से पेमेंट की बात नहीं करनी। दोबारा देखने के लिए नीचे खींचें।",
  "today.daysOverdue.one": "{count} दिन से बकाया",
  "today.daysOverdue.other": "{count} दिन से बकाया",
  "today.dueNow": "पेमेंट बाकी",
  "today.brokenPromise": "{date} का वादा था — पेमेंट नहीं आया",
  "today.promiseDueToday": "आज पेमेंट का वादा है",
  "today.call": "कॉल",
  "today.whatsapp": "WhatsApp",
  "today.promise": "वादा",
  "today.payment": "पेमेंट",
  "today.callA11y": "{name} को कॉल करें",
  "today.whatsappA11y": "{name} को WhatsApp पर याद दिलाएँ",
  "today.promiseA11y": "{name} का पेमेंट का वादा लिखें",
  "today.paymentA11y": "{name} का पेमेंट दर्ज करें",
  "today.noPhone": "इस ग्राहक का फोन नंबर सेव नहीं है।",
  "today.rowA11y": "{name}, {amount} बकाया, {overdue}",

  // ── promise ──
  "promise.title": "पेमेंट का वादा",
  "promise.subtitle": "{name} · {amount} बकाया",
  "promise.amount": "कितना देने का वादा (₹)",
  "promise.amountInvalid": "वादे की रकम डालें।",
  "promise.when": "कब देंगे?",
  "promise.tomorrow": "कल",
  "promise.inDays": "{count} दिन में",
  "promise.pickDate": "तारीख चुनें",
  "promise.summary": "{date} को {amount} देंगे।",
  "promise.save": "वादा सेव करें",
  "promise.saved": "वादा सेव हुआ: {date} को {amount}",

  // ── customers ──
  "customers.subtitle": "बकाया देखने के लिए ग्राहक पर दबाएँ।",
  "customers.empty": "अभी कोई ग्राहक नहीं।",
  "customers.emptyBody": "आपके मैनेजर जो ग्राहक आपको देंगे, वे यहाँ दिखेंगे।",
  "customers.noMatch": "इस नाम का कोई ग्राहक नहीं मिला।",
  "customers.nothingDue": "कुछ बकाया नहीं",
  "customers.add": "ग्राहक जोड़ें",
  "customers.rowA11yOwes": "{name}, {amount} बकाया",
  "customers.rowA11yClear": "{name}, कुछ बकाया नहीं",

  // ── payments ──
  "payments.record": "पेमेंट दर्ज करें",
  "payments.amount": "मिली रकम (₹)",
  "payments.amountPlaceholder": "जैसे 12500",
  "payments.method": "पेमेंट कैसे मिला?",
  "payments.reference": "रेफरेंस (UTR / चेक नंबर)",
  "payments.save": "पेमेंट सेव करें",
  "payments.saved": "सेव हुआ: {name} से {amount}",
  "payments.proofHint": "अगला कदम: बैंक या UPI स्क्रीनशॉट की फोटो लगाएँ ताकि अकाउंट्स को पूछना न पड़े।",
  "payments.proofSaved": "सबूत जुड़ गया",
  "payments.changeCustomer": "ग्राहक बदलें",
  "payments.rowA11y": "{name}, {amount}, {date}",

  // ── common ──
  "common.close": "बंद करें",
  "common.notNow": "अभी नहीं",
  "common.optional": "ज़रूरी नहीं",

  // ── list ──
  "list.errorTitle": "लोड नहीं हो सका",

  // ── auth ──
  "auth.email.label": "ऑफिस का ईमेल",
  "auth.email.subtitle": "हम आपको ईमेल पर 6 अंकों का कोड भेजेंगे।",
  "auth.email.invalid": "सही ईमेल पता डालें।",
  "auth.email.newHere": "Syncit पर नए हैं? अपने मैनेजर से कहें कि आपको जोड़ें, या अपनी कंपनी यहाँ बनाएँ:",
  "auth.email.newHereInviteOnly": "Syncit पर नए हैं? अपने मैनेजर से कहें कि आपको जोड़ें।",
  "auth.email.openWebsite": "ब्राउज़र में getsyncit.app खोलें",

  // ── lock ──
  "lock.offerTitle": "Syncit को अपने फिंगरप्रिंट से लॉक करें?",
  "lock.offerPinTitle": "Syncit को PIN से लॉक करें?",
  "lock.offerBody": "अगर फोन किसी और के हाथ लगे तो आपके ग्राहक और ऑर्डर सुरक्षित रहते हैं। इसे बाद में सेटिंग्स में बदल सकते हैं।",
  "lock.requiredBody": "आपकी कंपनी ने इस ऐप पर लॉक ज़रूरी किया है। अगर फोन किसी और के हाथ लगे तो ग्राहक और ऑर्डर सुरक्षित रहते हैं।",
  "lock.turnOn": "चालू करें",
  "lock.turnedOn": "ऐप लॉक चालू है",
  "lock.usePinInstead": "इसकी जगह PIN लगाएँ",
  "lock.useFingerprintInstead": "इसकी जगह फिंगरप्रिंट लगाएँ",
  "lock.choosePin": "6 अंकों का PIN चुनें",
  "lock.confirmPin": "PIN दोबारा डालें",
  "lock.pinSixDigits": "PIN ठीक 6 अंकों का होना चाहिए।",
  "lock.pinMismatch": "दोनों PIN एक जैसे नहीं हैं।",
  "lock.pinSaveFailed": "PIN सेव नहीं हो सका। फिर कोशिश करें।",
  "lock.biometricCancelled": "फिंगरप्रिंट की पुष्टि नहीं हुई। फिर कोशिश करें, या PIN लगाएँ।",
  "lock.confirmPrompt": "ऐप लॉक चालू करने के लिए पुष्टि करें",
  "lock.unlockPrompt": "Syncit अनलॉक करें",
  "lock.usePin": "PIN लगाएँ",

  // ── push ──
  "push.reason": "आपका ऑर्डर भेजे जाने पर आपको बताया जाएगा।",
  "push.turnOn": "चालू करें",
  "push.enabled": "नोटिफिकेशन चालू हैं",
  "push.blocked": "नोटिफिकेशन बंद हैं। फोन की सेटिंग्स में Syncit के लिए चालू करें।",

  // ── settings ──
  "settings.open": "सेटिंग्स खोलें",
  "settings.language": "भाषा",
  "settings.notifications": "नोटिफिकेशन",
  "settings.role": "साइन इन: {role}",
  "settings.couldNotSave": "सेव नहीं हो सका। नेटवर्क देखें और फिर कोशिश करें।",
  "settings.lock.section": "ऐप लॉक",
  "settings.lock.label": "Syncit को लॉक करें",
  "settings.lock.hint": "ऐप खुलने पर फिंगरप्रिंट माँगा जाएगा।",
  "settings.lock.pinHint": "ऐप खुलने पर PIN माँगा जाएगा।",
  "settings.lock.requiredHint": "आपकी कंपनी ने इसे ज़रूरी किया है। इसे बंद नहीं किया जा सकता।",
  "settings.lock.offTitle": "ऐप लॉक बंद करें?",
  "settings.lock.offBody": "जो भी यह फोन उठाएगा, वह Syncit खोल सकेगा।",
  "settings.lock.offConfirm": "बंद करें",
  "settings.lock.turnedOff": "ऐप लॉक बंद है",

  // ── wizard ──
  "wizard.leave.body": "आप इसे सेव करके बाद में पूरा कर सकते हैं, या भरा हुआ सब हटा सकते हैं।",
  "wizard.leave.keep": "भरना जारी रखें",
  "wizard.leave.saveDraft": "बाद के लिए सेव करें",
  "wizard.leave.close": "यह ऑर्डर बंद करें",

  // ── orders ──
  "orders.productPlusMore": "{name} · +{count} और",
  "orders.lines.one": "{count} लाइन",
  "orders.lines.other": "{count} लाइन",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.statusUpdated": "अपडेट हुआ: {status}",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.cancelled": "{orderNumber} रद्द हुआ",

  // ── adminApprovals ──
  "adminApprovals.rejected": "{orderNumber} अस्वीकार हुआ",

  // ── activity ──
  "activity.commentPosted": "टिप्पणी भेज दी गई",

  // ── uploads ──
  "uploads.pagesUploaded.one": "{count} पन्ना अपलोड हुआ",
  "uploads.pagesUploaded.other": "{count} पन्ने अपलोड हुए",
  "uploads.someQueued": "{uploaded} अपलोड हुए · {queued} फोन में सेव हैं — नेटवर्क आने पर भेज दिए जाएँगे।",

  // ── timeline ──
  "timeline.minutesAfter": "पिछले चरण के {n} मिनट बाद",
  "timeline.hoursAfter": "पिछले चरण के {n} घंटे बाद",
  "timeline.daysAfter": "पिछले चरण के {n} दिन बाद",

  // ── whatsapp ──
  "whatsapp.hello": "नमस्ते {name} जी,",
  "whatsapp.helloNoName": "नमस्ते,",
  "whatsapp.pendingFor.one": "एक छोटा सा रिमाइंडर — आपके खाते में {amount} पिछले {count} दिन से बाकी है।",
  "whatsapp.pendingFor.other": "एक छोटा सा रिमाइंडर — आपके खाते में {amount} पिछले {count} दिनों से बाकी है।",
  "whatsapp.due": "एक छोटा सा रिमाइंडर — आपके खाते में {amount} बाकी है।",
  "whatsapp.payOnline": "आप यहाँ ऑनलाइन पेमेंट कर सकते हैं: {url}",
  "whatsapp.whenCanWeExpect": "कृपया बताएँ कि पेमेंट कब तक आ सकता है।",
  "whatsapp.thanks": "धन्यवाद!",

  // ── statement ──
  "statement.share": "स्टेटमेंट भेजें",
  "statement.shareA11y": "{name} को खाते का स्टेटमेंट भेजें",
  "statement.title": "खाते का स्टेटमेंट — {name}",
  "statement.failed": "स्टेटमेंट तैयार नहीं हो सका। फिर कोशिश करें।",
  "statement.linkMessage": "{name} का खाते का स्टेटमेंट। यहाँ खोलें (लिंक {days} दिन चलेगा): {url}",
  "settings.dailyPlan.label": "रोज़ का फॉलो-अप सारांश",
  "settings.dailyPlan.hint": "सुबह 9 बजे: आज कितने ग्राहकों से बात करनी है और कितनी रकम बाकी है। रविवार को नहीं भेजा जाता।",
  "admin.needsYou.title": "आपका ध्यान चाहिए",
  "admin.needsYou.brokenPromises.one": "{count} ग्राहक ने पेमेंट का वादा पूरा नहीं किया",
  "admin.needsYou.brokenPromises.other": "{count} ग्राहकों ने पेमेंट का वादा पूरा नहीं किया",
  "admin.needsYou.more": "+{count} और — सेल्स व्यू → आज में देखें",
  "admin.needsYou.rowA11y": "{name}, {amount} बकाया, {date} का वादा था, पेमेंट नहीं आया",
  "settings.help": "मदद और गाइड",
};
