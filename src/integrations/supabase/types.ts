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
      brands: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          invoice_footer_note: string | null
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
      order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          images: Json
          line_total: number
          order_id: string
          quantity: number
          sort_order: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          images?: Json
          line_total?: number
          order_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          images?: Json
          line_total?: number
          order_id?: string
          quantity?: number
          sort_order?: number
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
        ]
      }
      order_payments: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          method: string | null
          note: string | null
          order_id: string
          paid_at: string
          proof_url: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          method?: string | null
          note?: string | null
          order_id: string
          paid_at?: string
          proof_url?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          method?: string | null
          note?: string | null
          order_id?: string
          paid_at?: string
          proof_url?: string | null
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
          discount: number
          estimated_delivery_date: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          order_number: string
          payment_method: string | null
          payment_proof_url: string | null
          sale_date: string | null
          seller_id: string | null
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
          discount?: number
          estimated_delivery_date?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          order_number: string
          payment_method?: string | null
          payment_proof_url?: string | null
          sale_date?: string | null
          seller_id?: string | null
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
          discount?: number
          estimated_delivery_date?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          payment_proof_url?: string | null
          sale_date?: string | null
          seller_id?: string | null
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
      production_orders: {
        Row: {
          assigned_to: string | null
          assigned_to_label: string | null
          brand_id: string
          code: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          due_date: string | null
          id: string
          notes: string | null
          order_id: string
          priority: string
          start_date: string | null
          status: string
          updated_at: string
          workshop: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_label?: string | null
          brand_id: string
          code: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id: string
          priority?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          workshop?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_label?: string | null
          brand_id?: string
          code?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          priority?: string
          start_date?: string | null
          status?: string
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
          production_order_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
          version?: number
        }
        Relationships: [
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
    }
    Functions: {
      can_write_brand: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      delete_order_with_reason: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
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
      update_order_status: {
        Args: { p_note?: string; p_order_id: string; p_status_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "operativo" | "finanzas" | "ventas" | "vendedor"
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
      app_role: ["admin", "operativo", "finanzas", "ventas", "vendedor"],
    },
  },
} as const
