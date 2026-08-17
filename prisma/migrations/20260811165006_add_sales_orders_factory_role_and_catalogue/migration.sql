-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ORDER_PLACED', 'IN_PRODUCTION', 'READY_TO_DISPATCH', 'LR_GENERATED', 'DISPATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'LORRY_RECEIPT', 'OTHER');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FACTORY';

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "costCentre" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "costCentreName" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "partyId" TEXT,
    "newCustomerName" TEXT,
    "salespersonId" UUID NOT NULL,
    "productId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "quantityUnit" TEXT NOT NULL,
    "packingType" TEXT,
    "sizeKg" TEXT,
    "productRate" TEXT NOT NULL,
    "orderValue" DECIMAL(12,2) NOT NULL,
    "paymentTerm" TEXT,
    "transportType" TEXT,
    "expectedDeliveryDate" TIMESTAMP(3),
    "notes" TEXT,
    "currentStatus" "OrderStatus" NOT NULL DEFAULT 'ORDER_PLACED',
    "linkedInvoiceId" TEXT,
    "creditCheckPassed" BOOLEAN NOT NULL DEFAULT true,
    "creditOverrideById" UUID,
    "creditOverrideNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "notes" TEXT,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDocument" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "closingQty" DECIMAL(12,3) NOT NULL,
    "tallyRef" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_salespersonId_createdAt_idx" ON "SalesOrder"("salespersonId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesOrder_partyId_idx" ON "SalesOrder"("partyId");

-- CreateIndex
CREATE INDEX "SalesOrder_currentStatus_idx" ON "SalesOrder"("currentStatus");

-- CreateIndex
CREATE INDEX "SalesOrder_expectedDeliveryDate_idx" ON "SalesOrder"("expectedDeliveryDate");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_salesOrderId_createdAt_idx" ON "OrderStatusEvent"("salesOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderDocument_salesOrderId_idx" ON "OrderDocument"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_name_key" ON "StockItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_tallyRef_key" ON "StockItem"("tallyRef");

-- CreateIndex
CREATE INDEX "StockItem_name_idx" ON "StockItem"("name");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
