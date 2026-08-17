// Hand-authored Supabase-compatible type map — matches the Prisma schema
// (prisma/schema.prisma) as of the RLS chunk. Regenerate anytime with:
//   npm run types:generate
// which shells out to `supabase gen types typescript` and overwrites
// this file. Keep the two in sync when the Prisma schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type Role = "ADMIN" | "STAFF" | "FACTORY";
export type OrderStatus =
  | "ORDER_PLACED"
  | "IN_PRODUCTION"
  | "READY_TO_DISPATCH"
  | "LR_GENERATED"
  | "DISPATCHED"
  | "CANCELLED";
export type QuantityUnit = "PCS" | "KG" | "NOS";
export type PaymentTerm =
  | "ADVANCE"
  | "CREDIT"
  | "PDC"
  | "IMMEDIATE"
  | "AGAINST_DISPATCH"
  | "OTHER";
export type TransportType = "PAID" | "TO_PAY" | "GODOWN" | "DOOR" | "OTHER";
export type InvoiceStatus =
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export interface Database {
  public: {
    Tables: {
      Profile: {
        Row: {
          id: string;
          businessName: string;
          ownerName: string;
          phone: string | null;
          role: Role;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id: string;
          businessName: string;
          ownerName: string;
          phone?: string | null;
          role?: Role;
          createdAt?: string;
          updatedAt?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Profile"]["Row"]>;
        Relationships: [];
      };
      Party: {
        Row: {
          id: string;
          name: string;
          code: string | null;
          gstNumber: string | null;
          phone: string | null;
          email: string | null;
          contactPerson: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          assignedToId: string | null;
          isActive: boolean;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          name: string;
          isActive?: boolean;
          assignedToId?: string | null;
          [k: string]: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["Party"]["Row"]>;
        Relationships: [];
      };
      Product: {
        Row: {
          id: string;
          name: string;
          brand: string | null;
          isActive: boolean;
          sortOrder: number;
          createdAt: string;
        };
        Insert: {
          id?: string;
          name: string;
          brand?: string | null;
          isActive?: boolean;
          sortOrder?: number;
          createdAt?: string;
        };
        Update: Partial<Database["public"]["Tables"]["Product"]["Row"]>;
        Relationships: [];
      };
      SalesOrder: {
        Row: {
          id: string;
          orderNumber: string;
          partyId: string;
          salespersonId: string;
          productId: string;
          brand: string | null;
          quantity: string;
          quantityUnit: QuantityUnit;
          packingType: string;
          sizeKg: string;
          productRate: string;
          paymentTerm: PaymentTerm;
          transportType: TransportType;
          expectedDeliveryDate: string | null;
          tokenType: string | null;
          notes: string | null;
          currentStatus: OrderStatus;
          linkedInvoiceId: string | null;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          orderNumber: string;
          partyId: string;
          salespersonId: string;
          productId: string;
          brand?: string | null;
          quantity: string;
          quantityUnit: QuantityUnit;
          packingType: string;
          sizeKg: string;
          productRate: string;
          paymentTerm: PaymentTerm;
          transportType: TransportType;
          expectedDeliveryDate?: string | null;
          tokenType?: string | null;
          notes?: string | null;
          currentStatus?: OrderStatus;
          linkedInvoiceId?: string | null;
          createdAt?: string;
          updatedAt?: string;
        };
        Update: Partial<Database["public"]["Tables"]["SalesOrder"]["Row"]>;
        Relationships: [];
      };
      OrderStatusEvent: {
        Row: {
          id: string;
          salesOrderId: string;
          status: OrderStatus;
          notes: string | null;
          updatedById: string;
          createdAt: string;
        };
        Insert: {
          id?: string;
          salesOrderId: string;
          status: OrderStatus;
          notes?: string | null;
          updatedById: string;
          createdAt?: string;
        };
        Update: Partial<Database["public"]["Tables"]["OrderStatusEvent"]["Row"]>;
        Relationships: [];
      };
      Invoice: {
        Row: {
          id: string;
          invoiceNumber: string;
          partyId: string;
          invoiceDate: string;
          dueDate: string;
          totalAmount: string;
          paidAmount: string;
          creditedAmount: string;
          status: InvoiceStatus;
          notes: string | null;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          invoiceNumber: string;
          partyId: string;
          invoiceDate: string;
          dueDate: string;
          totalAmount: string;
          paidAmount?: string;
          creditedAmount?: string;
          status?: InvoiceStatus;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["Invoice"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_user_role: {
        Args: Record<string, never>;
        Returns: string;
      };
      create_sales_order: {
        Args: {
          p_party_id: string | null;
          p_product_id: string;
          p_brand: string | null;
          p_quantity: number;
          p_quantity_unit: QuantityUnit;
          p_packing_type: string;
          p_size_kg: string;
          p_product_rate: string;
          p_payment_term: PaymentTerm;
          p_transport_type: TransportType;
          p_expected_delivery_date: string | null;
          p_token_type: string | null;
          p_notes: string | null;
          p_new_customer_name?: string | null;
          p_dispatch_location?: string | null;
        };
        Returns: { id: string; orderNumber: string }[];
      };
    };
    Enums: {
      Role: Role;
      OrderStatus: OrderStatus;
      QuantityUnit: QuantityUnit;
      PaymentTerm: PaymentTerm;
      TransportType: TransportType;
      InvoiceStatus: InvoiceStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
