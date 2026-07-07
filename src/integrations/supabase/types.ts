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
      brand_production_settings: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          min_margin_pct: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          min_margin_pct?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          min_margin_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          invoice_footer_note: string | null
          invoice_prefix: string
          is_active: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          primary_color: string
          slug: string
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_footer_note?: string | null
          invoice_prefix: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          primary_color?: string
          slug: string
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_footer_note?: string | null
          invoice_prefix?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_color?: string
          slug?: string
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      commission_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          commission_request_id: string
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          reference: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          commission_request_id: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          reference?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          commission_request_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_audit_log_commission_request_id_fkey"
            columns: ["commission_request_id"]
            isOneToOne: false
            referencedRelation: "commission_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          commission_amount: number
          created_at: string
          id: string
          order_id: string
          paid_at: string | null
          paid_by: string | null
          paid_reference: string | null
          period_month: string
          rejection_reason: string | null
          sale_amount: number
          seller_id: string
          seller_label: string | null
          seller_monthly_sales: number
          status: string
          tier_percentage: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          commission_amount: number
          created_at?: string
          id?: string
          order_id: string
          paid_at?: string | null
          paid_by?: string | null
          paid_reference?: string | null
          period_month: string
          rejection_reason?: string | null
          sale_amount: number
          seller_id: string
          seller_label?: string | null
          seller_monthly_sales: number
          status?: string
          tier_percentage: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          commission_amount?: number
          created_at?: string
          id?: string
          order_id?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_reference?: string | null
          period_month?: string
          rejection_reason?: string | null
          sale_amount?: number
          seller_id?: string
          seller_label?: string | null
          seller_monthly_sales?: number
          status?: string
          tier_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_requests_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "commission_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_tiers: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          is_active: boolean
          max_amount: number | null
          min_amount: number
          percentage: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount: number
          percentage: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number
          percentage?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_tiers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          brand_id: string
          city: string | null
          company: string | null
          contact_type: string
          created_at: string
          created_by: string | null
          department: string | null
          display_name: string
          doc_number: string | null
          doc_type: string | null
          email: string | null
          id: string
          is_active: boolean
          notes: string | null
          person_type: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id: string
          city?: string | null
          company?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          display_name: string
          doc_number?: string | null
          doc_type?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          person_type?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string
          city?: string | null
          company?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          display_name?: string
          doc_number?: string | null
          doc_type?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          person_type?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          active: boolean
          availability: Database["public"]["Enums"]["driver_availability"]
          created_at: string
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
          vehicle_label: string | null
          vehicle_type: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        Insert: {
          active?: boolean
          availability?: Database["public"]["Enums"]["driver_availability"]
          created_at?: string
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          vehicle_label?: string | null
          vehicle_type?: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        Update: {
          active?: boolean
          availability?: Database["public"]["Enums"]["driver_availability"]
          created_at?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          vehicle_label?: string | null
          vehicle_type?: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        Relationships: []
      }
      invoice_electronic_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          external_number: string | null
          id: string
          invoice_id: string
          note: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          external_number?: string | null
          id?: string
          invoice_id: string
          note?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          external_number?: string | null
          id?: string
          invoice_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_electronic_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_versions: {
        Row: {
          advance_snapshot: number
          balance_snapshot: number
          brand_id: string
          brand_snapshot: Json | null
          change_summary: string | null
          created_at: string
          customer_snapshot: Json | null
          discount_snapshot: number
          id: string
          invoice_id: string
          invoice_number: string
          issued_by: string | null
          issued_by_email: string | null
          items_snapshot: Json | null
          order_id: string
          pdf_path: string
          subtotal_snapshot: number
          tax_snapshot: number
          total_snapshot: number
          version_number: number
        }
        Insert: {
          advance_snapshot?: number
          balance_snapshot?: number
          brand_id: string
          brand_snapshot?: Json | null
          change_summary?: string | null
          created_at?: string
          customer_snapshot?: Json | null
          discount_snapshot?: number
          id?: string
          invoice_id: string
          invoice_number: string
          issued_by?: string | null
          issued_by_email?: string | null
          items_snapshot?: Json | null
          order_id: string
          pdf_path: string
          subtotal_snapshot?: number
          tax_snapshot?: number
          total_snapshot?: number
          version_number: number
        }
        Update: {
          advance_snapshot?: number
          balance_snapshot?: number
          brand_id?: string
          brand_snapshot?: Json | null
          change_summary?: string | null
          created_at?: string
          customer_snapshot?: Json | null
          discount_snapshot?: number
          id?: string
          invoice_id?: string
          invoice_number?: string
          issued_by?: string | null
          issued_by_email?: string | null
          items_snapshot?: Json | null
          order_id?: string
          pdf_path?: string
          subtotal_snapshot?: number
          tax_snapshot?: number
          total_snapshot?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_versions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "invoice_versions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          advance_snapshot: number
          balance_snapshot: number
          brand_id: string
          brand_snapshot: Json
          created_at: string
          customer_snapshot: Json
          discount_snapshot: number
          electronic_invoice_issued_at: string | null
          electronic_invoice_issued_by: string | null
          electronic_invoice_note: string | null
          electronic_invoice_number: string | null
          electronic_invoice_status: string
          id: string
          invoice_number: string
          issued_at: string
          issued_by: string | null
          issued_by_email: string | null
          items_snapshot: Json
          order_id: string
          pdf_path: string | null
          send_count: number
          sent_at: string | null
          sent_to: string | null
          subtotal_snapshot: number
          tax_snapshot: number
          terms_snapshot_html: string | null
          terms_version_id: string | null
          total_snapshot: number
        }
        Insert: {
          advance_snapshot?: number
          balance_snapshot?: number
          brand_id: string
          brand_snapshot?: Json
          created_at?: string
          customer_snapshot?: Json
          discount_snapshot?: number
          electronic_invoice_issued_at?: string | null
          electronic_invoice_issued_by?: string | null
          electronic_invoice_note?: string | null
          electronic_invoice_number?: string | null
          electronic_invoice_status?: string
          id?: string
          invoice_number: string
          issued_at?: string
          issued_by?: string | null
          issued_by_email?: string | null
          items_snapshot?: Json
          order_id: string
          pdf_path?: string | null
          send_count?: number
          sent_at?: string | null
          sent_to?: string | null
          subtotal_snapshot?: number
          tax_snapshot?: number
          terms_snapshot_html?: string | null
          terms_version_id?: string | null
          total_snapshot?: number
        }
        Update: {
          advance_snapshot?: number
          balance_snapshot?: number
          brand_id?: string
          brand_snapshot?: Json
          created_at?: string
          customer_snapshot?: Json
          discount_snapshot?: number
          electronic_invoice_issued_at?: string | null
          electronic_invoice_issued_by?: string | null
          electronic_invoice_note?: string | null
          electronic_invoice_number?: string | null
          electronic_invoice_status?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          issued_by?: string | null
          issued_by_email?: string | null
          items_snapshot?: Json
          order_id?: string
          pdf_path?: string | null
          send_count?: number
          sent_at?: string | null
          sent_to?: string | null
          subtotal_snapshot?: number
          tax_snapshot?: number
          terms_snapshot_html?: string | null
          terms_version_id?: string | null
          total_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_terms_version_id_fkey"
            columns: ["terms_version_id"]
            isOneToOne: false
            referencedRelation: "terms_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_availability: {
        Row: {
          available: boolean
          created_at: string
          date: string
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          available?: boolean
          created_at?: string
          date: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          available?: boolean
          created_at?: string
          date?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      order_approval_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          advance_amount: number | null
          advance_percentage: number | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          total_amount: number | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          advance_amount?: number | null
          advance_percentage?: number | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          total_amount?: number | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          advance_amount?: number | null
          advance_percentage?: number | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_approval_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_approval_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_audit_log: {
        Row: {
          action: string
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          entity: string
          entity_id: string | null
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          order_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          order_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          order_id?: string
        }
        Relationships: []
      }
      order_brand_change_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          id: string
          new_brand_id: string
          new_invoice_number: string | null
          new_order_number: string | null
          old_brand_id: string
          old_invoice_number: string | null
          old_order_number: string | null
          order_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_brand_id: string
          new_invoice_number?: string | null
          new_order_number?: string | null
          old_brand_id: string
          old_invoice_number?: string | null
          old_order_number?: string | null
          order_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_brand_id?: string
          new_invoice_number?: string | null
          new_order_number?: string | null
          old_brand_id?: string
          old_invoice_number?: string | null
          old_order_number?: string | null
          order_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_brand_change_log_new_brand_id_fkey"
            columns: ["new_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_brand_change_log_old_brand_id_fkey"
            columns: ["old_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_brand_change_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_brand_change_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_collection_followups: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          next_contact_date: string | null
          note: string | null
          order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          next_contact_date?: string | null
          note?: string | null
          order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          next_contact_date?: string | null
          note?: string | null
          order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_deletions: {
        Row: {
          brand_id: string
          customer_name: string | null
          deleted_at: string
          deleted_by: string | null
          deleted_by_email: string | null
          id: string
          invoice_number: string | null
          items_snapshot: Json
          order_id: string
          order_number: string | null
          order_snapshot: Json
          reason: string
          total: number
        }
        Insert: {
          brand_id: string
          customer_name?: string | null
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          id?: string
          invoice_number?: string | null
          items_snapshot?: Json
          order_id: string
          order_number?: string | null
          order_snapshot: Json
          reason: string
          total?: number
        }
        Update: {
          brand_id?: string
          customer_name?: string | null
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          id?: string
          invoice_number?: string | null
          items_snapshot?: Json
          order_id?: string
          order_number?: string | null
          order_snapshot?: Json
          reason?: string
          total?: number
        }
        Relationships: []
      }
      order_delivery_deferrals: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          new_date: string
          order_id: string
          previous_date: string | null
          reason: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          new_date: string
          order_id: string
          previous_date?: string | null
          reason: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          new_date?: string
          order_id?: string
          previous_date?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_delivery_deferrals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_delivery_deferrals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_partial_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          order_item_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          order_item_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          order_item_id?: string
        }
        Relationships: []
      }
      order_item_supplier_payments: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          order_id: string
          order_item_id: string
          paid_at: string
          payment_type: string
          production_order_id: string | null
          receipt_mime: string | null
          receipt_path: string | null
          receipt_size_bytes: number | null
          supplier_id: string
          supplier_name_snapshot: string
          updated_at: string
        }
        Insert: {
          amount: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          order_id: string
          order_item_id: string
          paid_at: string
          payment_type?: string
          production_order_id?: string | null
          receipt_mime?: string | null
          receipt_path?: string | null
          receipt_size_bytes?: number | null
          supplier_id: string
          supplier_name_snapshot: string
          updated_at?: string
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          order_id?: string
          order_item_id?: string
          paid_at?: string
          payment_type?: string
          production_order_id?: string | null
          receipt_mime?: string | null
          receipt_path?: string | null
          receipt_size_bytes?: number | null
          supplier_id?: string
          supplier_name_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_supplier_payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_supplier_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_item_supplier_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_supplier_payments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_supplier_payments_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cost_notes: string | null
          created_at: string
          description: string
          gifted_at: string | null
          gifted_by: string | null
          gifted_by_email: string | null
          id: string
          images: Json
          is_gift: boolean
          is_standard_product: boolean
          line_total: number
          manufacturing_cost: number | null
          margin_pct: number | null
          negotiated_at: string | null
          negotiated_by: string | null
          negotiated_cost: number | null
          order_id: string
          partial_delivered_at: string | null
          partial_shipment_enabled: boolean
          partial_shipment_enabled_at: string | null
          partial_shipment_enabled_by: string | null
          planimetry_files: Json
          production_due_date: string | null
          production_finished_at: string | null
          production_finished_by: string | null
          production_finished_by_email: string | null
          production_order_id: string | null
          production_started_at: string | null
          quantity: number
          quotation_date: string | null
          sort_order: number
          supplier_actual_date: string | null
          supplier_id: string | null
          supplier_promised_date: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          cost_notes?: string | null
          created_at?: string
          description: string
          gifted_at?: string | null
          gifted_by?: string | null
          gifted_by_email?: string | null
          id?: string
          images?: Json
          is_gift?: boolean
          is_standard_product?: boolean
          line_total?: number
          manufacturing_cost?: number | null
          margin_pct?: number | null
          negotiated_at?: string | null
          negotiated_by?: string | null
          negotiated_cost?: number | null
          order_id: string
          partial_delivered_at?: string | null
          partial_shipment_enabled?: boolean
          partial_shipment_enabled_at?: string | null
          partial_shipment_enabled_by?: string | null
          planimetry_files?: Json
          production_due_date?: string | null
          production_finished_at?: string | null
          production_finished_by?: string | null
          production_finished_by_email?: string | null
          production_order_id?: string | null
          production_started_at?: string | null
          quantity?: number
          quotation_date?: string | null
          sort_order?: number
          supplier_actual_date?: string | null
          supplier_id?: string | null
          supplier_promised_date?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          cost_notes?: string | null
          created_at?: string
          description?: string
          gifted_at?: string | null
          gifted_by?: string | null
          gifted_by_email?: string | null
          id?: string
          images?: Json
          is_gift?: boolean
          is_standard_product?: boolean
          line_total?: number
          manufacturing_cost?: number | null
          margin_pct?: number | null
          negotiated_at?: string | null
          negotiated_by?: string | null
          negotiated_cost?: number | null
          order_id?: string
          partial_delivered_at?: string | null
          partial_shipment_enabled?: boolean
          partial_shipment_enabled_at?: string | null
          partial_shipment_enabled_by?: string | null
          planimetry_files?: Json
          production_due_date?: string | null
          production_finished_at?: string | null
          production_finished_by?: string | null
          production_finished_by_email?: string | null
          production_order_id?: string | null
          production_started_at?: string | null
          quantity?: number
          quotation_date?: string | null
          sort_order?: number
          supplier_actual_date?: string | null
          supplier_id?: string | null
          supplier_promised_date?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          deposit_account: string | null
          id: string
          method: string | null
          note: string | null
          order_id: string
          paid_at: string
          proof_url: string | null
          proof_urls: string[]
          reference: string | null
        }
        Insert: {
          amount: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          deposit_account?: string | null
          id?: string
          method?: string | null
          note?: string | null
          order_id: string
          paid_at?: string
          proof_url?: string | null
          proof_urls?: string[]
          reference?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          deposit_account?: string | null
          id?: string
          method?: string | null
          note?: string | null
          order_id?: string
          paid_at?: string
          proof_url?: string | null
          proof_urls?: string[]
          reference?: string | null
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status_id: string | null
          id: string
          note: string | null
          order_id: string
          to_status_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status_id?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status_id?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_to_status_id_fkey"
            columns: ["to_status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_statuses: {
        Row: {
          brand_id: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_draft: boolean
          is_final: boolean
          is_initial: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_draft?: boolean
          is_final?: boolean
          is_initial?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_draft?: boolean
          is_final?: boolean
          is_initial?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_statuses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          advance_amount: number
          advance_deposit_account: string | null
          approval_note: string | null
          approval_requested_at: string | null
          approval_requested_by: string | null
          approval_resolved_at: string | null
          approval_resolved_by: string | null
          approval_status: string
          assigned_to: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_city: string | null
          customer_company: string | null
          customer_contact_type: string | null
          customer_department: string | null
          customer_doc_number: string | null
          customer_doc_type: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_person_type: string | null
          customer_phone: string | null
          deferred_at: string | null
          deferred_by: string | null
          deferred_reason: string | null
          discount: number
          estimated_delivery_date: string | null
          id: string
          invoice_number: string | null
          is_deferred_delivery: boolean
          last_draft_saved_at: string | null
          notes: string | null
          order_number: string
          paulatino_advance_at_send: number | null
          paulatino_authorized_at: string | null
          paulatino_authorized_by: string | null
          paulatino_authorized_by_email: string | null
          payment_method: string | null
          payment_proof_url: string | null
          price_locked_at: string | null
          requires_management_approval: boolean
          sale_date: string | null
          sale_type: string
          scheduled_delivery_date: string | null
          scheduled_logistics_at: string | null
          scheduled_logistics_by: string | null
          scheduled_logistics_date: string | null
          seller_id: string | null
          separe_activated_at: string | null
          separe_completed_at: string | null
          source: string
          status_id: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
          whatsapp_raw: string | null
        }
        Insert: {
          advance_amount?: number
          advance_deposit_account?: string | null
          approval_note?: string | null
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approval_resolved_at?: string | null
          approval_resolved_by?: string | null
          approval_status?: string
          assigned_to?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_city?: string | null
          customer_company?: string | null
          customer_contact_type?: string | null
          customer_department?: string | null
          customer_doc_number?: string | null
          customer_doc_type?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_person_type?: string | null
          customer_phone?: string | null
          deferred_at?: string | null
          deferred_by?: string | null
          deferred_reason?: string | null
          discount?: number
          estimated_delivery_date?: string | null
          id?: string
          invoice_number?: string | null
          is_deferred_delivery?: boolean
          last_draft_saved_at?: string | null
          notes?: string | null
          order_number: string
          paulatino_advance_at_send?: number | null
          paulatino_authorized_at?: string | null
          paulatino_authorized_by?: string | null
          paulatino_authorized_by_email?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          price_locked_at?: string | null
          requires_management_approval?: boolean
          sale_date?: string | null
          sale_type?: string
          scheduled_delivery_date?: string | null
          scheduled_logistics_at?: string | null
          scheduled_logistics_by?: string | null
          scheduled_logistics_date?: string | null
          seller_id?: string | null
          separe_activated_at?: string | null
          separe_completed_at?: string | null
          source?: string
          status_id: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          whatsapp_raw?: string | null
        }
        Update: {
          advance_amount?: number
          advance_deposit_account?: string | null
          approval_note?: string | null
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approval_resolved_at?: string | null
          approval_resolved_by?: string | null
          approval_status?: string
          assigned_to?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_city?: string | null
          customer_company?: string | null
          customer_contact_type?: string | null
          customer_department?: string | null
          customer_doc_number?: string | null
          customer_doc_type?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_person_type?: string | null
          customer_phone?: string | null
          deferred_at?: string | null
          deferred_by?: string | null
          deferred_reason?: string | null
          discount?: number
          estimated_delivery_date?: string | null
          id?: string
          invoice_number?: string | null
          is_deferred_delivery?: boolean
          last_draft_saved_at?: string | null
          notes?: string | null
          order_number?: string
          paulatino_advance_at_send?: number | null
          paulatino_authorized_at?: string | null
          paulatino_authorized_by?: string | null
          paulatino_authorized_by_email?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          price_locked_at?: string | null
          requires_management_approval?: boolean
          sale_date?: string | null
          sale_type?: string
          scheduled_delivery_date?: string | null
          scheduled_logistics_at?: string | null
          scheduled_logistics_by?: string | null
          scheduled_logistics_date?: string | null
          seller_id?: string | null
          separe_activated_at?: string | null
          separe_completed_at?: string | null
          source?: string
          status_id?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          whatsapp_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_orders: {
        Row: {
          assigned_at: string | null
          brand_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          delivered_at: string | null
          destination: Database["public"]["Enums"]["pickup_destination"]
          destination_address_snapshot: string | null
          destination_warehouse_id: string | null
          driver_id: string | null
          external_transport_cost: number | null
          external_transport_currency: string
          external_transport_notes: string | null
          id: string
          notes: string | null
          order_id: string
          order_item_id: string
          picked_up_at: string | null
          pickup_address_snapshot: string | null
          product_description_snapshot: string | null
          production_order_id: string | null
          status: Database["public"]["Enums"]["pickup_status"]
          supplier_id: string | null
          supplier_name_snapshot: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          brand_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          delivered_at?: string | null
          destination?: Database["public"]["Enums"]["pickup_destination"]
          destination_address_snapshot?: string | null
          destination_warehouse_id?: string | null
          driver_id?: string | null
          external_transport_cost?: number | null
          external_transport_currency?: string
          external_transport_notes?: string | null
          id?: string
          notes?: string | null
          order_id: string
          order_item_id: string
          picked_up_at?: string | null
          pickup_address_snapshot?: string | null
          product_description_snapshot?: string | null
          production_order_id?: string | null
          status?: Database["public"]["Enums"]["pickup_status"]
          supplier_id?: string | null
          supplier_name_snapshot?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          brand_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          delivered_at?: string | null
          destination?: Database["public"]["Enums"]["pickup_destination"]
          destination_address_snapshot?: string | null
          destination_warehouse_id?: string | null
          driver_id?: string | null
          external_transport_cost?: number | null
          external_transport_currency?: string
          external_transport_notes?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          order_item_id?: string
          picked_up_at?: string | null
          pickup_address_snapshot?: string | null
          product_description_snapshot?: string | null
          production_order_id?: string | null
          status?: Database["public"]["Enums"]["pickup_status"]
          supplier_id?: string | null
          supplier_name_snapshot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_orders_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "pickup_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_orders_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_audit_log: {
        Row: {
          action: string
          brand_id: string
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          field: string | null
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
          production_order_id: string
        }
        Insert: {
          action: string
          brand_id: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          production_order_id: string
        }
        Update: {
          action?: string
          brand_id?: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          production_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_audit_log_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_deletions: {
        Row: {
          brand_id: string
          code: string | null
          deleted_at: string
          deleted_by: string | null
          deleted_by_email: string | null
          id: string
          order_id: string | null
          order_snapshot: Json
          planimetries_snapshot: Json
          production_order_id: string
          reason: string
          status: string | null
        }
        Insert: {
          brand_id: string
          code?: string | null
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          id?: string
          order_id?: string | null
          order_snapshot: Json
          planimetries_snapshot?: Json
          production_order_id: string
          reason: string
          status?: string | null
        }
        Update: {
          brand_id?: string
          code?: string | null
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          id?: string
          order_id?: string | null
          order_snapshot?: Json
          planimetries_snapshot?: Json
          production_order_id?: string
          reason?: string
          status?: string | null
        }
        Relationships: []
      }
      production_orders: {
        Row: {
          assigned_to: string | null
          assigned_to_label: string | null
          brand_id: string
          client_actual_date: string | null
          client_promised_date: string | null
          code: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          due_date: string | null
          id: string
          invoice_date: string | null
          manufacturing_cost: number | null
          margin_pct: number | null
          notes: string | null
          novedad: Database["public"]["Enums"]["production_novedad"]
          order_id: string
          planimetry_sent_date: string | null
          priority: string
          production_owner_id: string | null
          production_start_date: string | null
          quotation_date: string | null
          start_date: string | null
          status: string
          supplier_actual_date: string | null
          supplier_id: string | null
          supplier_promised_date: string | null
          updated_at: string
          workshop: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_label?: string | null
          brand_id: string
          client_actual_date?: string | null
          client_promised_date?: string | null
          code: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          manufacturing_cost?: number | null
          margin_pct?: number | null
          notes?: string | null
          novedad?: Database["public"]["Enums"]["production_novedad"]
          order_id: string
          planimetry_sent_date?: string | null
          priority?: string
          production_owner_id?: string | null
          production_start_date?: string | null
          quotation_date?: string | null
          start_date?: string | null
          status?: string
          supplier_actual_date?: string | null
          supplier_id?: string | null
          supplier_promised_date?: string | null
          updated_at?: string
          workshop?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_label?: string | null
          brand_id?: string
          client_actual_date?: string | null
          client_promised_date?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          manufacturing_cost?: number | null
          margin_pct?: number | null
          notes?: string | null
          novedad?: Database["public"]["Enums"]["production_novedad"]
          order_id?: string
          planimetry_sent_date?: string | null
          priority?: string
          production_owner_id?: string | null
          production_start_date?: string | null
          quotation_date?: string | null
          start_date?: string | null
          status?: string
          supplier_actual_date?: string | null
          supplier_id?: string | null
          supplier_promised_date?: string | null
          updated_at?: string
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "production_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_planimetries: {
        Row: {
          brand_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          notes: string | null
          order_item_id: string | null
          production_order_id: string
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_email: string | null
          version: number
        }
        Insert: {
          brand_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          order_item_id?: string | null
          production_order_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
          version?: number
        }
        Update: {
          brand_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          order_item_id?: string | null
          production_order_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_planimetries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_planimetries_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      real_production_audit_log: {
        Row: {
          action: string
          brand_id: string
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          field: string | null
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
          real_production_order_id: string
        }
        Insert: {
          action: string
          brand_id: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          real_production_order_id: string
        }
        Update: {
          action?: string
          brand_id?: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          real_production_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_production_audit_log_real_production_order_id_fkey"
            columns: ["real_production_order_id"]
            isOneToOne: false
            referencedRelation: "real_production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      real_production_orders: {
        Row: {
          brand_id: string
          code: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          delivered_at: string | null
          delivery_target: string | null
          id: string
          margin_pct: number | null
          notes: string | null
          order_id: string
          planimetry_ok: boolean
          qc_ok: boolean
          sale_total_snapshot: number
          stage: string
          supplier_approved: boolean
          supplier_cost: number | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          code: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          delivered_at?: string | null
          delivery_target?: string | null
          id?: string
          margin_pct?: number | null
          notes?: string | null
          order_id: string
          planimetry_ok?: boolean
          qc_ok?: boolean
          sale_total_snapshot?: number
          stage?: string
          supplier_approved?: boolean
          supplier_cost?: number | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          delivered_at?: string | null
          delivery_target?: string | null
          id?: string
          margin_pct?: number | null
          notes?: string | null
          order_id?: string
          planimetry_ok?: boolean
          qc_ok?: boolean
          sale_total_snapshot?: number
          stage?: string
          supplier_approved?: boolean
          supplier_cost?: number | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      released_invoice_numbers: {
        Row: {
          brand_id: string
          id: string
          invoice_number: string
          released_at: string
          released_by: string | null
          released_from_order_id: string | null
        }
        Insert: {
          brand_id: string
          id?: string
          invoice_number: string
          released_at?: string
          released_by?: string | null
          released_from_order_id?: string | null
        }
        Update: {
          brand_id?: string
          id?: string
          invoice_number?: string
          released_at?: string
          released_by?: string | null
          released_from_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "released_invoice_numbers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          period_month: string
          seller_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: string
          seller_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: string
          seller_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_tasks: {
        Row: {
          brand_id: string
          created_at: string
          forms_completed_at: string | null
          id: string
          order_id: string | null
          order_item_id: string | null
          planimetry_due_at: string | null
          production_order_id: string | null
          reason: string | null
          resolved_at: string | null
          seller_id: string
          severity: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          forms_completed_at?: string | null
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          planimetry_due_at?: string | null
          production_order_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          seller_id: string
          severity?: string
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          forms_completed_at?: string | null
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          planimetry_due_at?: string | null
          production_order_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          seller_id?: string
          severity?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_tasks_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          advance_payment_pct: number
          brand_id: string
          category: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          requires_advance_payment: boolean
          updated_at: string
        }
        Insert: {
          advance_payment_pct?: number
          brand_id: string
          category?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          requires_advance_payment?: boolean
          updated_at?: string
        }
        Update: {
          advance_payment_pct?: number
          brand_id?: string
          category?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          requires_advance_payment?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      terms_versions: {
        Row: {
          content_html: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          title: string
          version: number
        }
        Insert: {
          content_html: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title?: string
          version: number
        }
        Update: {
          content_html?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title?: string
          version?: number
        }
        Relationships: []
      }
      user_admin_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      user_brands: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_movements: {
        Row: {
          client_cedula: string | null
          client_invoice: string | null
          created_at: string
          id: string
          item_id: string
          moved_at: string
          moved_by: string | null
          moved_by_email: string | null
          movement_type: string
          product_quantity: number
          reason: string | null
          zone_id: string
        }
        Insert: {
          client_cedula?: string | null
          client_invoice?: string | null
          created_at?: string
          id?: string
          item_id: string
          moved_at?: string
          moved_by?: string | null
          moved_by_email?: string | null
          movement_type: string
          product_quantity?: number
          reason?: string | null
          zone_id: string
        }
        Update: {
          client_cedula?: string | null
          client_invoice?: string | null
          created_at?: string
          id?: string
          item_id?: string
          moved_at?: string
          moved_by?: string | null
          moved_by_email?: string | null
          movement_type?: string
          product_quantity?: number
          reason?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_movements_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "warehouse_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_settings: {
        Row: {
          id: string
          singleton: boolean
          stagnant_days_threshold: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          singleton?: boolean
          stagnant_days_threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          singleton?: boolean
          stagnant_days_threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      warehouse_zones: {
        Row: {
          active: boolean
          capacity_units: number | null
          created_at: string
          description: string | null
          id: string
          updated_at: string
          warehouse_id: string
          zone_code: string
        }
        Insert: {
          active?: boolean
          capacity_units?: number | null
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          warehouse_id: string
          zone_code: string
        }
        Update: {
          active?: boolean
          capacity_units?: number | null
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          warehouse_id?: string
          zone_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_zones_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      order_financials: {
        Row: {
          advance_amount: number | null
          balance: number | null
          brand_id: string | null
          created_at: string | null
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          days_since_sale: number | null
          invoice_number: string | null
          order_id: string | null
          order_number: string | null
          paid_total: number | null
          payment_status: string | null
          payments_total: number | null
          sale_date: string | null
          seller_id: string | null
          seller_label: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_item_locations: {
        Row: {
          current_zone_id: string | null
          item_id: string | null
          last_movement_at: string | null
          last_movement_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_business_days: {
        Args: { _from: string; _n: number }
        Returns: string
      }
      admin_preview_wipe_counts: { Args: never; Returns: Json }
      admin_wipe_transactional_data: {
        Args: { p_confirm: string }
        Returns: Json
      }
      alert_stale_drafts: { Args: never; Returns: undefined }
      allocate_invoice_number: { Args: { p_brand_id: string }; Returns: string }
      approve_commission: { Args: { _id: string }; Returns: undefined }
      can_collect_final_balance: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      can_finish_order_item: {
        Args: { _item_id: string; _user_id: string }
        Returns: boolean
      }
      can_send_order_to_logistics: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      can_write_brand: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_production_with_reason: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      change_order_brand: {
        Args: { p_new_brand_id: string; p_order_id: string; p_reason: string }
        Returns: Json
      }
      check_separe_completion: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      commission_actor_label: { Args: { _uid: string }; Returns: string }
      commission_tier_for: {
        Args: { _amount: number; _brand_id: string }
        Returns: number
      }
      confirm_supplier_final_payment: {
        Args: {
          _amount: number
          _item_id: string
          _paid_at?: string
          _reference?: string
        }
        Returns: string
      }
      create_approval_tasks: {
        Args: {
          p_brand_id: string
          p_customer: string
          p_invoice: string
          p_order_id: string
          p_pct: number
          p_seller_id: string
        }
        Returns: undefined
      }
      create_supplier_payment_tasks: {
        Args: { _item_id: string }
        Returns: undefined
      }
      defer_order_delivery: {
        Args: { p_new_date: string; p_order_id: string; p_reason: string }
        Returns: undefined
      }
      delete_order_with_reason: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      delete_production_with_reason: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      effective_production_start_for_item: {
        Args: { _item_id: string }
        Returns: string
      }
      get_commission_audit: {
        Args: { _id: string }
        Returns: {
          action: string
          actor_label: string
          created_at: string
          id: string
          reason: string
          reference: string
        }[]
      }
      has_brand_access: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoice_can_schedule_logistics: {
        Args: { _order_id: string }
        Returns: boolean
      }
      is_pure_vendedor: { Args: { _user_id: string }; Returns: boolean }
      mark_invoice_electronic: {
        Args: {
          p_external_number: string
          p_invoice_id: string
          p_issued_at: string
          p_note: string
        }
        Returns: undefined
      }
      mark_item_partial_delivered: {
        Args: { p_item_id: string; p_note?: string }
        Returns: Json
      }
      mark_order_item_finished: {
        Args: { _item_id: string }
        Returns: undefined
      }
      mark_task_forms_done: { Args: { p_task_id: string }; Returns: Json }
      maybe_create_commission_request: {
        Args: { _order_id: string }
        Returns: undefined
      }
      notify_seller_invoice_ready: {
        Args: { _order_id: string }
        Returns: undefined
      }
      order_completion_progress: {
        Args: { _order_id: string }
        Returns: {
          all_finished: boolean
          finished: number
          total: number
        }[]
      }
      order_is_draft: { Args: { _order_id: string }; Returns: boolean }
      order_item_has_planimetry: {
        Args: { _item_id: string }
        Returns: boolean
      }
      pay_commission: {
        Args: { _id: string; _reference?: string }
        Returns: undefined
      }
      pay_commissions_bulk: {
        Args: { _ids: string[]; _reference?: string }
        Returns: number
      }
      reject_commission: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      reject_production_with_reason: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      request_management_approval: {
        Args: { p_note?: string; p_order_id: string }
        Returns: undefined
      }
      resolve_management_approval: {
        Args: { p_decision: string; p_note?: string; p_order_id: string }
        Returns: undefined
      }
      revert_invoice_electronic: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
      set_logistics_availability_bulk: {
        Args: { _available: boolean; _dates: string[]; _note?: string }
        Returns: number
      }
      start_real_production: {
        Args: { p_item_id: string; p_started_at?: string }
        Returns: undefined
      }
      subtract_business_days: {
        Args: { _from: string; _n: number }
        Returns: string
      }
      sum_external_logistics_cost: {
        Args: { _brand_id?: string; _from: string; _to: string }
        Returns: number
      }
      toggle_item_partial_shipment: {
        Args: { p_enabled: boolean; p_item_id: string; p_note?: string }
        Returns: Json
      }
      unmark_order_item_finished: {
        Args: { _item_id: string; _reason: string }
        Returns: undefined
      }
      update_order_status: {
        Args: { p_note?: string; p_order_id: string; p_status_id: string }
        Returns: undefined
      }
      vendedor_can_see_order: { Args: { _order_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "operativo"
        | "finanzas"
        | "ventas"
        | "vendedor"
        | "logistica"
      driver_availability: "disponible" | "en_ruta" | "no_disponible"
      driver_vehicle_type: "propio" | "externo"
      pickup_destination: "bodega" | "cliente"
      pickup_status:
        | "pendiente"
        | "asignada"
        | "en_camino"
        | "recogida"
        | "entregada"
        | "cancelada"
      production_novedad:
        | "pendiente"
        | "cotizando"
        | "produccion"
        | "entrega_inmediata"
        | "entregada"
        | "anulada"
        | "pendiente_por_logistica"
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
      app_role: [
        "admin",
        "operativo",
        "finanzas",
        "ventas",
        "vendedor",
        "logistica",
      ],
      driver_availability: ["disponible", "en_ruta", "no_disponible"],
      driver_vehicle_type: ["propio", "externo"],
      pickup_destination: ["bodega", "cliente"],
      pickup_status: [
        "pendiente",
        "asignada",
        "en_camino",
        "recogida",
        "entregada",
        "cancelada",
      ],
      production_novedad: [
        "pendiente",
        "cotizando",
        "produccion",
        "entrega_inmediata",
        "entregada",
        "anulada",
        "pendiente_por_logistica",
      ],
    },
  },
} as const
