export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _prisma_migrations: {
        Row: {
          applied_steps_count: number
          checksum: string
          finished_at: string | null
          id: string
          logs: string | null
          migration_name: string
          rolled_back_at: string | null
          started_at: string
        }
        Insert: {
          applied_steps_count?: number
          checksum: string
          finished_at?: string | null
          id: string
          logs?: string | null
          migration_name: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Update: {
          applied_steps_count?: number
          checksum?: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          migration_name?: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Relationships: []
      }
      AccountingConnection: {
        Row: {
          accessToken: string | null
          accessTokenExpiresAt: string | null
          connectedAt: string
          externalOrgId: string | null
          id: string
          lastSyncAt: string | null
          provider: Database["public"]["Enums"]["AccountingProvider"]
          refreshToken: string
          updatedAt: string
        }
        Insert: {
          accessToken?: string | null
          accessTokenExpiresAt?: string | null
          connectedAt?: string
          externalOrgId?: string | null
          id: string
          lastSyncAt?: string | null
          provider: Database["public"]["Enums"]["AccountingProvider"]
          refreshToken: string
          updatedAt: string
        }
        Update: {
          accessToken?: string | null
          accessTokenExpiresAt?: string | null
          connectedAt?: string
          externalOrgId?: string | null
          id?: string
          lastSyncAt?: string | null
          provider?: Database["public"]["Enums"]["AccountingProvider"]
          refreshToken?: string
          updatedAt?: string
        }
        Relationships: []
      }
      Action: {
        Row: {
          contactedPerson: string | null
          createdAt: string
          id: string
          nextFollowUpDate: string | null
          notes: string | null
          outcome: Database["public"]["Enums"]["ActionOutcome"] | null
          partyId: string
          performedAt: string
          performedById: string
          promiseAmount: number | null
          promiseDate: string | null
          type: Database["public"]["Enums"]["ActionType"]
          updatedAt: string
        }
        Insert: {
          contactedPerson?: string | null
          createdAt?: string
          id: string
          nextFollowUpDate?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["ActionOutcome"] | null
          partyId: string
          performedAt?: string
          performedById: string
          promiseAmount?: number | null
          promiseDate?: string | null
          type: Database["public"]["Enums"]["ActionType"]
          updatedAt: string
        }
        Update: {
          contactedPerson?: string | null
          createdAt?: string
          id?: string
          nextFollowUpDate?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["ActionOutcome"] | null
          partyId?: string
          performedAt?: string
          performedById?: string
          promiseAmount?: number | null
          promiseDate?: string | null
          type?: Database["public"]["Enums"]["ActionType"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Action_partyId_fkey"
            columns: ["partyId"]
            isOneToOne: false
            referencedRelation: "Party"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Action_performedById_fkey"
            columns: ["performedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      BusinessSettings: {
        Row: {
          accountingTool: Database["public"]["Enums"]["AccountingTool"]
          authorizedSignatoryName: string | null
          autoRemindersEnabled: boolean
          bankAccountName: string | null
          bankAccountNumber: string | null
          bankBranch: string | null
          bankIfscCode: string | null
          bankName: string | null
          companyAddress: string | null
          companyCityPin: string | null
          companyGstNumber: string | null
          companyLogoPath: string | null
          companyState: string | null
          createdAt: string
          creditNoteSeq: number
          creditNoteSeqYear: number
          defaultCreditDays: number | null
          id: string
          invoicePrefix: string | null
          maxMessagesPerDay: number
          maxMessagesPerWeek: number
          onboardingDone: boolean
          orderApprovalMode: Database["public"]["Enums"]["OrderApprovalMode"]
          profileId: string
          proformaSeq: number
          proformaSeqYear: number
          quietHoursEnd: number
          quietHoursStart: number
          tallyCompanyName: string | null
          tallyEnabled: boolean
          tallyHost: string | null
          tallyPort: number | null
          timezone: string
          updatedAt: string
          whatsappApiToken: string | null
          whatsappBusinessAccountId: string | null
          whatsappPhoneNumberId: string | null
          whatsappTemplateName: string | null
        }
        Insert: {
          accountingTool?: Database["public"]["Enums"]["AccountingTool"]
          authorizedSignatoryName?: string | null
          autoRemindersEnabled?: boolean
          bankAccountName?: string | null
          bankAccountNumber?: string | null
          bankBranch?: string | null
          bankIfscCode?: string | null
          bankName?: string | null
          companyAddress?: string | null
          companyCityPin?: string | null
          companyGstNumber?: string | null
          companyLogoPath?: string | null
          companyState?: string | null
          createdAt?: string
          creditNoteSeq?: number
          creditNoteSeqYear?: number
          defaultCreditDays?: number | null
          id: string
          invoicePrefix?: string | null
          maxMessagesPerDay?: number
          maxMessagesPerWeek?: number
          onboardingDone?: boolean
          orderApprovalMode?: Database["public"]["Enums"]["OrderApprovalMode"]
          profileId: string
          proformaSeq?: number
          proformaSeqYear?: number
          quietHoursEnd?: number
          quietHoursStart?: number
          tallyCompanyName?: string | null
          tallyEnabled?: boolean
          tallyHost?: string | null
          tallyPort?: number | null
          timezone?: string
          updatedAt: string
          whatsappApiToken?: string | null
          whatsappBusinessAccountId?: string | null
          whatsappPhoneNumberId?: string | null
          whatsappTemplateName?: string | null
        }
        Update: {
          accountingTool?: Database["public"]["Enums"]["AccountingTool"]
          authorizedSignatoryName?: string | null
          autoRemindersEnabled?: boolean
          bankAccountName?: string | null
          bankAccountNumber?: string | null
          bankBranch?: string | null
          bankIfscCode?: string | null
          bankName?: string | null
          companyAddress?: string | null
          companyCityPin?: string | null
          companyGstNumber?: string | null
          companyLogoPath?: string | null
          companyState?: string | null
          createdAt?: string
          creditNoteSeq?: number
          creditNoteSeqYear?: number
          defaultCreditDays?: number | null
          id?: string
          invoicePrefix?: string | null
          maxMessagesPerDay?: number
          maxMessagesPerWeek?: number
          onboardingDone?: boolean
          orderApprovalMode?: Database["public"]["Enums"]["OrderApprovalMode"]
          profileId?: string
          proformaSeq?: number
          proformaSeqYear?: number
          quietHoursEnd?: number
          quietHoursStart?: number
          tallyCompanyName?: string | null
          tallyEnabled?: boolean
          tallyHost?: string | null
          tallyPort?: number | null
          timezone?: string
          updatedAt?: string
          whatsappApiToken?: string | null
          whatsappBusinessAccountId?: string | null
          whatsappPhoneNumberId?: string | null
          whatsappTemplateName?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "BusinessSettings_profileId_fkey"
            columns: ["profileId"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      CreditNote: {
        Row: {
          amount: number
          cancellationNote: string | null
          cancelledAt: string | null
          cancelledById: string | null
          createdAt: string
          creditNoteNumber: string
          id: string
          invoiceId: string
          issuedAt: string
          issuedById: string
          partyId: string
          reason: string
          status: Database["public"]["Enums"]["CreditNoteStatus"]
          updatedAt: string
        }
        Insert: {
          amount: number
          cancellationNote?: string | null
          cancelledAt?: string | null
          cancelledById?: string | null
          createdAt?: string
          creditNoteNumber: string
          id: string
          invoiceId: string
          issuedAt?: string
          issuedById: string
          partyId: string
          reason: string
          status?: Database["public"]["Enums"]["CreditNoteStatus"]
          updatedAt: string
        }
        Update: {
          amount?: number
          cancellationNote?: string | null
          cancelledAt?: string | null
          cancelledById?: string | null
          createdAt?: string
          creditNoteNumber?: string
          id?: string
          invoiceId?: string
          issuedAt?: string
          issuedById?: string
          partyId?: string
          reason?: string
          status?: Database["public"]["Enums"]["CreditNoteStatus"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "CreditNote_cancelledById_fkey"
            columns: ["cancelledById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "CreditNote_invoiceId_fkey"
            columns: ["invoiceId"]
            isOneToOne: false
            referencedRelation: "Invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "CreditNote_issuedById_fkey"
            columns: ["issuedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "CreditNote_partyId_fkey"
            columns: ["partyId"]
            isOneToOne: false
            referencedRelation: "Party"
            referencedColumns: ["id"]
          },
        ]
      }
      DispatchLot: {
        Row: {
          createdAt: string
          createdById: string
          dispatchedAt: string
          id: string
          lrNumber: string | null
          notes: string | null
          quantity: number
          salesOrderId: string
        }
        Insert: {
          createdAt?: string
          createdById: string
          dispatchedAt?: string
          id: string
          lrNumber?: string | null
          notes?: string | null
          quantity: number
          salesOrderId: string
        }
        Update: {
          createdAt?: string
          createdById?: string
          dispatchedAt?: string
          id?: string
          lrNumber?: string | null
          notes?: string | null
          quantity?: number
          salesOrderId?: string
        }
        Relationships: [
          {
            foreignKeyName: "DispatchLot_createdById_fkey"
            columns: ["createdById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DispatchLot_salesOrderId_fkey"
            columns: ["salesOrderId"]
            isOneToOne: false
            referencedRelation: "SalesOrder"
            referencedColumns: ["id"]
          },
        ]
      }
      Invoice: {
        Row: {
          createdAt: string
          creditedAmount: number
          dueDate: string
          id: string
          invoiceDate: string
          invoiceNumber: string
          notes: string | null
          paidAmount: number
          partyId: string
          source: Database["public"]["Enums"]["InvoiceSource"]
          status: Database["public"]["Enums"]["InvoiceStatus"]
          tallyRef: string | null
          totalAmount: number
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          creditedAmount?: number
          dueDate: string
          id: string
          invoiceDate: string
          invoiceNumber: string
          notes?: string | null
          paidAmount?: number
          partyId: string
          source?: Database["public"]["Enums"]["InvoiceSource"]
          status?: Database["public"]["Enums"]["InvoiceStatus"]
          tallyRef?: string | null
          totalAmount: number
          updatedAt: string
        }
        Update: {
          createdAt?: string
          creditedAmount?: number
          dueDate?: string
          id?: string
          invoiceDate?: string
          invoiceNumber?: string
          notes?: string | null
          paidAmount?: number
          partyId?: string
          source?: Database["public"]["Enums"]["InvoiceSource"]
          status?: Database["public"]["Enums"]["InvoiceStatus"]
          tallyRef?: string | null
          totalAmount?: number
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Invoice_partyId_fkey"
            columns: ["partyId"]
            isOneToOne: false
            referencedRelation: "Party"
            referencedColumns: ["id"]
          },
        ]
      }
      LoginAttempt: {
        Row: {
          createdAt: string
          email: string | null
          id: string
          phone: string | null
          successful: boolean
        }
        Insert: {
          createdAt?: string
          email?: string | null
          id: string
          phone?: string | null
          successful?: boolean
        }
        Update: {
          createdAt?: string
          email?: string | null
          id?: string
          phone?: string | null
          successful?: boolean
        }
        Relationships: []
      }
      Message: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["MessageChannel"]
          createdAt: string
          deliveredAt: string | null
          direction: Database["public"]["Enums"]["MessageDirection"]
          error: string | null
          gateResult: string | null
          id: string
          invoiceId: string | null
          partyId: string
          paymentLinkUrl: string | null
          providerMessageId: string | null
          sentAt: string | null
          sentById: string | null
          status: Database["public"]["Enums"]["MessageStatus"]
          templateName: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["MessageChannel"]
          createdAt?: string
          deliveredAt?: string | null
          direction: Database["public"]["Enums"]["MessageDirection"]
          error?: string | null
          gateResult?: string | null
          id: string
          invoiceId?: string | null
          partyId: string
          paymentLinkUrl?: string | null
          providerMessageId?: string | null
          sentAt?: string | null
          sentById?: string | null
          status: Database["public"]["Enums"]["MessageStatus"]
          templateName?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["MessageChannel"]
          createdAt?: string
          deliveredAt?: string | null
          direction?: Database["public"]["Enums"]["MessageDirection"]
          error?: string | null
          gateResult?: string | null
          id?: string
          invoiceId?: string | null
          partyId?: string
          paymentLinkUrl?: string | null
          providerMessageId?: string | null
          sentAt?: string | null
          sentById?: string | null
          status?: Database["public"]["Enums"]["MessageStatus"]
          templateName?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Message_invoiceId_fkey"
            columns: ["invoiceId"]
            isOneToOne: false
            referencedRelation: "Invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Message_partyId_fkey"
            columns: ["partyId"]
            isOneToOne: false
            referencedRelation: "Party"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Message_sentById_fkey"
            columns: ["sentById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      NotificationConfig: {
        Row: {
          edgeFunctionSecret: string | null
          edgeFunctionUrl: string | null
          id: string
          staleOrderHours: number
          updatedAt: string
        }
        Insert: {
          edgeFunctionSecret?: string | null
          edgeFunctionUrl?: string | null
          id: string
          staleOrderHours?: number
          updatedAt?: string
        }
        Update: {
          edgeFunctionSecret?: string | null
          edgeFunctionUrl?: string | null
          id?: string
          staleOrderHours?: number
          updatedAt?: string
        }
        Relationships: []
      }
      OrderComment: {
        Row: {
          authorId: string
          body: string
          createdAt: string
          id: string
          salesOrderId: string
        }
        Insert: {
          authorId: string
          body: string
          createdAt?: string
          id: string
          salesOrderId: string
        }
        Update: {
          authorId?: string
          body?: string
          createdAt?: string
          id?: string
          salesOrderId?: string
        }
        Relationships: [
          {
            foreignKeyName: "OrderComment_authorId_fkey"
            columns: ["authorId"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "OrderComment_salesOrderId_fkey"
            columns: ["salesOrderId"]
            isOneToOne: false
            referencedRelation: "SalesOrder"
            referencedColumns: ["id"]
          },
        ]
      }
      OrderDocument: {
        Row: {
          createdAt: string
          id: string
          salesOrderId: string
          storagePath: string
          type: Database["public"]["Enums"]["DocumentType"]
          uploadedById: string
        }
        Insert: {
          createdAt?: string
          id: string
          salesOrderId: string
          storagePath: string
          type: Database["public"]["Enums"]["DocumentType"]
          uploadedById: string
        }
        Update: {
          createdAt?: string
          id?: string
          salesOrderId?: string
          storagePath?: string
          type?: Database["public"]["Enums"]["DocumentType"]
          uploadedById?: string
        }
        Relationships: [
          {
            foreignKeyName: "OrderDocument_salesOrderId_fkey"
            columns: ["salesOrderId"]
            isOneToOne: false
            referencedRelation: "SalesOrder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "OrderDocument_uploadedById_fkey"
            columns: ["uploadedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      OrderStatusEvent: {
        Row: {
          createdAt: string
          id: string
          notes: string | null
          salesOrderId: string
          status: Database["public"]["Enums"]["OrderStatus"]
          updatedById: string
        }
        Insert: {
          createdAt?: string
          id: string
          notes?: string | null
          salesOrderId: string
          status: Database["public"]["Enums"]["OrderStatus"]
          updatedById: string
        }
        Update: {
          createdAt?: string
          id?: string
          notes?: string | null
          salesOrderId?: string
          status?: Database["public"]["Enums"]["OrderStatus"]
          updatedById?: string
        }
        Relationships: [
          {
            foreignKeyName: "OrderStatusEvent_salesOrderId_fkey"
            columns: ["salesOrderId"]
            isOneToOne: false
            referencedRelation: "SalesOrder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "OrderStatusEvent_updatedById_fkey"
            columns: ["updatedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      Party: {
        Row: {
          address: string | null
          assignedToId: string | null
          city: string | null
          code: string | null
          consentStatus: Database["public"]["Enums"]["ConsentStatus"]
          consentUpdatedAt: string | null
          contactPerson: string | null
          costCentre: string | null
          createdAt: string
          creditDays: number | null
          creditLimit: number | null
          email: string | null
          gstNumber: string | null
          id: string
          isActive: boolean
          name: string
          outreachPaused: boolean
          outreachPausedAt: string | null
          outreachPausedReason: string | null
          phone: string | null
          priority: Database["public"]["Enums"]["PartyPriority"]
          riskLevel: Database["public"]["Enums"]["RiskLevel"]
          state: string | null
          tallyBalanceAsOf: string | null
          tallyOutstanding: number | null
          tallyRef: string | null
          totalOutstanding: number
          updatedAt: string
        }
        Insert: {
          address?: string | null
          assignedToId?: string | null
          city?: string | null
          code?: string | null
          consentStatus?: Database["public"]["Enums"]["ConsentStatus"]
          consentUpdatedAt?: string | null
          contactPerson?: string | null
          costCentre?: string | null
          createdAt?: string
          creditDays?: number | null
          creditLimit?: number | null
          email?: string | null
          gstNumber?: string | null
          id: string
          isActive?: boolean
          name: string
          outreachPaused?: boolean
          outreachPausedAt?: string | null
          outreachPausedReason?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["PartyPriority"]
          riskLevel?: Database["public"]["Enums"]["RiskLevel"]
          state?: string | null
          tallyBalanceAsOf?: string | null
          tallyOutstanding?: number | null
          tallyRef?: string | null
          totalOutstanding?: number
          updatedAt: string
        }
        Update: {
          address?: string | null
          assignedToId?: string | null
          city?: string | null
          code?: string | null
          consentStatus?: Database["public"]["Enums"]["ConsentStatus"]
          consentUpdatedAt?: string | null
          contactPerson?: string | null
          costCentre?: string | null
          createdAt?: string
          creditDays?: number | null
          creditLimit?: number | null
          email?: string | null
          gstNumber?: string | null
          id?: string
          isActive?: boolean
          name?: string
          outreachPaused?: boolean
          outreachPausedAt?: string | null
          outreachPausedReason?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["PartyPriority"]
          riskLevel?: Database["public"]["Enums"]["RiskLevel"]
          state?: string | null
          tallyBalanceAsOf?: string | null
          tallyOutstanding?: number | null
          tallyRef?: string | null
          totalOutstanding?: number
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Party_assignedToId_fkey"
            columns: ["assignedToId"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      Payment: {
        Row: {
          amount: number
          createdAt: string
          id: string
          invoiceId: string | null
          method: Database["public"]["Enums"]["PaymentMethod"]
          notes: string | null
          partyId: string
          paymentDate: string
          recordedById: string
          reference: string | null
          source: Database["public"]["Enums"]["PaymentSource"]
          tallyRef: string | null
          updatedAt: string
        }
        Insert: {
          amount: number
          createdAt?: string
          id: string
          invoiceId?: string | null
          method?: Database["public"]["Enums"]["PaymentMethod"]
          notes?: string | null
          partyId: string
          paymentDate: string
          recordedById: string
          reference?: string | null
          source?: Database["public"]["Enums"]["PaymentSource"]
          tallyRef?: string | null
          updatedAt: string
        }
        Update: {
          amount?: number
          createdAt?: string
          id?: string
          invoiceId?: string | null
          method?: Database["public"]["Enums"]["PaymentMethod"]
          notes?: string | null
          partyId?: string
          paymentDate?: string
          recordedById?: string
          reference?: string | null
          source?: Database["public"]["Enums"]["PaymentSource"]
          tallyRef?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Payment_invoiceId_fkey"
            columns: ["invoiceId"]
            isOneToOne: false
            referencedRelation: "Invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Payment_partyId_fkey"
            columns: ["partyId"]
            isOneToOne: false
            referencedRelation: "Party"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Payment_recordedById_fkey"
            columns: ["recordedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      PaymentDocument: {
        Row: {
          createdAt: string
          fileName: string | null
          id: string
          notes: string | null
          paymentId: string
          storagePath: string
          type: Database["public"]["Enums"]["PaymentDocumentType"]
          uploadedById: string
        }
        Insert: {
          createdAt?: string
          fileName?: string | null
          id: string
          notes?: string | null
          paymentId: string
          storagePath: string
          type: Database["public"]["Enums"]["PaymentDocumentType"]
          uploadedById: string
        }
        Update: {
          createdAt?: string
          fileName?: string | null
          id?: string
          notes?: string | null
          paymentId?: string
          storagePath?: string
          type?: Database["public"]["Enums"]["PaymentDocumentType"]
          uploadedById?: string
        }
        Relationships: [
          {
            foreignKeyName: "PaymentDocument_paymentId_fkey"
            columns: ["paymentId"]
            isOneToOne: false
            referencedRelation: "Payment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "PaymentDocument_uploadedById_fkey"
            columns: ["uploadedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      PaymentLink: {
        Row: {
          amount: number
          createdAt: string
          id: string
          invoiceId: string | null
          partyId: string
          provider: string
          providerLinkId: string
          shortUrl: string
          status: string
          updatedAt: string
        }
        Insert: {
          amount: number
          createdAt?: string
          id: string
          invoiceId?: string | null
          partyId: string
          provider?: string
          providerLinkId: string
          shortUrl: string
          status?: string
          updatedAt: string
        }
        Update: {
          amount?: number
          createdAt?: string
          id?: string
          invoiceId?: string | null
          partyId?: string
          provider?: string
          providerLinkId?: string
          shortUrl?: string
          status?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "PaymentLink_invoiceId_fkey"
            columns: ["invoiceId"]
            isOneToOne: false
            referencedRelation: "Invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "PaymentLink_partyId_fkey"
            columns: ["partyId"]
            isOneToOne: false
            referencedRelation: "Party"
            referencedColumns: ["id"]
          },
        ]
      }
      Product: {
        Row: {
          brand: string
          createdAt: string
          floorRate: number | null
          id: string
          isActive: boolean
          name: string
          sortOrder: number
        }
        Insert: {
          brand: string
          createdAt?: string
          floorRate?: number | null
          id: string
          isActive?: boolean
          name: string
          sortOrder?: number
        }
        Update: {
          brand?: string
          createdAt?: string
          floorRate?: number | null
          id?: string
          isActive?: boolean
          name?: string
          sortOrder?: number
        }
        Relationships: []
      }
      Profile: {
        Row: {
          businessName: string
          costCentreName: string | null
          createdAt: string
          createdById: string | null
          deactivatedAt: string | null
          deactivatedById: string | null
          id: string
          isActive: boolean
          notifyComments: boolean
          notifyCreditIssues: boolean
          notifyDocuments: boolean
          notifyStaleOrders: boolean
          notifyStatusChanges: boolean
          ownerName: string
          phone: string | null
          role: Database["public"]["Enums"]["Role"]
          updatedAt: string
        }
        Insert: {
          businessName: string
          costCentreName?: string | null
          createdAt?: string
          createdById?: string | null
          deactivatedAt?: string | null
          deactivatedById?: string | null
          id: string
          isActive?: boolean
          notifyComments?: boolean
          notifyCreditIssues?: boolean
          notifyDocuments?: boolean
          notifyStaleOrders?: boolean
          notifyStatusChanges?: boolean
          ownerName: string
          phone?: string | null
          role?: Database["public"]["Enums"]["Role"]
          updatedAt: string
        }
        Update: {
          businessName?: string
          costCentreName?: string | null
          createdAt?: string
          createdById?: string | null
          deactivatedAt?: string | null
          deactivatedById?: string | null
          id?: string
          isActive?: boolean
          notifyComments?: boolean
          notifyCreditIssues?: boolean
          notifyDocuments?: boolean
          notifyStaleOrders?: boolean
          notifyStatusChanges?: boolean
          ownerName?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["Role"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Profile_createdById_fkey"
            columns: ["createdById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Profile_deactivatedById_fkey"
            columns: ["deactivatedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      ProformaInvoice: {
        Row: {
          convertedToInvoiceId: string | null
          createdAt: string
          createdById: string
          id: string
          issueDate: string
          notes: string | null
          partyId: string
          proformaNumber: string
          status: Database["public"]["Enums"]["ProformaStatus"]
          subtotal: number
          taxAmount: number
          termsConditions: string | null
          totalAmount: number
          updatedAt: string
          validUntil: string | null
        }
        Insert: {
          convertedToInvoiceId?: string | null
          createdAt?: string
          createdById: string
          id: string
          issueDate?: string
          notes?: string | null
          partyId: string
          proformaNumber: string
          status?: Database["public"]["Enums"]["ProformaStatus"]
          subtotal: number
          taxAmount?: number
          termsConditions?: string | null
          totalAmount: number
          updatedAt: string
          validUntil?: string | null
        }
        Update: {
          convertedToInvoiceId?: string | null
          createdAt?: string
          createdById?: string
          id?: string
          issueDate?: string
          notes?: string | null
          partyId?: string
          proformaNumber?: string
          status?: Database["public"]["Enums"]["ProformaStatus"]
          subtotal?: number
          taxAmount?: number
          termsConditions?: string | null
          totalAmount?: number
          updatedAt?: string
          validUntil?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ProformaInvoice_createdById_fkey"
            columns: ["createdById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ProformaInvoice_partyId_fkey"
            columns: ["partyId"]
            isOneToOne: false
            referencedRelation: "Party"
            referencedColumns: ["id"]
          },
        ]
      }
      ProformaLineItem: {
        Row: {
          description: string
          id: string
          lineTotal: number
          proformaId: string
          quantity: number
          sortOrder: number
          taxAmount: number
          taxRate: number
          unit: string | null
          unitPrice: number
        }
        Insert: {
          description: string
          id: string
          lineTotal: number
          proformaId: string
          quantity: number
          sortOrder?: number
          taxAmount: number
          taxRate?: number
          unit?: string | null
          unitPrice: number
        }
        Update: {
          description?: string
          id?: string
          lineTotal?: number
          proformaId?: string
          quantity?: number
          sortOrder?: number
          taxAmount?: number
          taxRate?: number
          unit?: string | null
          unitPrice?: number
        }
        Relationships: [
          {
            foreignKeyName: "ProformaLineItem_proformaId_fkey"
            columns: ["proformaId"]
            isOneToOne: false
            referencedRelation: "ProformaInvoice"
            referencedColumns: ["id"]
          },
        ]
      }
      PushToken: {
        Row: {
          createdAt: string
          id: string
          lastSeenAt: string
          platform: string
          profileId: string
          token: string
        }
        Insert: {
          createdAt?: string
          id: string
          lastSeenAt?: string
          platform: string
          profileId: string
          token: string
        }
        Update: {
          createdAt?: string
          id?: string
          lastSeenAt?: string
          platform?: string
          profileId?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "PushToken_profileId_fkey"
            columns: ["profileId"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      SalesOrder: {
        Row: {
          approvedAt: string | null
          approvedById: string | null
          brand: string
          createdAt: string
          creditCheckPassed: boolean
          creditOverrideById: string | null
          creditOverrideNote: string | null
          currentStatus: Database["public"]["Enums"]["OrderStatus"]
          deliveredAt: string | null
          dispatchLocation: string | null
          expectedDeliveryDate: string | null
          expectedProductionDate: string | null
          holdReason: string | null
          holdReasonCategory:
            | Database["public"]["Enums"]["HoldReasonCategory"]
            | null
          id: string
          linkedInvoiceId: string | null
          needsRateApproval: boolean
          newCustomerName: string | null
          notes: string | null
          orderNumber: string
          orderValue: number
          packingType: string | null
          partyId: string | null
          paymentTerm: string | null
          productId: string
          productRate: string
          quantity: number
          quantityUnit: string
          rateApprovalNote: string | null
          rateApprovedAt: string | null
          rateApprovedById: string | null
          rejectedAt: string | null
          rejectedById: string | null
          rejectionReason: string | null
          salespersonId: string
          sizeKg: string | null
          statusBeforeHold: Database["public"]["Enums"]["OrderStatus"] | null
          tokenType: string | null
          transportType: string | null
          updatedAt: string
        }
        Insert: {
          approvedAt?: string | null
          approvedById?: string | null
          brand: string
          createdAt?: string
          creditCheckPassed?: boolean
          creditOverrideById?: string | null
          creditOverrideNote?: string | null
          currentStatus?: Database["public"]["Enums"]["OrderStatus"]
          deliveredAt?: string | null
          dispatchLocation?: string | null
          expectedDeliveryDate?: string | null
          expectedProductionDate?: string | null
          holdReason?: string | null
          holdReasonCategory?:
            | Database["public"]["Enums"]["HoldReasonCategory"]
            | null
          id: string
          linkedInvoiceId?: string | null
          needsRateApproval?: boolean
          newCustomerName?: string | null
          notes?: string | null
          orderNumber: string
          orderValue: number
          packingType?: string | null
          partyId?: string | null
          paymentTerm?: string | null
          productId: string
          productRate: string
          quantity: number
          quantityUnit: string
          rateApprovalNote?: string | null
          rateApprovedAt?: string | null
          rateApprovedById?: string | null
          rejectedAt?: string | null
          rejectedById?: string | null
          rejectionReason?: string | null
          salespersonId: string
          sizeKg?: string | null
          statusBeforeHold?: Database["public"]["Enums"]["OrderStatus"] | null
          tokenType?: string | null
          transportType?: string | null
          updatedAt: string
        }
        Update: {
          approvedAt?: string | null
          approvedById?: string | null
          brand?: string
          createdAt?: string
          creditCheckPassed?: boolean
          creditOverrideById?: string | null
          creditOverrideNote?: string | null
          currentStatus?: Database["public"]["Enums"]["OrderStatus"]
          deliveredAt?: string | null
          dispatchLocation?: string | null
          expectedDeliveryDate?: string | null
          expectedProductionDate?: string | null
          holdReason?: string | null
          holdReasonCategory?:
            | Database["public"]["Enums"]["HoldReasonCategory"]
            | null
          id?: string
          linkedInvoiceId?: string | null
          needsRateApproval?: boolean
          newCustomerName?: string | null
          notes?: string | null
          orderNumber?: string
          orderValue?: number
          packingType?: string | null
          partyId?: string | null
          paymentTerm?: string | null
          productId?: string
          productRate?: string
          quantity?: number
          quantityUnit?: string
          rateApprovalNote?: string | null
          rateApprovedAt?: string | null
          rateApprovedById?: string | null
          rejectedAt?: string | null
          rejectedById?: string | null
          rejectionReason?: string | null
          salespersonId?: string
          sizeKg?: string | null
          statusBeforeHold?: Database["public"]["Enums"]["OrderStatus"] | null
          tokenType?: string | null
          transportType?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "SalesOrder_approvedById_fkey"
            columns: ["approvedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalesOrder_partyId_fkey"
            columns: ["partyId"]
            isOneToOne: false
            referencedRelation: "Party"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalesOrder_productId_fkey"
            columns: ["productId"]
            isOneToOne: false
            referencedRelation: "Product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalesOrder_rateApprovedById_fkey"
            columns: ["rateApprovedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalesOrder_rejectedById_fkey"
            columns: ["rejectedById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalesOrder_salespersonId_fkey"
            columns: ["salespersonId"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      StaleOrderNotice: {
        Row: {
          notifiedAt: string
          salesOrderId: string
        }
        Insert: {
          notifiedAt?: string
          salesOrderId: string
        }
        Update: {
          notifiedAt?: string
          salesOrderId?: string
        }
        Relationships: [
          {
            foreignKeyName: "StaleOrderNotice_salesOrderId_fkey"
            columns: ["salesOrderId"]
            isOneToOne: true
            referencedRelation: "SalesOrder"
            referencedColumns: ["id"]
          },
        ]
      }
      StockItem: {
        Row: {
          category: string | null
          closingQty: number
          createdAt: string
          id: string
          lastSyncedAt: string | null
          name: string
          tallyRef: string | null
          unit: string | null
          updatedAt: string
        }
        Insert: {
          category?: string | null
          closingQty: number
          createdAt?: string
          id: string
          lastSyncedAt?: string | null
          name: string
          tallyRef?: string | null
          unit?: string | null
          updatedAt: string
        }
        Update: {
          category?: string | null
          closingQty?: number
          createdAt?: string
          id?: string
          lastSyncedAt?: string | null
          name?: string
          tallyRef?: string | null
          unit?: string | null
          updatedAt?: string
        }
        Relationships: []
      }
      SyncLog: {
        Row: {
          completedAt: string | null
          createdAt: string
          details: Json | null
          errorMessage: string | null
          id: string
          recordsFailed: number | null
          recordsProcessed: number | null
          recordsTotal: number | null
          startedAt: string
          status: Database["public"]["Enums"]["SyncStatus"]
          syncType: Database["public"]["Enums"]["SyncType"]
          triggeredById: string | null
        }
        Insert: {
          completedAt?: string | null
          createdAt?: string
          details?: Json | null
          errorMessage?: string | null
          id: string
          recordsFailed?: number | null
          recordsProcessed?: number | null
          recordsTotal?: number | null
          startedAt?: string
          status?: Database["public"]["Enums"]["SyncStatus"]
          syncType: Database["public"]["Enums"]["SyncType"]
          triggeredById?: string | null
        }
        Update: {
          completedAt?: string | null
          createdAt?: string
          details?: Json | null
          errorMessage?: string | null
          id?: string
          recordsFailed?: number | null
          recordsProcessed?: number | null
          recordsTotal?: number | null
          startedAt?: string
          status?: Database["public"]["Enums"]["SyncStatus"]
          syncType?: Database["public"]["Enums"]["SyncType"]
          triggeredById?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "SyncLog_triggeredById_fkey"
            columns: ["triggeredById"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
      UserAuditLog: {
        Row: {
          action: Database["public"]["Enums"]["UserAuditAction"]
          actorId: string | null
          createdAt: string
          detail: string | null
          id: string
          targetProfileId: string
        }
        Insert: {
          action: Database["public"]["Enums"]["UserAuditAction"]
          actorId?: string | null
          createdAt?: string
          detail?: string | null
          id: string
          targetProfileId: string
        }
        Update: {
          action?: Database["public"]["Enums"]["UserAuditAction"]
          actorId?: string | null
          createdAt?: string
          detail?: string | null
          id?: string
          targetProfileId?: string
        }
        Relationships: [
          {
            foreignKeyName: "UserAuditLog_actorId_fkey"
            columns: ["actorId"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "UserAuditLog_targetProfileId_fkey"
            columns: ["targetProfileId"]
            isOneToOne: false
            referencedRelation: "Profile"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _dispatch_notification: { Args: { payload: Json }; Returns: undefined }
      _recompute_dispatch_status: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      _sweep_stale_orders: { Args: never; Returns: undefined }
      advance_order_status: {
        // p_note widened to allow null — DEFAULT NULL server-side.
        Args: { p_note?: string | null; p_order_id: string; p_target: string }
        Returns: {
          currentStatus: string
          id: string
        }[]
      }
      approve_order: {
        // p_note widened to allow null — DEFAULT NULL server-side.
        Args: { p_note?: string | null; p_order_id: string }
        Returns: {
          currentStatus: string
          id: string
        }[]
      }
      check_document_upload_rate_limit: {
        Args: { p_profile_id: string }
        Returns: {
          limited: boolean
          retry_after_minutes: number
        }[]
      }
      check_order_create_rate_limit: {
        Args: { p_profile_id: string }
        Returns: {
          limited: boolean
          retry_after_minutes: number
        }[]
      }
      check_phone_otp_rate_limit: {
        Args: { p_phone: string }
        Returns: {
          limited: boolean
          retry_after_minutes: number
        }[]
      }
      create_sales_order: {
        // Nullability manually widened — the Postgres function
        // signature uses DEFAULT NULL on most params but the
        // supabase gen types generator infers all as non-null. See
        // scripts/patch-database-types.mjs (runs after types:generate).
        Args: {
          p_brand: string | null
          p_credit_override_note?: string | null
          p_dispatch_location?: string | null
          p_expected_delivery_date: string | null
          p_new_customer_name?: string | null
          p_new_product_name?: string | null
          p_notes: string | null
          p_packing_type: string
          p_party_id: string | null
          p_payment_term: string
          p_product_id: string | null
          p_product_rate: string
          p_quantity: number
          p_quantity_unit: string
          p_size_kg: string
          p_token_type: string | null
          p_transport_type: string
        }
        Returns: {
          id: string
          orderNumber: string
        }[]
      }
      current_user_role: { Args: never; Returns: string }
      is_notification_config_ready: { Args: never; Returns: boolean }
      is_provisioned_phone: { Args: { p_phone: string }; Returns: boolean }
      synworks_recompute_party_outstanding: {
        Args: { p_party_id: string }
        Returns: undefined
      }
      record_phone_otp_attempt: {
        Args: { p_phone: string; p_successful: boolean }
        Returns: undefined
      }
      reject_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: {
          currentStatus: string
          id: string
        }[]
      }
    }
    Enums: {
      AccountingProvider: "ZOHO_BOOKS" | "QUICKBOOKS" | "XERO"
      AccountingTool: "TALLY" | "ZOHO" | "SAP" | "EXCEL" | "OTHER"
      ActionOutcome:
        | "PROMISE_TO_PAY"
        | "NOT_REACHABLE"
        | "CALL_BACK_LATER"
        | "DISPUTED"
        | "PAYMENT_RECEIVED"
        | "NO_ANSWER"
        | "WRONG_NUMBER"
        | "OTHER"
      ActionType: "CALL" | "WHATSAPP" | "EMAIL" | "VISIT" | "NOTE" | "OTHER"
      ConsentStatus: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT"
      CreditNoteStatus: "ISSUED" | "CANCELLED"
      DocumentType: "INVOICE" | "LORRY_RECEIPT" | "OTHER" | "ORDER_PROOF"
      HoldReasonCategory:
        | "RAW_MATERIAL_SHORTAGE"
        | "AWAITING_CUSTOMER_CONFIRMATION"
        | "PAYMENT_HOLD"
        | "OTHER"
      InvoiceSource: "TALLY" | "MANUAL"
      InvoiceStatus: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED"
      MessageChannel: "WHATSAPP" | "SMS" | "EMAIL"
      MessageDirection: "OUTBOUND" | "INBOUND"
      MessageStatus:
        | "BLOCKED"
        | "QUEUED"
        | "SENT"
        | "DELIVERED"
        | "READ"
        | "FAILED"
        | "RECEIVED"
      OrderApprovalMode: "NONE" | "EXCEPTIONS_ONLY" | "ALL"
      OrderStatus:
        | "ORDER_PLACED"
        | "IN_PRODUCTION"
        | "READY_TO_DISPATCH"
        | "LR_GENERATED"
        | "DISPATCHED"
        | "CANCELLED"
        | "ON_HOLD"
        | "PARTIALLY_DISPATCHED"
        | "DELIVERED"
        | "PENDING_APPROVAL"
        | "REJECTED"
      PartyPriority: "HIGH" | "MEDIUM" | "LOW"
      PaymentDocumentType:
        | "BANK_SCREENSHOT"
        | "CHEQUE_PHOTO"
        | "UPI_SCREENSHOT"
        | "RECEIPT"
        | "OTHER"
      PaymentMethod: "CASH" | "CHEQUE" | "NEFT" | "RTGS" | "UPI" | "OTHER"
      PaymentSource: "TALLY" | "MANUAL"
      ProformaStatus:
        | "DRAFT"
        | "SENT"
        | "CONFIRMED"
        | "CONVERTED"
        | "EXPIRED"
        | "CANCELLED"
      RiskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      Role: "ADMIN" | "STAFF" | "FACTORY"
      SyncStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "PARTIAL"
      SyncType:
        | "IMPORT_PARTIES"
        | "IMPORT_INVOICES"
        | "IMPORT_PAYMENTS"
        | "FULL_IMPORT"
        | "EXPORT_PAYMENTS"
        | "IMPORT_STOCK_ITEMS"
        | "IMPORT_RECEIPTS"
      UserAuditAction:
        | "CREATED"
        | "ACTIVATED"
        | "DEACTIVATED"
        | "ROLE_CHANGED"
        | "PHONE_CHANGED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      AccountingProvider: ["ZOHO_BOOKS", "QUICKBOOKS", "XERO"],
      AccountingTool: ["TALLY", "ZOHO", "SAP", "EXCEL", "OTHER"],
      ActionOutcome: [
        "PROMISE_TO_PAY",
        "NOT_REACHABLE",
        "CALL_BACK_LATER",
        "DISPUTED",
        "PAYMENT_RECEIVED",
        "NO_ANSWER",
        "WRONG_NUMBER",
        "OTHER",
      ],
      ActionType: ["CALL", "WHATSAPP", "EMAIL", "VISIT", "NOTE", "OTHER"],
      ConsentStatus: ["UNKNOWN", "OPTED_IN", "OPTED_OUT"],
      CreditNoteStatus: ["ISSUED", "CANCELLED"],
      DocumentType: ["INVOICE", "LORRY_RECEIPT", "OTHER", "ORDER_PROOF"],
      HoldReasonCategory: [
        "RAW_MATERIAL_SHORTAGE",
        "AWAITING_CUSTOMER_CONFIRMATION",
        "PAYMENT_HOLD",
        "OTHER",
      ],
      InvoiceSource: ["TALLY", "MANUAL"],
      InvoiceStatus: ["UNPAID", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"],
      MessageChannel: ["WHATSAPP", "SMS", "EMAIL"],
      MessageDirection: ["OUTBOUND", "INBOUND"],
      MessageStatus: [
        "BLOCKED",
        "QUEUED",
        "SENT",
        "DELIVERED",
        "READ",
        "FAILED",
        "RECEIVED",
      ],
      OrderApprovalMode: ["NONE", "EXCEPTIONS_ONLY", "ALL"],
      OrderStatus: [
        "ORDER_PLACED",
        "IN_PRODUCTION",
        "READY_TO_DISPATCH",
        "LR_GENERATED",
        "DISPATCHED",
        "CANCELLED",
        "ON_HOLD",
        "PARTIALLY_DISPATCHED",
        "DELIVERED",
        "PENDING_APPROVAL",
        "REJECTED",
      ],
      PartyPriority: ["HIGH", "MEDIUM", "LOW"],
      PaymentDocumentType: [
        "BANK_SCREENSHOT",
        "CHEQUE_PHOTO",
        "UPI_SCREENSHOT",
        "RECEIPT",
        "OTHER",
      ],
      PaymentMethod: ["CASH", "CHEQUE", "NEFT", "RTGS", "UPI", "OTHER"],
      PaymentSource: ["TALLY", "MANUAL"],
      ProformaStatus: [
        "DRAFT",
        "SENT",
        "CONFIRMED",
        "CONVERTED",
        "EXPIRED",
        "CANCELLED",
      ],
      RiskLevel: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      Role: ["ADMIN", "STAFF", "FACTORY"],
      SyncStatus: ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "PARTIAL"],
      SyncType: [
        "IMPORT_PARTIES",
        "IMPORT_INVOICES",
        "IMPORT_PAYMENTS",
        "FULL_IMPORT",
        "EXPORT_PAYMENTS",
        "IMPORT_STOCK_ITEMS",
        "IMPORT_RECEIPTS",
      ],
      UserAuditAction: [
        "CREATED",
        "ACTIVATED",
        "DEACTIVATED",
        "ROLE_CHANGED",
        "PHONE_CHANGED",
      ],
    },
  },
} as const

// Legacy hand-authored aliases — keep existing imports working after
// switching to auto-generated types. Prefer Database["public"]["Enums"]["X"]
// in new code.
export type OrderStatus = Database["public"]["Enums"]["OrderStatus"]
export type Role = Database["public"]["Enums"]["Role"]
// PaymentTerm / QuantityUnit / TransportType are stored as plain
// strings in Postgres (see prisma/schema.prisma) — no DB enum exists,
// so the generator can't emit them. Keep hand-authored unions here
// so the app code stays type-safe.
export type PaymentTerm =
  | "ADVANCE"
  | "CREDIT"
  | "PDC"
  | "IMMEDIATE"
  | "AGAINST_DISPATCH"
  | "OTHER"
export type QuantityUnit = "PCS" | "KG" | "NOS"
export type TransportType = "PAID" | "TO_PAY" | "GODOWN" | "DOOR" | "OTHER"
export type InvoiceStatus = Database["public"]["Enums"]["InvoiceStatus"]
