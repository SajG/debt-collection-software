import type { Key } from "./en";

export const mr: Record<Key, string> = {

  "home.greeting": "नमस्कार, {name}",
  "home.subtitle": "तुमचे ऑर्डर, नवीन प्रथम.",
  "home.newOrder": "नवीन ऑर्डर",
  "home.signOut": "साइन आउट",
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
  "confirm.signOut.body": "पुन्हा साइन इन करण्यासाठी ऑफिसचा ईमेल लागेल.",
  "confirm.cancel": "रद्द करा",
  "confirm.ok": "हो, साइन आउट",
  "confirm.discard.title": "हा ऑर्डर टाकून द्यायचा?",
  "confirm.discard.ok": "हो, टाकून द्या",

  "offline.banner": "तुम्ही ऑफलाइन आहात. ऑर्डर सेव्ह करून सिग्नल आल्यावर पाठवू.",
  "offline.queued": "{count} ऑर्डर पाठवायचे आहेत.",
  "billing.locked.trial": "तुमचा ट्रायल संपला आहे — ऑर्डर जोडत राहण्यासाठी प्लॅन निवडा. तुमचा डेटा सुरक्षित आहे.",
  "billing.locked.payment": "मागील पेमेंट झाले नाही — ऑर्डर जोडत राहण्यासाठी प्लॅन निवडा. तुमचा डेटा सुरक्षित आहे.",
  "billing.locked.other": "हे वर्कस्पेस सध्या फक्त पाहण्यासाठी आहे — ऑर्डर जोडत राहण्यासाठी प्लॅन निवडा. तुमचा डेटा सुरक्षित आहे.",
  "billing.pastDue": "मागील पेमेंट झाले नाही. ऑर्डर जोडत राहण्यासाठी {date} पर्यंत पेमेंट करा. तुमचा डेटा सुरक्षित आहे.",
  "billing.ownerHint": "अकाउंट ओनर वेबवर Settings → Billing मध्ये प्लॅन निवडू शकतात.",
  "tallySync.lastSynced": "Tally शी शेवटचे सिंक: {time} ({ago})",
  "tallySync.never": "Tally कनेक्टर सेट आहे, पण अजून सिंक झाले नाही.",
  "tallySync.stale": "Tally बराच वेळ सिंक झाले नाही. Tally चा PC चालू आहे आणि Syncit कनेक्टर चालू आहे का?",
  "tallySync.failing": "Tally सिंक होत नाही. Tally च्या PC वरील Syncit कनेक्टर तपासा.",
  "tallySync.refreshHint": "पुन्हा तपासण्यासाठी टॅप करा",
  "splash.trust": "तुमचा डेटा एन्क्रिप्टेड आहे आणि फक्त तुमच्या कंपनीसाठी आहे",
  "account.title": "अकाउंट",
  "account.open": "अकाउंट आणि अकाउंट डिलीट",
  "account.delete.title": "माझे अकाउंट डिलीट करा",
  "account.delete.removedTitle": "काय डिलीट होईल",
  "account.delete.removed": "तुमचे लॉगिन, नाव, फोन नंबर आणि ईमेल, नोटिफिकेशन सेटिंग्ज, आणि या अकाउंटशी जोडलेले सर्व फोन. Syncit मधील प्रत्येक कंपनीतील तुमचा प्रवेश बंद होईल.",
  "account.delete.keptTitle": "कंपनीकडे काय राहील",
  "account.delete.kept": "तुम्ही नोंदवलेले ऑर्डर, पेमेंट आणि नोट्स कंपनीचे रेकॉर्ड आहेत. ते कंपनीकडेच राहतील आणि तुमचे नाव \"Former member\" दिसेल.",
  "account.delete.owner": "तुम्ही एखाद्या कंपनीचे ओनर असाल तर आधी दुसऱ्याला ओनर करा किंवा कंपनी डिलीट करा (वेब: Settings → Company).",
  "account.delete.typeToConfirm": "खात्रीसाठी DELETE टाइप करा",
  "account.delete.ownerBlocked": "तुम्ही अजून ओनर आहात: {companies}. दुसऱ्याला ओनर करा किंवा कंपनी डिलीट करा, मग पुन्हा प्रयत्न करा.",
  "account.delete.button": "माझे अकाउंट डिलीट करा",

  "wizard.step": "पायरी {n} / {total}",
  "wizard.back": "मागे",

  "factory.tab.queue": "बनवायचे",
  "factory.tab.inProd": "बनत आहे",
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

  // ── detail ──
  "detail.rejected": "ऑर्डर नाकारला",
  "detail.waitingApproval": "डायरेक्टरच्या मंजुरीची वाट",
  "detail.waitingApprovalHint": "मॅनेजमेंटने हा ऑर्डर मंजूर केल्याशिवाय फॅक्टरी काम सुरू करू शकत नाही.",
  "detail.product": "प्रॉडक्ट",
  "detail.quantity": "प्रमाण",
  "detail.rate": "रेट",
  "detail.payment": "पेमेंट",
  "detail.transport": "ट्रान्सपोर्ट",
  "detail.expected": "अपेक्षित डिलिव्हरी",
  "detail.notes": "नोट्स",
  "detail.timeline": "प्रगती",
  "detail.futureStep": "पुढे",
  "detail.byLine": "{name} यांनी",
  "detail.notFound": "ऑर्डर सापडला नाही.",

  // ── dues ──
  "dues.title": "ग्राहकाची बाकी",
  "dues.search": "ग्राहक शोधा",
  "dues.total": "एकूण बाकी",
  "dues.invoices": "न भरलेली बिले",
  "dues.dueOn": "देय {date}",
  "dues.empty": "न भरलेले बिल नाही.",
  "dues.updated": "Tally शी शेवटचा सिंक {time}",
  "dues.updatedNever": "अजून Tally शी सिंक झालेले नाही",

  // ── unsupported ──
  "unsupported.title": "हे अॅप सेल्स टीमसाठी आहे",
  "unsupported.body": "तुमचे अकाउंट {role} म्हणून तयार आहे. कृपया कम्प्युटरवर Syncit वेब वापरा.",
  "unsupported.signOut": "साइन आउट",

  // ── noProfile ──
  "noProfile.title": "अकाउंट तयार नाही",
  "noProfile.body": "तुमचे अकाउंट अजून पूर्ण सेट झालेले नाही. कृपया ऑफिसकडून ते पूर्ण करून घ्या, मग पुन्हा साइन इन करा.",
  "noProfile.signOut": "साइन आउट",

  // ── loading ──
  "loading": "लोड होत आहे…",

  // ── retry ──
  "retry": "पुन्हा प्रयत्न करा",

  // ── detail ──
  "detail.dispatchTo": "कुठे पाठवायचे",
  "detail.expectedDelivery": "अपेक्षित डिलिव्हरी",
  "detail.expectedProduction": "तयार होण्याची अपेक्षित तारीख",
  "detail.tokenGift": "टोकन / गिफ्ट",
  "detail.callSalesperson": "{name} यांना कॉल करा",
  "detail.lineItems": "आयटम · {count}",

  // ── queue ──
  "queue.online.hint": "आपोआप पुन्हा प्रयत्न होत आहे. लगेच पाठवण्यासाठी ‘आत्ता पाठवा’ दाबा.",
  "queue.offline.hint": "तुम्ही ऑफलाइन आहात. नेटवर्क आल्यावर सर्व आपोआप पाठवले जाईल.",

  // ── common ──
  "common.approvals": "मंजुरी",
  "common.team": "टीम",
  "common.factory": "फॅक्टरी",
  "common.approveFailed": "मंजूर करता आले नाही",

  // ── adminApprovals ──
  "adminApprovals.nowOnTheFactoryFloor": "{orderNumber} — {partyName}\nआता फॅक्टरीत आहे.",
  "adminApprovals.rateApprovedFactoryCanStart": "{orderNumber} — रेट मंजूर. फॅक्टरी काम सुरू करू शकते.",
  "adminApprovals.rateApprovals": "रेटची मंजुरी",
  "adminApprovals.rateExceptionsCanOnlyBe": "रेटची सवलत फक्त मंजूर करता येते किंवा तशीच ठेवता येते.",
  "adminApprovals.reject": "{orderNumber} नाकारायचा?",
  "adminApprovals.theSalespersonWillGetA": "सेल्समनला नोटिफिकेशन जाईल.",

  // ── common ──
  "common.reject": "नाकारा",
  "common.rejectFailed": "नाकारता आले नाही",

  // ── adminApprovals ──
  "adminApprovals.swipeRightToApproveSwipe": "मंजूर करण्यासाठी उजवीकडे सरकवा. कारणासह नाकारण्यासाठी डावीकडे सरकवा.",

  // ── common ──
  "common.approve": "मंजूर करा",

  // ── adminApprovals ──
  "adminApprovals.orderApproval": "ऑर्डरची मंजुरी",
  "adminApprovals.rateException": "रेटमध्ये सवलत",

  // ── adminFactory ──
  "adminFactory.readOnlyViewOfThe": "फॅक्टरीची स्थिती, फक्त पाहण्यासाठी. सरासरी मागील 60 दिवसांची आहे.",
  "adminFactory.stage": "टप्पा",
  "adminFactory.stuck24H": "24 तासांपेक्षा जास्त अडकलेले",
  "adminFactory.nothingStuckEveryInFlight": "काहीही अडकलेले नाही. प्रत्येक चालू ऑर्डर 24 तासांत पुढे गेला.",

  // ── adminHome ──
  "adminHome.switchToSalespersonView": "सेल्स व्ह्यूवर जा",
  "adminHome.totalOutstanding": "एकूण बाकी",
  "adminHome.overdueInvoices": "उशीर झालेली बिले",
  "adminHome.collectedThisMonth": "या महिन्यात आलेले पेमेंट",
  "adminHome.placedToday": "आजचे ऑर्डर",
  "adminHome.placedThisWeek": "या आठवड्याचे ऑर्डर",
  "adminHome.awaitingMyApproval": "माझ्या मंजुरीसाठी",
  "adminHome.rateApprovalsPending": "रेटची मंजुरी बाकी",
  "adminHome.overdueDeliveries": "उशीर झालेल्या डिलिव्हरी",

  // ── common ──
  "common.onHold": "थांबवलेले",

  // ── adminHome ──
  "adminHome.dispatchedThisMonth": "या महिन्यात पाठवले",
  "adminHome.liveUpdatesWheneverASales": "लाइव्ह · ऑर्डर बदलताच अपडेट होते.",

  // ── adminTeam ──
  "adminTeam.reactivate": "{ownerName} यांना पुन्हा चालू करायचे?",
  "adminTeam.deactivate": "{ownerName} यांना बंद करायचे?",
  "adminTeam.theyWillBeAbleTo": "ते पुन्हा साइन इन करून ऑर्डर टाकू शकतील.",
  "adminTeam.theyWillBeSignedOut": "ते साइन आउट होतील आणि साइन इन करू शकणार नाहीत. त्यांचा जुना डेटा राहील.",
  "adminTeam.reactivate2": "पुन्हा चालू करा",
  "adminTeam.deactivate2": "बंद करा",

  // ── common ──
  "common.couldNotUpdate": "अपडेट करता आले नाही",

  // ── adminTeam ──
  "adminTeam.noTeamMembers": "टीममध्ये कोणी नाही.",
  "adminTeam.deactivateUser": "यूजर बंद करा",
  "adminTeam.reactivateUser": "यूजर पुन्हा चालू करा",
  "adminTeam.orders": "ऑर्डर",
  "adminTeam.value": "रक्कम",
  "adminTeam.avgOD": "सरासरी ऑर्डर→डिस्पॅच",
  "adminTeam.overdue": "उशीर",

  // ── authCode ──
  "authCode.enterThe6DigitCode": "6 अंकी कोड टाका.",
  "authCode.dev": "{error}\n[dev] {message}",
  "authCode.enterYourCode": "तुमचा कोड टाका",
  "authCode.devPhoneEnterDevOtp": "Dev phone {identifier}. Enter dev OTP.",
  "authCode.ifIsRegisteredA6": "{identifier} नोंदणीकृत असेल तर 6 अंकी कोड पाठवला जात आहे. तो खाली टाका.",
  "authCode.6DigitCode": "6 अंकी कोड",
  "authCode.verify": "तपासा",
  "authCode.resendInS": "{cooldownLeft} सेकंदांत पुन्हा पाठवा",
  "authCode.resendCode": "कोड पुन्हा पाठवा",
  "authCode.changePhone": "फोन बदला",
  "authCode.changeEmail": "ईमेल बदला",

  // ── authEmail ──
  "authEmail.dismiss": "बंद करा",
  "authEmail.signInToSyncit": "Syncit मध्ये साइन इन करा",
  "authEmail.sendCode": "कोड पाठवा",
  "authCode.password": "पासवर्ड",
  "authCode.enterYourPassword": "तुमचा पासवर्ड टाका.",
  "authCode.enterYourPasswordTitle": "तुमचा पासवर्ड टाका",
  "authCode.wrongPassword": "ईमेल किंवा पासवर्ड चुकीचा आहे.",
  "authCode.useCodeInstead": "त्याऐवजी मला कोड ईमेल करा",
  "authEmail.usePassword": "पासवर्डने साइन इन करा",
  "authEmail.signIn": "साइन इन करा",
  "join.title": "{company} मध्ये सामील व्हा",
  "join.subtitle": "{inviter} यांनी तुम्हाला {role} म्हणून आमंत्रित केले आहे.",
  "join.yourManager": "तुमचे मॅनेजर",
  "join.role.admin": "व्यवस्थापन",
  "join.role.staff": "सेल्स",
  "join.role.factory": "फॅक्टरी",
  "join.field.name": "तुमचे नाव",
  "join.field.phone": "मोबाइल (ऐच्छिक)",
  "join.field.password": "पासवर्ड निवडा (10+ अक्षरे)",
  "join.submit": "टीममध्ये सामील व्हा",
  "join.err.name": "तुमचे नाव टाका.",
  "join.err.phone": "10 अंकी भारतीय मोबाइल नंबर टाका.",
  "join.err.password": "पासवर्ड किमान 10 अक्षरांचा ठेवा.",
  "join.err.network": "कनेक्शन नाही. इंटरनेट तपासून पुन्हा प्रयत्न करा.",
  "join.err.generic": "सामील होता आले नाही. कृपया पुन्हा प्रयत्न करा.",
  "join.invalid.title": "आमंत्रण उपलब्ध नाही",
  "join.invalid.body": "हे आमंत्रण संपले आहे किंवा रद्द केले आहे. तुमच्या मॅनेजरला नवीन पाठवायला सांगा.",
  "join.network.title": "आमंत्रण लोड होऊ शकले नाही",
  "join.network.body": "इंटरनेट कनेक्शन तपासा आणि लिंक पुन्हा उघडा.",
  "join.goToSignIn": "साइन इनवर जा",
  "join.exists.body": "{email} चे Syncit खाते आधीपासून आहे. वेबवर आमंत्रण स्वीकारा, मग येथे साइन इन करा.",
  "join.exists.openWeb": "वेबवर स्वीकारा",

  // ── factoryHome ──
  "factoryHome.order": "ऑर्डर",
  "factoryHome.orders": "ऑर्डर",

  // ── common ──
  "common.awaitingAdminApproval": "मॅनेजमेंटच्या मंजुरीची वाट",

  // ── factoryHome ──
  "factoryHome.anAdminMustApproveBefore": "फॅक्टरीला दिसण्याआधी मॅनेजमेंटची मंजुरी आवश्यक आहे.",
  "factoryHome.noReasonRecorded": "कारण नोंदवलेले नाही.",
  "factoryHome.belowFloorRate": "फ्लोअर रेटपेक्षा कमी",
  "factoryHome.oneOrMoreLinesAre": "एक किंवा अधिक आयटम फ्लोअर रेटपेक्षा कमी आहेत, मॅनेजमेंटची मंजुरी हवी.",
  "factoryHome.blocked": "अडकलेले",
  "factoryHome.unknownReason": "कारण माहीत नाही.",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.updateFailed": "अपडेट करता आले नाही",

  // ── common ──
  "common.savedOnYourPhone": "फोनमध्ये सेव्ह झाले",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.willApplyAutomaticallyWhenYoure": "नेटवर्क आल्यावर आपोआप लागू होईल.",

  // ── common ──
  "common.couldNotOpenDialer": "डायलर उघडता आला नाही",
  "common.orderNotFound": "ऑर्डर सापडला नाही.",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.thisOrderIsntOnThe": "हा ऑर्डर अजून फॅक्टरीत पोहोचलेला नाही. काम सुरू होण्याआधी मॅनेजमेंटची मंजुरी हवी.",

  // ── common ──
  "common.notes": "नोट्स",
  "common.confirm": "खात्री करा",
  "common.cancelOrder": "ऑर्डर रद्द करा",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.cancelOrder": "ऑर्डर रद्द करायचा?",
  "factoryOrdersDetail.markAsCancelledThisCant": "{orderNumber} रद्द केला जाईल. मोबाइलवरून तो परत आणता येणार नाही.",

  // ── common ──
  "common.unknownUser": "अज्ञात यूजर",
  "common.call": "☎ कॉल",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.ratePending": "  ·  रेट बाकी",
  "factoryOrdersDetail.line": "लाइन {lineNumber}: {label}",
  "factoryOrdersDetail.ready": "✓ तयार",

  // ── common ──
  "common.couldNotSave": "सेव्ह करता आले नाही",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.notSet": "ठरलेले नाही",

  // ── common ──
  "common.saving": "सेव्ह होत आहे…",
  "common.change": "बदला",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.set": "ठरवा",

  // ── common ──
  "common.documents": "कागदपत्रे",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.chooseADocumentTypeFirst": "आधी कागदपत्राचा प्रकार निवडा, मग प्रत्येक पानाचा फोटो घ्या. अनेक पानांचे कागदपत्र (उदा. 3 पानांची LR) एकच कागदपत्र म्हणून अपलोड होते.",
  "factoryOrdersDetail.whatAreYouUploading": "तुम्ही काय अपलोड करत आहात?",
  "factoryOrdersDetail.changeType": "प्रकार बदला",
  "factoryOrdersDetail.addPage": "पान {n} जोडा",
  "factoryOrdersDetail.addPageTakePhotoAbove": "पान {n} जोडा (वर फोटो घ्या)",

  // ── common ──
  "common.uploading": "अपलोड होत आहे…",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.page": " — पान {pageIndex}",

  // ── common ──
  "common.noDocumentsYet": "अजून कागदपत्रे नाहीत.",
  "common.couldNotOpen": "उघडता आले नाही",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.tryAgainLater": "थोड्या वेळाने पुन्हा प्रयत्न करा.",
  "factoryOrdersDetail.pages": " — {pageCount} पाने",
  "factoryOrdersDetail.page2": "पान {n} →",
  "factoryOrdersDetail.open": "उघडा →",

  // ── staffCustomersNew ──
  "staffCustomersNew.addCustomer": "ग्राहक जोडा",
  "staffCustomersNew.onlyAdminUsersCanCreate": "अॅपमधून ग्राहक फक्त मॅनेजमेंट जोडू शकते. सेल्समनने ऑर्डरमध्ये ग्राहकाचे नाव लिहावे — मॅनेजमेंट नंतर ते कायम करेल.",

  // ── common ──
  "common.nameRequired": "नाव आवश्यक आहे",
  "common.enterTheCustomerName": "ग्राहकाचे नाव टाका.",
  "common.saved": "सेव्ह झाले",

  // ── staffCustomersNew ──
  "staffCustomersNew.added": "{trimmed} जोडले.",
  "staffCustomersNew.onlyNameIsRequiredEverything": "फक्त नाव आवश्यक आहे — बाकी सर्व नंतर वेबवरून भरता येईल.",
  "staffCustomersNew.customerName": "ग्राहकाचे नाव *",
  "staffCustomersNew.phone10Digits": "फोन (10 अंक)",
  "staffCustomersNew.city": "शहर",
  "staffCustomersNew.address": "पत्ता",
  "staffCustomersNew.creditLimit": "उधारी मर्यादा (₹)",

  // ── staffHome ──
  "staffHome.couldntCloneOrder": "ऑर्डर पुन्हा तयार करता आला नाही",

  // ── common ──
  "common.pleaseTryAgain": "कृपया पुन्हा प्रयत्न करा.",
  "common.settings": "सेटिंग्ज",

  // ── staffHome ──
  "staffHome.stock": "स्टॉक",

  // ── common ──
  "common.customer": "ग्राहक",

  // ── staffHome ──
  "staffHome.resumeInProgressOrder": "अर्धवट ऑर्डर पुढे चालू ठेवा",
  "staffHome.resumeOrder": "ऑर्डर पुढे चालू ठेवा",
  "staffHome.draftInProgress": "अर्धवट ऑर्डर",

  // ── common ──
  "common.customerDelivery": "ग्राहक आणि डिलिव्हरी",

  // ── staffHome ──
  "staffHome.deleteThisDraft": "हा अर्धवट ऑर्डर काढायचा?",
  "staffHome.everythingTypedForThisOrder": "या ऑर्डरसाठी भरलेले सर्व काही निघून जाईल. ते परत आणता येणार नाही.",
  "staffHome.deleteDraft": "अर्धवट ऑर्डर काढा",
  "staffHome.deleteThisDraft2": "हा अर्धवट ऑर्डर काढा",
  "staffHome.repeatThisOrder": "हा ऑर्डर पुन्हा टाकायचा?",
  "staffHome.opensANewOrderWith": "त्याच ग्राहक आणि आयटमसह नवा ऑर्डर उघडेल.",
  "staffHome.repeat": "पुन्हा टाका",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.editOrderDetails": "ऑर्डरची माहिती बदला",
  "staffOrdersDetail.editDetails": "✎ माहिती बदला",
  "staffOrdersDetail.editLineItems": "आयटम बदला",
  "staffOrdersDetail.editItems": "✎ आयटम बदला",
  "staffOrdersDetail.cancelThisOrder": "हा ऑर्डर रद्द करा",
  "staffOrdersDetail.cancel": "✕ रद्द करा",
  "staffOrdersDetail.awaitingYourDecision": "तुमच्या निर्णयाची वाट",
  "staffOrdersDetail.approveToReleaseTheOrder": "मंजूर केल्यावर ऑर्डर फॅक्टरीला जाईल. नाकारताना कारण लिहा — सेल्समनला नोटिफिकेशन जाईल.",
  "staffOrdersDetail.rejectionReason": "नाकारण्याचे कारण",
  "staffOrdersDetail.eGPriceTooLow": "उदा. रेट खूप कमी / ग्राहकाची उधारी थांबवली आहे",
  "staffOrdersDetail.rejectWithReason": "कारणासह नाकारा",
  "staffOrdersDetail.rejectThisOrder": "हा ऑर्डर नाकारायचा?",
  "staffOrdersDetail.theSalespersonGetsAPush": "सेल्समनला नोटिफिकेशन जाईल. कारण: \"{reason}\"",
  "staffOrdersDetail.reasonRequired": "कारण आवश्यक आहे",
  "staffOrdersDetail.aCancellationReasonIsRequired": "रद्द करण्याचे कारण लिहिणे आवश्यक आहे, म्हणजे नंतर समजेल.",
  "staffOrdersDetail.cancelFailed": "रद्द करता आले नाही",
  "staffOrdersDetail.keepOrder": "ऑर्डर ठेवा",
  "staffOrdersDetail.cancel2": "{orderNumber} रद्द करायचा?",
  "staffOrdersDetail.thisWillCancelTheOrder": "ऑर्डर रद्द होईल आणि फॅक्टरीला कळवले जाईल.",
  "staffOrdersDetail.couldNotConfirm": "खात्री करता आली नाही",
  "staffOrdersDetail.savedForRetry": "नंतर पाठवण्यासाठी सेव्ह केले",
  "staffOrdersDetail.noNetworkRightNowDelivery": "आत्ता नेटवर्क नाही — नेटवर्क आल्यावर डिलिव्हरीची खात्री आपोआप होईल.",
  "staffOrdersDetail.confirmDelivered": "डिलिव्हरी झाली",
  "staffOrdersDetail.closesTheOrderAndStamps": "ऑर्डर बंद होईल आणि डिलिव्हरीची वेळ नोंदवली जाईल. हवे असल्यास सही केलेल्या LR चा किंवा ग्राहकाच्या पुष्टीचा फोटो जोडा.",
  "staffOrdersDetail.confirming": "खात्री होत आहे…",
  "staffOrdersDetail.confirmDelivered2": "डिलिव्हरी झाल्याची खात्री करायची?",
  "staffOrdersDetail.stampsTheDeliveryTimeAnd": "डिलिव्हरीची वेळ नोंदवली जाईल आणि फोटो जोडला जाईल.",
  "staffOrdersDetail.stampsTheDeliveryTimeYou": "डिलिव्हरीची वेळ नोंदवली जाईल. हवे असल्यास आधी वर फोटो जोडा, किंवा फोटोशिवाय खात्री करा.",
  "staffOrdersDetail.page": " — पान {pageIndex}",
  "staffOrdersDetail.attachAnOrderProofCustomer": "ऑर्डरचा पुरावा जोडा (ग्राहकाचा PO, WhatsApp वरील पुष्टी). बिल आणि LR फॅक्टरीकडून येतात.",
  "staffOrdersDetail.type": "प्रकार",
  "staffOrdersDetail.uploadDocument": "कागदपत्र अपलोड करा",
  "staffOrdersDetail.pages": " — {pageCount} पाने",
  "staffOrdersDetail.openPinchToZoomShare": "उघडा · झूम करा · शेअर करा",

  // ── common ──
  "common.couldNotLoad": "लोड करता आले नाही",

  // ── staffOrdersEditItemsDetail ──
  "staffOrdersEditItemsDetail.incompleteLines": "अपूर्ण आयटम",
  "staffOrdersEditItemsDetail.everyLineNeedsAProduct": "प्रत्येक आयटममध्ये प्रॉडक्ट, प्रमाण आणि रेट आवश्यक आहे.",
  "staffOrdersEditItemsDetail.itemsUpdated": "आयटम अपडेट झाले.",
  "staffOrdersEditItemsDetail.editItems": "आयटम बदला",
  "staffOrdersEditItemsDetail.cannotEditItems": "आयटम बदलता येत नाहीत",
  "staffOrdersEditItemsDetail.noItemsTapAddItem": "आयटम नाहीत. जोडण्यासाठी \"आयटम जोडा\" दाबा.",
  "staffOrdersEditItemsDetail.removeLine": "आयटम काढा",

  // ── common ──
  "common.delete": "काढा",

  // ── staffOrdersEditItemsDetail ──
  "staffOrdersEditItemsDetail.editLine": "आयटम बदला",

  // ── common ──
  "common.newProduct": "नवा प्रॉडक्ट",
  "common.orderTotal": "ऑर्डरची एकूण रक्कम",
  "common.addItem": "+ आयटम जोडा",
  "common.saveChanges": "बदल सेव्ह करा",

  // ── staffOrdersEditDetail ──
  "staffOrdersEditDetail.orderDetailsUpdated": "ऑर्डरची माहिती अपडेट झाली.",
  "staffOrdersEditDetail.editOrder": "ऑर्डर बदला",
  "staffOrdersEditDetail.cannotEdit": "बदलता येत नाही",

  // ── common ──
  "common.customerName": "ग्राहकाचे नाव",
  "common.typeCustomerName": "ग्राहकाचे नाव लिहा",

  // ── staffOrdersEditDetail ──
  "staffOrdersEditDetail.ledgerCustomer": "✓ खात्यातील ग्राहक",
  "staffOrdersEditDetail.savedAsNewCustomer": "नवा ग्राहक म्हणून सेव्ह होईल",

  // ── common ──
  "common.delivery": "डिलिव्हरी",
  "common.dispatchLocation": "पाठवण्याचे ठिकाण",
  "common.addressGodownOrLedgerLocation": "पत्ता, गोदाम किंवा खात्यातील ठिकाण",
  "common.expectedDelivery": "अपेक्षित डिलिव्हरी",
  "common.pickADate": "तारीख निवडा",
  "common.paymentTerms": "पेमेंटच्या अटी",
  "common.transport": "ट्रान्सपोर्ट",
  "common.tokenGift": "टोकन / गिफ्ट",
  "common.notesOptional": "नोट्स (आवश्यक नाही)",

  // ── staffOrdersNewHome ──
  "staffOrdersNewHome.noLedgerMatchTheName": "खात्यात हे नाव सापडले नाही — तुम्ही लिहिलेले नाव नवा ग्राहक म्हणून सेव्ह होईल.",
  "staffOrdersNewHome.pick": "{name} निवडा",
  "staffOrdersNewHome.anythingTheFactoryShouldKnow": "फॅक्टरीला काही सांगायचे असल्यास",
  "staffOrdersNewHome.eGFragileCallBefore": "उदा. नाजूक माल · पाठवण्याआधी कॉल करा",
  "staffOrdersNewHome.continueToItems": "आयटमकडे पुढे जा",

  // ── staffOrdersNewItems ──
  "staffOrdersNewItems.items": "आयटम",
  "staffOrdersNewItems.noItemsYetTapAdd": "अजून आयटम नाहीत. पहिला आयटम जोडण्यासाठी \"आयटम जोडा\" दाबा.",
  "staffOrdersNewItems.review": "तपासणी",

  // ── common ──
  "common.order": "ऑर्डर",

  // ── staffOrdersNewReview ──
  "staffOrdersNewReview.someFieldsAreStillEmpty": "काही माहिती अजून रिकामी आहे.",
  "staffOrdersNewReview.orderNotPlaced": "ऑर्डर गेला नाही",
  "staffOrdersNewReview.orderPlaced": "ऑर्डर गेला",
  "staffOrdersNewReview.theFactoryWillSeeIt": "फॅक्टरीला लगेच दिसेल.",
  "staffOrdersNewReview.theOrderWillBeSent": "नेटवर्क आल्यावर ऑर्डर आपोआप पाठवला जाईल.",
  "staffOrdersNewReview.reviewPlace": "तपासा आणि पाठवा",
  "staffOrdersNewReview.overCreditLimit": "उधारी मर्यादेपेक्षा जास्त",
  "staffOrdersNewReview.1LineBelowFloorRate": "1 आयटम फ्लोअर रेटपेक्षा कमी",
  "staffOrdersNewReview.linesBelowFloorRate": "{count} आयटम फ्लोअर रेटपेक्षा कमी",
  "staffOrdersNewReview.dispatchTo": "कुठे पाठवायचे",
  "staffOrdersNewReview.payment": "पेमेंट",
  "staffOrdersNewReview.token": "टोकन",
  "staffOrdersNewReview.cashDiscount": "कॅश डिस्काउंट",
  "staffOrdersNewReview.customDiscountOptional": "वेगळा डिस्काउंट % (आवश्यक नाही)",
  "staffOrdersNewReview.subtotal": "उप-बेरीज",
  "staffOrdersNewReview.cashDiscount2": "कॅश डिस्काउंट ({discountPct}%)",
  "staffOrdersNewReview.taxableAmount": "करपात्र रक्कम",
  "staffOrdersNewReview.grandTotal": "एकूण बेरीज",
  "staffOrdersNewReview.placing": "पाठवला जात आहे…",
  "staffOrdersNewReview.placeOrder": "ऑर्डर पाठवा",
  "staffOrdersNewReview.placeOrder2": "ऑर्डर पाठवायचा?",
  "staffOrdersNewReview.theOrderWillGoTo": "फॅक्टरीला दिसण्याआधी ऑर्डर मॅनेजमेंटच्या मंजुरीसाठी जाईल.",

  // ── staffPaymentsDetail ──
  "staffPaymentsDetail.paymentNotFound": "पेमेंट सापडले नाही.",
  "staffPaymentsDetail.onAccountPayment": "खात्यावर जमा पेमेंट",
  "staffPaymentsDetail.addProof": "पुरावा जोडा",
  "staffPaymentsDetail.snapTheBankUpiScreen": "बँक / UPI स्क्रीन किंवा चेकचा फोटो आत्ताच घ्या — हिशोब जुळवणे सोपे होते.",
  "staffPaymentsDetail.proofType": "पुराव्याचा प्रकार",
  "staffPaymentsDetail.referenceNoteOptional": "रेफरन्स नोट (आवश्यक नाही)",
  "staffPaymentsDetail.utrChequeNoAnyReference": "UTR / चेक नंबर / कोणताही रेफरन्स",
  "staffPaymentsDetail.uploadProof": "पुरावा अपलोड करा",
  "staffPaymentsDetail.proofs": "पुरावे ({count})",
  "staffPaymentsDetail.noProofsUploadedYet": "अजून पुरावा अपलोड केलेला नाही.",
  "staffPaymentsDetail.unableToOpenTheFile": "फाइल उघडता आली नाही — थोड्या वेळाने पुन्हा प्रयत्न करा.",
  "staffPaymentsDetail.openFullSize": "पूर्ण उघडा →",

  // ── common ──
  "common.loading": "लोड होत आहे…",

  // ── staffPaymentsHome ──
  "staffPaymentsHome.recordedCollectionsAndProofsTap": "नोंदवलेली पेमेंट आणि पुरावे. नवे जोडण्यासाठी + दाबा.",
  "staffPaymentsHome.noPaymentsYet": "अजून पेमेंट नाही",
  "staffPaymentsHome.tapTheButtonToRecord": "आज मिळालेले पेमेंट नोंदवण्यासाठी + दाबा.",
  "staffPaymentsHome.noProof": "पुरावा नाही",

  // ── staffPaymentsNew ──
  "staffPaymentsNew.searchYourLedger": "तुमच्या खात्यात शोधा…",

  // ── staffSettings ──
  "staffSettings.orderStatusUpdates": "ऑर्डरच्या स्थितीची सूचना",
  "staffSettings.whenAnOrderYouPlaced": "तुमचा ऑर्डर पुढे गेल्यावर — तयार होत आहे, पाठवण्यास तयार, LR तयार, पाठवला.",
  "staffSettings.invoiceLrUploaded": "बिल / LR अपलोड झाली",
  "staffSettings.whenTheFactoryUploadsAn": "फॅक्टरीने तुमच्या ऑर्डरचे बिल किंवा LR अपलोड केल्यावर.",
  "staffSettings.comments": "टिप्पण्या",
  "staffSettings.whenAnyonePostsAComment": "तुमच्या ऑर्डरवर कोणी टिप्पणी लिहिल्यावर.",
  "staffSettings.adminAlerts": "मॅनेजमेंट अलर्ट",
  "staffSettings.staleOrders": "अडकलेले ऑर्डर",
  "staffSettings.anyOrderStillInOrder": "ठरलेल्या तासांपेक्षा जास्त वेळ ‘प्लेस्ड’ मध्ये पडलेला ऑर्डर.",
  "staffSettings.creditCheckFailures": "उधारी तपासणीत अडकलेले",
  "staffSettings.anOrderWasPlacedBut": "ऑर्डर टाकला गेला पण उधारी तपासणी पास झाली नाही.",

  // ── staffStock ──
  "staffStock.stockInFactory": "फॅक्टरीतील स्टॉक",
  "staffStock.lastTallySync": "Tally शी शेवटचा सिंक: {latestSync}",
  "staffStock.stockLevelsComeFromTally": "स्टॉक Tally मधून येतो — मॅनेजमेंटने Tally चालू केल्यावर इथे दिसेल.",
  "staffStock.search": "शोधा",
  "staffStock.productOrCategory": "प्रॉडक्ट किंवा प्रकार…",
  "staffStock.noStockItemsMatchYour": "तुमच्या शोधाशी जुळणारा स्टॉक नाही.",
  "staffStock.stockLevelsComeFromTally2": "स्टॉक Tally मधून येतो. अजून इथे काही नाही — मॅनेजमेंटला Tally जोडायला सांगा.",

  // ── accountDisabled ──
  "accountDisabled.yourAccessHasBeenRemoved": "तुमचा प्रवेश काढून टाकला आहे",
  "accountDisabled.anAdministratorHasDisabledYour": "मॅनेजमेंटने तुमचे Syncit अकाउंट बंद केले आहे. तुमचा डेटा सुरक्षित आहे — काहीही काढलेले नाही. पुन्हा चालू करण्यासाठी तुमच्या मॅनेजरशी बोला.",
  "accountDisabled.backToSignIn": "साइन इनवर परत जा",

  // ── unlock ──
  "unlock.biometricUnavailableSignOutAnd": "फिंगरप्रिंट उपलब्ध नाही. साइन आउट करून PIN सह पुन्हा सेट करा.",
  "unlock.unlockCancelled": "अनलॉक रद्द केले.",
  "unlock.enterYour6DigitPin": "तुमचा 6 अंकी PIN टाका.",
  "unlock.tooManyWrongAttemptsSigned": "खूप वेळा चुकीचा PIN टाकला. तुम्ही साइन आउट झाला आहात. तुमच्या मॅनेजरकडून नवा कोड घ्या.",
  "unlock.wrongPinWrongAttemptsSign": "चुकीचा PIN. {MAX_PIN_ATTEMPTS} वेळा चुकल्यास तुम्ही साइन आउट व्हाल.",
  "unlock.unlock": "अनलॉक करा",
  "unlock.useYourFingerprintOrFace": "तुमचा फिंगरप्रिंट किंवा चेहरा वापरा.",
  "unlock.thisDeviceIsntSetUp": "हा फोन सेट केलेला नाही. साइन आउट करून पुन्हा सेट करा.",
  "unlock.unlockWithBiometric": "फिंगरप्रिंटने अनलॉक करा",
  "unlock.signOut": "साइन आउट",

  // ── updateRequired ──
  "updateRequired.updateRequired": "अपडेट आवश्यक आहे",
  "updateRequired.unknown": "माहीत नाही",
  "updateRequired.checkForUpdates": "अपडेट तपासा",

  // ── activityFeed ──
  "activityFeed.activity": "घडामोडी",
  "activityFeed.statusChangesAndCommentsIn": "स्थितीतील बदल आणि टिप्पण्या एकाच ठिकाणी. त्या बदलता येत नाहीत.",
  "activityFeed.addACommentCustomerWants": "टिप्पणी लिहा — उदा. ‘ग्राहकाला 25 नाही, 20 किलो हवे’",
  "activityFeed.post": "पाठवा",
  "activityFeed.noActivityYet": "अजून काही घडामोडी नाहीत.",
  "activityFeed.comment": "टिप्पणी",

  // ── backBar ──
  "backBar.back": "मागे",

  // ── documentViewer ──
  "documentViewer.shareThisDocument": "हे कागदपत्र शेअर करा",
  "documentViewer.longPressToCopyThe": "खालील लिंक कॉपी करण्यासाठी दाबून धरा (15 मिनिटे चालेल):\n\n",
  "documentViewer.closeViewer": "बंद करा",
  "documentViewer.close": "✕ बंद करा",
  "documentViewer.shareViaWhatsappOrOther": "WhatsApp किंवा इतर मार्गाने शेअर करा",
  "documentViewer.share": "शेअर करा",

  // ── errorBoundary ──
  "errorBoundary.somethingWentWrong": "काहीतरी बिघडले",
  "errorBoundary.syncitHitAnUnexpectedError": "या स्क्रीनवर Syncit मध्ये अडचण आली. तुमचा डेटा सुरक्षित आहे — काहीही पाठवले किंवा हरवले नाही. ‘रिपोर्ट करा’ दाबा म्हणजे आम्ही ते दुरुस्त करू, मग होमवर परत जा.",
  "errorBoundary.reportThisProblemToThe": "ही अडचण टीमला कळवा",
  "errorBoundary.reportAProblem": "अडचण रिपोर्ट करा",
  "errorBoundary.backToHome": "होमवर परत",

  // ── itemSheet ──
  "itemSheet.customNotInCatalogue": "वेगळे / यादीत नाही",
  "itemSheet.editItem": "आयटम बदला",
  "itemSheet.addItem": "आयटम जोडा",
  "itemSheet.close": "बंद करा",
  "itemSheet.brand": "ब्रँड",
  "itemSheet.chooseBrand": "ब्रँड निवडा",
  "itemSheet.privateLabelBrandName": "प्रायव्हेट-लेबल ब्रँडचे नाव",
  "itemSheet.enterTheBrandTheCustomer": "ग्राहक ज्या ब्रँडच्या नावाने विकतो ते लिहा",
  "itemSheet.productGrade": "प्रॉडक्ट / ग्रेड",
  "itemSheet.loadingProducts": "प्रॉडक्ट लोड होत आहेत…",
  "itemSheet.searchByNameOrGrade": "नाव किंवा ग्रेड कोडने शोधा",
  "itemSheet.customProductName": "वेगळ्या प्रॉडक्टचे नाव",
  "itemSheet.productNameGradeOrPrivate": "प्रॉडक्टचे नाव, ग्रेड किंवा प्रायव्हेट-लेबल नाव",
  "itemSheet.quantity": "प्रमाण",
  "itemSheet.packing": "पॅकिंग",
  "itemSheet.customPackingOptional": "वेगळे पॅकिंग (आवश्यक नाही)",
  "itemSheet.eG310MlCartridge": "उदा. \"310 ml कार्ट्रिज\", \"500 ml बाटली\"",
  "itemSheet.size": "साइज",
  "itemSheet.customSizeOptionalKgOr": "वेगळा साइज (आवश्यक नाही, kg किंवा ml)",
  "itemSheet.packingOptional": "पॅकिंग (आवश्यक नाही)",
  "itemSheet.sizeOptional": "साइज / प्रकार (आवश्यक नाही)",
  "itemSheet.searchProducts": "प्रॉडक्टचे नाव किंवा कोडने शोधा",
  "itemSheet.ratePerUnit": "प्रति युनिट रेट",
  "itemSheet.lineTotal": "आयटमची एकूण रक्कम",
  "itemSheet.save": "सेव्ह करा",
  "itemSheet.add": "जोडा",

  // ── numberPad ──
  "numberPad.backspace": "खोडा",

  // ── orderCard ──
  "orderCard.call": "{salespersonName} यांना कॉल करा",
  "orderCard.repeatThisOrder": "हा ऑर्डर पुन्हा टाका",
  "orderCard.repeat": "↻ पुन्हा टाका",

  // ── photoPicker ──
  "photoPicker.cameraAccessNeeded": "कॅमेऱ्याची परवानगी हवी",
  "photoPicker.enableCameraInSettingsSo": "फोनच्या सेटिंग्जमध्ये कॅमेरा चालू करा म्हणजे Syncit पुराव्याचा फोटो घेऊ शकेल.",
  "photoPicker.photoAccessNeeded": "फोटोची परवानगी हवी",
  "photoPicker.enablePhotoAccessInSettings": "फोनच्या सेटिंग्जमध्ये फोटोची परवानगी द्या म्हणजे Syncit पुरावा जोडू शकेल.",
  "photoPicker.removeSelectedPhoto": "निवडलेला फोटो काढा",
  "photoPicker.remove": "✕ काढा",
  "photoPicker.retakePhoto": "फोटो पुन्हा घ्या",
  "photoPicker.takePhoto": "फोटो घ्या",
  "photoPicker.fromGallery": "गॅलरीतून",

  // ── pickerField ──
  "pickerField.opensPicker": "{label}: {n}. यादी उघडेल.",

  // ── common ──
  "common.closePicker": "यादी बंद करा",

  // ── pickerField ──
  "pickerField.recent": "अलीकडील",
  "pickerField.all": "सर्व",
  "pickerField.noMatches": "काही सापडले नाही.",

  // ── common ──
  "common.stillWaiting": "अजून बाकी",
  "common.nothingNewToSync": "सिंक करण्यासाठी नवे काही नाही.",
  "common.youreOfflineTheQueueWill": "तुम्ही ऑफलाइन आहात. नेटवर्क आल्यावर सर्व पाठवले जाईल.",
  "common.someFailed": "काही पाठवता आले नाही",

  // ── queueSummary ──
  "queueSummary.syncedStillWaitingCheckIndividual": "{sent} सिंक झाले · {failed} अजून बाकी. कारण प्रत्येक आयटमखाली पाहा.",
  "queueSummary.failedToSendTapFor": "{stuckCount} पाठवता आले नाहीत. माहितीसाठी दाबा.",
  "queueSummary.waitingToSyncTapFor": "{total} सिंक होणे बाकी. माहितीसाठी दाबा.",
  "queueSummary.failedTapToSeeWhy": "{stuckCount} पाठवता आले नाहीत — कारण पाहण्यासाठी दाबा",
  "queueSummary.waitingToSync": "{total} सिंक होणे बाकी",
  "queueSummary.waitingToSync2": "सिंक होणे बाकी",
  "queueSummary.someItemsFailedToSend": "काही आयटम पाठवता आले नाहीत. कारण प्रत्येकाखाली लिहिले आहे. ते दुरुस्त होईपर्यंत पुन्हा प्रयत्न करून उपयोग नाही — तुमच्या मॅनेजरला सांगा.",
  "queueSummary.retryingAutomaticallyTapRetryNow": "आपोआप पुन्हा प्रयत्न होत आहे. लगेच पाठवण्यासाठी ‘आत्ता पाठवा’ दाबा.",
  "queueSummary.youreOfflineItemsWillSend": "तुम्ही ऑफलाइन आहात. नेटवर्क आल्यावर सर्व आपोआप पाठवले जाईल.",
  "queueSummary.orders": "ऑर्डर · {count}",
  "queueSummary.statusChanges": "स्थितीतील बदल · {count}",
  "queueSummary.documents": "कागदपत्रे · {count}",
  "queueSummary.page": " — पान {pageIndex}",

  // ── common ──
  "common.retrySyncingNow": "आत्ता पुन्हा सिंक करा",
  "common.syncing": "सिंक होत आहे…",
  "common.retryNow": "आत्ता पाठवा",

  // ── selectField ──
  "selectField.opensPicker": "{label}: {n}. यादी उघडेल.",

  // ── syncPill ──
  "syncPill.sync": "सिंक",
  "syncPill.everythingIsUpToDate": "सर्व काही अपडेट आहे.",
  "syncPill.orders": "ऑर्डर · {count}",
  "syncPill.statusChanges": "स्थितीतील बदल · {count}",
  "syncPill.documents": "कागदपत्रे · {count}",
  "syncPill.page": " — पान {pageIndex}",
  "syncPill.syncedStillWaitingSeeIndividual": "{sent} सिंक झाले · {failedNow} अजून बाकी. कारण प्रत्येक आयटमखाली पाहा.",

  // ── updateBanner ──
  "updateBanner.updateAvailable": "अपडेट उपलब्ध आहे",
  "updateBanner.restartToInstallTheLatest": "नवे व्हर्जन बसवण्यासाठी अॅप पुन्हा सुरू करा.",
  "updateBanner.restartTheAppToInstall": "अपडेट बसवण्यासाठी अॅप पुन्हा सुरू करा",
  "updateBanner.restart": "पुन्हा सुरू करा",

  // ── common ──
  "common.expoPublicAppUrlIs": "EXPO_PUBLIC_APP_URL is not set.",

  // ── accountDeletion ──
  "accountDeletion.youreSignedOutSignIn": "तुम्ही साइन आउट आहात. पुन्हा साइन इन करून प्रयत्न करा.",
  "accountDeletion.requestFailed": "विनंती पूर्ण झाली नाही ({status}).",
  "accountDeletion.noConnectionTryAgainWhen": "नेटवर्क नाही. ऑनलाइन आल्यावर पुन्हा प्रयत्न करा.",

  // ── errors ──
  "errors.savedOnYourPhoneWill": "फोनमध्ये सेव्ह आहे — नेटवर्क आल्यावर पाठवले जाईल.",
  "errors.noSignalTryAgainIn": "नेटवर्क नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.",
  "errors.youveBeenSignedOutSign": "तुम्ही साइन आउट झाला आहात. पुढे जाण्यासाठी पुन्हा साइन इन करा.",
  "errors.youDontHavePermissionFor": "तुम्हाला याची परवानगी नाही. तुमच्या मॅनेजरला विचारा.",
  "errors.tooManyAttemptsWaitA": "खूप वेळा प्रयत्न झाला. एक मिनिट थांबून पुन्हा प्रयत्न करा.",
  "errors.somethingWentWrongTryAgain": "काहीतरी बिघडले. पुन्हा प्रयत्न करा.",

  // ── orderCommentQueries ──
  "orderCommentQueries.saySomethingBeforeSending": "पाठवण्याआधी काहीतरी लिहा.",
  "orderCommentQueries.tooLong4000CharMax": "खूप लांब आहे (जास्तीत जास्त 4000 अक्षरे).",

  // ── common ──
  "common.notSignedIn": "साइन इन केलेले नाही.",

  // ── requestCode ──
  "requestCode.tooManyCodeRequestsTry": "खूप वेळा कोड मागितला. थोड्या वेळाने प्रयत्न करा.",
  "requestCode.requestFailed": "विनंती पूर्ण झाली नाही ({status}).",

  // ── uploads ──
  "uploads.fileNoLongerExistsOn": "फाइल आता फोनमध्ये नाही.",
  "uploads.fileMustBe10Mb": "फाइल 10 MB किंवा त्यापेक्षा लहान असावी.",
  "uploads.uploadEndpointNotConfigured": "अपलोडची सेटिंग केलेली नाही.",
  "uploads.uploadFailed": "अपलोड झाले नाही.",
  "uploads.uploadFailed2": "अपलोड झाले नाही: {message}",

  // ── useOptimisticStatus ──
  "useOptimisticStatus.couldntUpdateStatus": "स्थिती अपडेट करता आली नाही",

  // ── whatsapp ──
  "whatsapp.whatsappNotAvailable": "WhatsApp उपलब्ध नाही",
  "whatsapp.installWhatsappOrCopyThe": "WhatsApp इन्स्टॉल करा किंवा मेसेज स्वतः कॉपी करा.",

  // ── paymentTerm ──
  "paymentTerm.ADVANCE": "अॅडव्हान्स",
  "paymentTerm.CREDIT": "उधार",
  "paymentTerm.PDC": "PDC",
  "paymentTerm.IMMEDIATE": "लगेच",
  "paymentTerm.AGAINST_DISPATCH": "डिस्पॅचवर",
  "paymentTerm.OTHER": "इतर",

  // ── transport ──
  "transport.PAID": "पेड",
  "transport.TO_PAY": "टू-पे",
  "transport.GODOWN": "गोदाम",
  "transport.DOOR": "डोअर",
  "transport.OTHER": "इतर",

  // ── paymentMethod ──
  "paymentMethod.CASH": "रोख",
  "paymentMethod.CHEQUE": "चेक",
  "paymentMethod.NEFT": "NEFT",
  "paymentMethod.RTGS": "RTGS",
  "paymentMethod.UPI": "UPI",
  "paymentMethod.OTHER": "इतर",

  // ── paymentDoc ──
  "paymentDoc.BANK_SCREENSHOT": "बँक स्क्रीनशॉट",
  "paymentDoc.CHEQUE_PHOTO": "चेकचा फोटो",
  "paymentDoc.UPI_SCREENSHOT": "UPI स्क्रीनशॉट",
  "paymentDoc.RECEIPT": "सही केलेली पावती",
  "paymentDoc.OTHER": "इतर",

  // ── orderDoc ──
  "orderDoc.INVOICE": "बिल",
  "orderDoc.LORRY_RECEIPT": "लॉरी पावती (LR)",
  "orderDoc.ORDER_PROOF": "ऑर्डरचा पुरावा",
  "orderDoc.OTHER": "इतर",

  // ── holdReason ──
  "holdReason.RAW_MATERIAL_SHORTAGE": "कच्च्या मालाची कमतरता",
  "holdReason.AWAITING_CUSTOMER_CONFIRMATION": "ग्राहकाच्या पुष्टीची वाट",
  "holdReason.PAYMENT_HOLD": "पेमेंटमुळे थांबवले",
  "holdReason.OTHER": "इतर",

  // ── lineStatus ──
  "lineStatus.PENDING": "बाकी",
  "lineStatus.IN_PRODUCTION": "तयार होत आहे",
  "lineStatus.READY": "तयार",

  // ── role ──
  "role.ADMIN": "मॅनेजमेंट",
  "role.STAFF": "सेल्स",
  "role.FACTORY": "फॅक्टरी",

  // ── common ──
  "common.unknownCustomer": "अज्ञात ग्राहक",

  // ── payments ──
  "payments.invoiceNumber": "बिल {number}",
  "payments.recordedBy": "{name} यांनी नोंदवले",

  // ── common ──
  "common.placedOn": "{date} रोजी टाकला",

  // ── adminApprovals ──
  "adminApprovals.empty": "काही बाकी नाही. सर्व पूर्ण झाले.",

  // ── adminFactory ──
  "adminFactory.avg": "सरासरी {time}",

  // ── time ──
  "time.hoursShort": "{n} ता",
  "time.daysShort": "{n} दिवस",

  // ── adminFactory ──
  "adminFactory.lastChange": "{status} · शेवटचा बदल {date}",

  // ── adminTeam ──
  "adminTeam.subtitle": "मागील {days} दिवस · ऑर्डर पाहण्यासाठी नावावर दाबा · एखाद्याला चालू किंवा बंद करण्यासाठी बटण दाबून धरा.",

  // ── authCode ──
  "authCode.genericError": "हा कोड चालला नाही. ईमेलच्या स्क्रीनवरून नवा कोड मागा.",
  "authCode.networkError": "कोड तपासण्यासाठी Syncit शी जोडता आले नाही. इंटरनेट तपासा आणि पुन्हा Verify दाबा — तुमचा कोड अजून वैध आहे.",

  // ── factoryHome ──
  "factoryHome.lastOrderArrived": "शेवटचा ऑर्डर {when} आला",
  "factoryHome.chaseAdmin": "विचारा: मॅनेजमेंटला.",
  "factoryHome.chasePerson": "विचारा: {name} यांना.",
  "factoryHome.chaseSalesperson": "विचारा: सेल्समनला.",

  // ── factoryStep ──
  "factoryStep.IN_PRODUCTION": "बनवणे सुरू करा",
  "factoryStep.READY_TO_DISPATCH": "पॅक करून तयार",
  "factoryStep.DISPATCHED": "पाठवला",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.moveTo": "{orderNumber} ला {status} मध्ये न्यायचे?",
  "factoryOrdersDetail.pendingChanges.one": "या ऑर्डरचा {count} बदल सिंक होणे बाकी आहे. फोन ऑनलाइन आल्यावर तो आपोआप लागू होईल.",
  "factoryOrdersDetail.pendingChanges.other": "या ऑर्डरचे {count} बदल सिंक होणे बाकी आहेत. फोन ऑनलाइन आल्यावर ते आपोआप लागू होतील.",

  // ── common ──
  "common.placedBy": "{name} यांनी टाकला",
  "common.salesperson": "सेल्समन",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.lineStart": "सुरू करा",
  "factoryOrdersDetail.lineMarkReady": "तयार",
  "factoryOrdersDetail.lineDone": "झाले",

  // ── common ──
  "common.pageN": "पान {n}",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.uploadPages.one": "{count} पान अपलोड करा",
  "factoryOrdersDetail.uploadPages.other": "{count} पाने अपलोड करा",
  "factoryOrdersDetail.waitingToUpload": "{count} अपलोड होणे बाकी",

  // ── common ──
  "common.queuedOn": "{date} रोजी सेव्ह झाले",
  "common.attempts.one": "{count} प्रयत्न",
  "common.attempts.other": "{count} प्रयत्न",

  // ── home ──
  "home.viewing": "दिसत आहे: {scope}",

  // ── common ──
  "common.items.one": "{count} आयटम",
  "common.items.other": "{count} आयटम",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.cancelReasonPrompt": "थोडक्यात कारण लिहा — ते ऑर्डरच्या इतिहासात दिसेल.",
  "staffOrdersDetail.openDoc": "{name} उघडा",
  "staffOrdersDetail.openDocPages": "{name} उघडा, {count} पाने",

  // ── staffOrdersEdit ──
  "staffOrdersEdit.lockedItems": "हा ऑर्डर {status} आहे. आयटम फक्त डिस्पॅचआधी बदलता येतात.",
  "staffOrdersEdit.locked": "हा ऑर्डर {status} आहे. तो फक्त डिस्पॅचआधी बदलता येतो.",

  // ── staffOrdersNew ──
  "staffOrdersNew.ledgerCustomer": "खात्यातील ग्राहक",
  "staffOrdersNew.moreMatches": "+{count} आणखी — कमी करण्यासाठी पुढे लिहा.",

  // ── staffOrdersNewReview ──
  "staffOrdersNewReview.overLimitBody": "बाकी {outstanding} + हा ऑर्डर {order} = {projected}, जे {limit} च्या मर्यादेपेक्षा जास्त आहे. मॅनेजमेंटची मंजुरी लागू शकते.",
  "staffOrdersNewReview.belowFloorLine": "लाइन {line} · {product}: {rate}, फ्लोअर रेट {floor} पेक्षा कमी आहे. फॅक्टरीला दिसण्याआधी मॅनेजमेंटची मंजुरी आवश्यक आहे.",
  "staffOrdersNewReview.itemsHeader.one": "आयटम · {count} लाइन",
  "staffOrdersNewReview.itemsHeader.other": "आयटम · {count} लाइन",

  // ── payments ──
  "payments.proofs.one": "{count} पुरावा",
  "payments.proofs.other": "{count} पुरावे",

  // ── updateRequired ──
  "updateRequired.body": "तुमच्या कंपनीने एक आवश्यक सुरक्षा अपडेट दिले आहे. तुमच्याकडे Syncit {current} आहे; किमान {minimum} हवे.\n\nPlay Store वरून किंवा तुमच्या मॅनेजरने दिलेल्या लिंकवरून नवे व्हर्जन बसवा, मग Syncit पुन्हा उघडा.",

  // ── sync ──
  "sync.itemsSynced.one": "{count} आयटम सिंक झाला.",
  "sync.itemsSynced.other": "{count} आयटम सिंक झाले.",
  "sync.pill.syncing": "सिंक होत आहे…",
  "sync.pill.failed": "{count} गेले नाहीत",
  "sync.pill.queued": "{count} बाकी",
  "sync.pill.offlineQueued": "ऑफलाइन · {count} बाकी",
  "sync.pill.synced": "सिंक झाले",
  "sync.pill.offline": "ऑफलाइन",
  "sync.a11y.syncing": "सिंक होत आहे. माहितीसाठी दाबा.",
  "sync.a11y.failed.one": "{count} आयटम सिंक झाला नाही. कारण पाहण्यासाठी दाबा.",
  "sync.a11y.failed.other": "{count} आयटम सिंक झाले नाहीत. कारण पाहण्यासाठी दाबा.",
  "sync.a11y.queued.one": "{count} आयटम सिंक होणे बाकी. माहितीसाठी दाबा.",
  "sync.a11y.queued.other": "{count} आयटम सिंक होणे बाकी. माहितीसाठी दाबा.",
  "sync.a11y.synced": "सर्व सिंक झाले. माहितीसाठी दाबा.",
  "sync.a11y.offline": "तुम्ही ऑफलाइन आहात. माहितीसाठी दाबा.",
  "sync.sheet.failed": "काही आयटम पाठवता आले नाहीत. कारण प्रत्येकाखाली लिहिले आहे. ते दुरुस्त होईपर्यंत पुन्हा प्रयत्न करून उपयोग नाही — तुमच्या मॅनेजरला सांगा.",
  "sync.sheet.syncing": "आत्ता पाठवले जात आहे.",
  "sync.sheet.nothing": "काही बाकी नाही.",
  "sync.sheet.offline": "तुम्ही ऑफलाइन आहात.",
  "sync.queuedMeta": "{date} रोजी सेव्ह झाले",
  "sync.retries.one": "{count} वेळा पुन्हा प्रयत्न",
  "sync.retries.other": "{count} वेळा पुन्हा प्रयत्न",

  // ── stock ──
  "stock.out": "स्टॉक संपला",
  "stock.low": "कमी",
  "stock.in": "स्टॉकमध्ये",

  // ── itemSheet ──
  "itemSheet.typeNameBelow": "खाली नाव लिहा",

  // ── common ──
  "common.choose": "निवडा…",
  "common.searchEllipsis": "शोधा…",

  // ── timeline ──
  "timeline.overdueBy.one": "{count} दिवस उशीर",
  "timeline.overdueBy.other": "{count} दिवस उशीर",

  // ── auth ──
  "auth.revoked": "तुमच्या मॅनेजरने या फोनला साइन आउट केले आहे.",

  // ── notifications ──
  "notifications.channel": "ऑर्डरच्या सूचना",

  // ── time ──
  "time.justNow": "आत्ताच",
  "time.minutesAgo.one": "{count} मिनिटापूर्वी",
  "time.minutesAgo.other": "{count} मिनिटांपूर्वी",
  "time.hoursAgo.one": "{count} तासापूर्वी",
  "time.hoursAgo.other": "{count} तासांपूर्वी",
  "time.daysAgo.one": "{count} दिवसापूर्वी",
  "time.daysAgo.other": "{count} दिवसांपूर्वी",

  // ── adminHome ──
  "adminHome.acrossAllCustomers": "सर्व ग्राहकांची",
  "adminHome.dsoHint": "ग्राहक सरासरी किती दिवसांत पेमेंट करतात (अंदाजे)",
  "adminHome.pastExpected": "डिलिव्हरीची तारीख उलटून गेली",
  "adminHome.lastMonth": "मागील महिना: {amount}",
  "adminHome.vsLastMonth": "{arrow} {percent}% मागील महिन्यापेक्षा ({amount})",

  // ── tabs ──
  "tabs.today": "आज",
  "tabs.customers": "ग्राहक",
  "tabs.orders": "ऑर्डर",
  "tabs.payments": "पेमेंट",
  "tabs.toMake": "बनवायचे",
  "tabs.toDispatch": "पाठवायचे",
  "tabs.doneToday": "आज झाले",
  "tabs.home": "होम",

  // ── today ──
  "today.count.one": "{count} ग्राहकाशी बोलायचे आहे",
  "today.count.other": "{count} ग्राहकांशी बोलायचे आहे",
  "today.empty": "आजचे सर्व काम झाले.",
  "today.emptyBody": "आत्ता कोणाशी पेमेंटबद्दल बोलायचे नाही. पुन्हा पाहण्यासाठी खाली ओढा.",
  "today.daysOverdue.one": "{count} दिवसापासून बाकी",
  "today.daysOverdue.other": "{count} दिवसांपासून बाकी",
  "today.dueNow": "पेमेंट बाकी",
  "today.brokenPromise": "{date} चा शब्द होता — पेमेंट आले नाही",
  "today.promiseDueToday": "आज पेमेंट देण्याचा शब्द आहे",
  "today.call": "कॉल",
  "today.whatsapp": "WhatsApp",
  "today.promise": "शब्द",
  "today.payment": "पेमेंट",
  "today.callA11y": "{name} यांना कॉल करा",
  "today.whatsappA11y": "{name} यांना WhatsApp वर आठवण करा",
  "today.promiseA11y": "{name} यांचा पेमेंटचा शब्द नोंदवा",
  "today.paymentA11y": "{name} यांचे पेमेंट नोंदवा",
  "today.noPhone": "या ग्राहकाचा फोन नंबर सेव्ह नाही.",
  "today.rowA11y": "{name}, {amount} बाकी, {overdue}",

  // ── promise ──
  "promise.title": "पेमेंटचा शब्द",
  "promise.subtitle": "{name} · {amount} बाकी",
  "promise.amount": "किती देण्याचा शब्द दिला (₹)",
  "promise.amountInvalid": "शब्द दिलेली रक्कम टाका.",
  "promise.when": "कधी देणार?",
  "promise.tomorrow": "उद्या",
  "promise.inDays": "{count} दिवसांत",
  "promise.pickDate": "तारीख निवडा",
  "promise.summary": "{date} रोजी {amount} देणार.",
  "promise.save": "शब्द सेव्ह करा",
  "promise.saved": "शब्द सेव्ह झाला: {date} रोजी {amount}",

  // ── customers ──
  "customers.subtitle": "बाकी पाहण्यासाठी ग्राहकावर दाबा.",
  "customers.empty": "अजून ग्राहक नाहीत.",
  "customers.emptyBody": "तुमचे मॅनेजर तुम्हाला जे ग्राहक देतील ते इथे दिसतील.",
  "customers.noMatch": "या नावाचा ग्राहक सापडला नाही.",
  "customers.nothingDue": "काही बाकी नाही",
  "customers.add": "ग्राहक जोडा",
  "customers.rowA11yOwes": "{name}, {amount} बाकी",
  "customers.rowA11yClear": "{name}, काही बाकी नाही",

  // ── payments ──
  "payments.record": "पेमेंट नोंदवा",
  "payments.amount": "मिळालेली रक्कम (₹)",
  "payments.amountPlaceholder": "उदा. 12500",
  "payments.method": "पेमेंट कसे मिळाले?",
  "payments.reference": "रेफरन्स (UTR / चेक नंबर)",
  "payments.save": "पेमेंट सेव्ह करा",
  "payments.saved": "सेव्ह झाले: {name} कडून {amount}",
  "payments.proofHint": "पुढची पायरी: बँक किंवा UPI स्क्रीनशॉटचा फोटो जोडा म्हणजे अकाउंट्सला विचारावे लागणार नाही.",
  "payments.proofSaved": "पुरावा जोडला",
  "payments.changeCustomer": "ग्राहक बदला",
  "payments.rowA11y": "{name}, {amount}, {date}",

  // ── common ──
  "common.close": "बंद करा",
  "common.notNow": "आत्ता नको",
  "common.optional": "आवश्यक नाही",

  // ── list ──
  "list.errorTitle": "लोड करता आले नाही",

  // ── auth ──
  "auth.email.label": "ऑफिसचा ईमेल",
  "auth.email.subtitle": "आम्ही तुम्हाला ईमेलवर 6 अंकी कोड पाठवू.",
  "auth.email.invalid": "योग्य ईमेल पत्ता टाका.",
  "auth.email.newHere": "Syncit वर नवीन आहात? तुमच्या मॅनेजरला तुम्हाला जोडायला सांगा, किंवा तुमची कंपनी इथे तयार करा:",
  "auth.email.newHereInviteOnly": "Syncit वर नवीन आहात? तुमच्या मॅनेजरला तुम्हाला जोडायला सांगा.",
  "auth.email.openWebsite": "ब्राउझरमध्ये getsyncit.app उघडा",

  // ── lock ──
  "lock.offerTitle": "Syncit तुमच्या फिंगरप्रिंटने लॉक करायचे?",
  "lock.offerPinTitle": "Syncit PIN ने लॉक करायचे?",
  "lock.offerBody": "फोन दुसऱ्याच्या हातात गेला तरी तुमचे ग्राहक आणि ऑर्डर सुरक्षित राहतात. हे नंतर सेटिंग्जमध्ये बदलता येते.",
  "lock.requiredBody": "तुमच्या कंपनीने या अॅपवर लॉक आवश्यक केले आहे. फोन दुसऱ्याच्या हातात गेला तरी ग्राहक आणि ऑर्डर सुरक्षित राहतात.",
  "lock.turnOn": "चालू करा",
  "lock.turnedOn": "अॅप लॉक चालू आहे",
  "lock.usePinInstead": "त्याऐवजी PIN वापरा",
  "lock.useFingerprintInstead": "त्याऐवजी फिंगरप्रिंट वापरा",
  "lock.choosePin": "6 अंकी PIN निवडा",
  "lock.confirmPin": "PIN पुन्हा टाका",
  "lock.pinSixDigits": "PIN बरोबर 6 अंकी असावा.",
  "lock.pinMismatch": "दोन्ही PIN सारखे नाहीत.",
  "lock.pinSaveFailed": "PIN सेव्ह करता आला नाही. पुन्हा प्रयत्न करा.",
  "lock.biometricCancelled": "फिंगरप्रिंटची खात्री झाली नाही. पुन्हा प्रयत्न करा, किंवा PIN वापरा.",
  "lock.confirmPrompt": "अॅप लॉक चालू करण्यासाठी खात्री करा",
  "lock.unlockPrompt": "Syncit अनलॉक करा",
  "lock.usePin": "PIN वापरा",

  // ── push ──
  "push.reason": "तुमचा ऑर्डर पाठवल्यावर तुम्हाला कळवले जाईल.",
  "push.turnOn": "चालू करा",
  "push.enabled": "नोटिफिकेशन चालू आहेत",
  "push.blocked": "नोटिफिकेशन बंद आहेत. फोनच्या सेटिंग्जमध्ये Syncit साठी चालू करा.",

  // ── settings ──
  "settings.open": "सेटिंग्ज उघडा",
  "settings.language": "भाषा",
  "settings.notifications": "नोटिफिकेशन",
  "settings.role": "साइन इन: {role}",
  "settings.couldNotSave": "सेव्ह करता आले नाही. नेटवर्क तपासा आणि पुन्हा प्रयत्न करा.",
  "settings.lock.section": "अॅप लॉक",
  "settings.lock.label": "Syncit लॉक करा",
  "settings.lock.hint": "अॅप उघडल्यावर फिंगरप्रिंट विचारला जाईल.",
  "settings.lock.pinHint": "अॅप उघडल्यावर PIN विचारला जाईल.",
  "settings.lock.requiredHint": "तुमच्या कंपनीने हे आवश्यक केले आहे. ते बंद करता येत नाही.",
  "settings.lock.offTitle": "अॅप लॉक बंद करायचे?",
  "settings.lock.offBody": "हा फोन उचलणारा कोणीही Syncit उघडू शकेल.",
  "settings.lock.offConfirm": "बंद करा",
  "settings.lock.turnedOff": "अॅप लॉक बंद आहे",

  // ── wizard ──
  "wizard.leave.body": "तुम्ही तो सेव्ह करून नंतर पूर्ण करू शकता, किंवा भरलेले सर्व काढू शकता.",
  "wizard.leave.keep": "भरणे चालू ठेवा",
  "wizard.leave.saveDraft": "नंतरसाठी सेव्ह करा",
  "wizard.leave.close": "हा ऑर्डर बंद करा",

  // ── orders ──
  "orders.productPlusMore": "{name} · +{count} आणखी",
  "orders.lines.one": "{count} लाइन",
  "orders.lines.other": "{count} लाइन",

  // ── factoryOrdersDetail ──
  "factoryOrdersDetail.statusUpdated": "अपडेट झाले: {status}",

  // ── staffOrdersDetail ──
  "staffOrdersDetail.cancelled": "{orderNumber} रद्द झाला",

  // ── adminApprovals ──
  "adminApprovals.rejected": "{orderNumber} नाकारला",

  // ── activity ──
  "activity.commentPosted": "टिप्पणी पाठवली",

  // ── uploads ──
  "uploads.pagesUploaded.one": "{count} पान अपलोड झाले",
  "uploads.pagesUploaded.other": "{count} पाने अपलोड झाली",
  "uploads.someQueued": "{uploaded} अपलोड झाले · {queued} फोनमध्ये सेव्ह आहेत — नेटवर्क आल्यावर पाठवले जातील.",

  // ── timeline ──
  "timeline.minutesAfter": "मागील टप्प्यानंतर {n} मिनिटांनी",
  "timeline.hoursAfter": "मागील टप्प्यानंतर {n} तासांनी",
  "timeline.daysAfter": "मागील टप्प्यानंतर {n} दिवसांनी",

  // ── whatsapp ──
  "whatsapp.hello": "नमस्कार {name},",
  "whatsapp.helloNoName": "नमस्कार,",
  "whatsapp.pendingFor.one": "एक छोटीशी आठवण — तुमच्या खात्यावर {amount} गेल्या {count} दिवसापासून बाकी आहे.",
  "whatsapp.pendingFor.other": "एक छोटीशी आठवण — तुमच्या खात्यावर {amount} गेल्या {count} दिवसांपासून बाकी आहे.",
  "whatsapp.due": "एक छोटीशी आठवण — तुमच्या खात्यावर {amount} बाकी आहे.",
  "whatsapp.payOnline": "तुम्ही इथे ऑनलाइन पेमेंट करू शकता: {url}",
  "whatsapp.whenCanWeExpect": "कृपया पेमेंट कधीपर्यंत येईल ते कळवा.",
  "whatsapp.thanks": "धन्यवाद!",

  // ── statement ──
  "statement.share": "स्टेटमेंट पाठवा",
  "statement.shareA11y": "{name} यांना खात्याचे स्टेटमेंट पाठवा",
  "statement.title": "खात्याचे स्टेटमेंट — {name}",
  "statement.failed": "स्टेटमेंट तयार करता आले नाही. पुन्हा प्रयत्न करा.",
  "statement.linkMessage": "{name} यांचे खात्याचे स्टेटमेंट. इथे उघडा (लिंक {days} दिवस चालेल): {url}",
  "settings.dailyPlan.label": "रोजचा फॉलो-अप सारांश",
  "settings.dailyPlan.hint": "सकाळी 9 वाजता: आज किती ग्राहकांशी बोलायचे आहे आणि किती रक्कम बाकी आहे. रविवारी पाठवले जात नाही.",
  "admin.needsYou.title": "तुमचे लक्ष हवे",
  "admin.needsYou.brokenPromises.one": "{count} ग्राहकाने पेमेंटचा शब्द पाळला नाही",
  "admin.needsYou.brokenPromises.other": "{count} ग्राहकांनी पेमेंटचा शब्द पाळला नाही",
  "admin.needsYou.more": "+{count} आणखी — सेल्स व्ह्यू → आज मध्ये पाहा",
  "admin.needsYou.rowA11y": "{name}, {amount} बाकी, {date} चा शब्द होता, पेमेंट आले नाही",
  "settings.help": "मदत आणि मार्गदर्शन",
};
