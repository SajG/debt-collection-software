-- Extend OrderDocument types + add PaymentDocument for photo attachments.

ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'ORDER_PROOF';

CREATE TYPE "PaymentDocumentType" AS ENUM (
  'BANK_SCREENSHOT',
  'CHEQUE_PHOTO',
  'UPI_SCREENSHOT',
  'RECEIPT',
  'OTHER'
);

CREATE TABLE "PaymentDocument" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "type" "PaymentDocumentType" NOT NULL,
  "storagePath" TEXT NOT NULL,
  "fileName" TEXT,
  "uploadedById" UUID NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentDocument_paymentId_idx" ON "PaymentDocument"("paymentId");

ALTER TABLE "PaymentDocument"
  ADD CONSTRAINT "PaymentDocument_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE;

ALTER TABLE "PaymentDocument"
  ADD CONSTRAINT "PaymentDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "Profile"("id");

-- Realtime — same treatment as OrderDocument so the payment detail view
-- refreshes live when a proof is uploaded.
ALTER TABLE "PaymentDocument" REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "PaymentDocument";
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
