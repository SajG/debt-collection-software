import type { PaymentDocumentType } from "@prisma/client";

export const PAYMENT_DOC_TYPE_LABELS: Record<PaymentDocumentType, string> = {
  BANK_SCREENSHOT: "Bank screenshot",
  CHEQUE_PHOTO: "Cheque photo",
  UPI_SCREENSHOT: "UPI screenshot",
  RECEIPT: "Signed receipt",
  OTHER: "Other",
};
