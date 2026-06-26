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
      accounts: {
        Row: {
          color: string | null
          created_at: string
          currency_code: string
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          initial_balance: number
          is_active: boolean
          metadata: Json
          name: string
          sort_order: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          metadata?: Json
          name: string
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          metadata?: Json
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      asset_history_events: {
        Row: {
          amount: number | null
          asset_id: string
          created_at: string
          description: string | null
          event_date: string
          event_type: string
          id: string
          metadata: Json
          title: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          asset_id: string
          created_at?: string
          description?: string | null
          event_date?: string
          event_type: string
          id?: string
          metadata?: Json
          title?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number | null
          asset_id?: string
          created_at?: string
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          metadata?: Json
          title?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_history_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_history_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_assets_with_usage"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "asset_history_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          account_id: string | null
          asset_category: string | null
          category_id: string | null
          condition: string | null
          created_at: string
          current_value: number | null
          deleted_at: string | null
          description: string | null
          id: string
          metadata: Json
          name: string
          purchase_amount: number | null
          purchase_date: string | null
          start_using_date: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          asset_category?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string
          current_value?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          purchase_amount?: number | null
          purchase_date?: string | null
          start_using_date?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          asset_category?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string
          current_value?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          purchase_amount?: number | null
          purchase_date?: string | null
          start_using_date?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "assets_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          alert_percentage: number | null
          budget_plan_id: string
          category_id: string | null
          created_at: string
          id: string
          metadata: Json
          note: string | null
          planned_amount: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_percentage?: number | null
          budget_plan_id: string
          category_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          planned_amount: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          alert_percentage?: number | null
          budget_plan_id?: string
          category_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          planned_amount?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_plan_id_fkey"
            columns: ["budget_plan_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_budget_plan_id_fkey"
            columns: ["budget_plan_id"]
            isOneToOne: false
            referencedRelation: "v_budget_vs_actual"
            referencedColumns: ["budget_plan_id"]
          },
          {
            foreignKeyName: "budget_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_plans: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          end_date: string
          id: string
          metadata: Json
          name: string
          period_type: string
          plan_type: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          metadata?: Json
          name: string
          period_type?: string
          plan_type?: string
          start_date: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          metadata?: Json
          name?: string
          period_type?: string
          plan_type?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_default: boolean
          metadata: Json
          name: string
          parent_id: string | null
          sort_order: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name: string
          parent_id?: string | null
          sort_order?: number
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name?: string
          parent_id?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_payments: {
        Row: {
          amount: number
          created_at: string
          debt_id: string
          id: string
          metadata: Json
          note: string | null
          payment_date: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          debt_id: string
          id?: string
          metadata?: Json
          note?: string | null
          payment_date?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          debt_id?: string
          id?: string
          metadata?: Json
          note?: string | null
          payment_date?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "v_debt_progress"
            referencedColumns: ["debt_id"]
          },
          {
            foreignKeyName: "debt_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          account_id: string | null
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          initial_paid_amount: number
          interest_rate: number
          lender: string | null
          lender_name: string | null
          metadata: Json
          monthly_payment: number
          name: string
          next_payment_date: string | null
          payment_account_id: string | null
          repaid_amount: number
          repayment_amount: number | null
          repayment_cycle: string | null
          start_date: string | null
          status: string
          total_amount: number
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          initial_paid_amount?: number
          interest_rate?: number
          lender?: string | null
          lender_name?: string | null
          metadata?: Json
          monthly_payment?: number
          name: string
          next_payment_date?: string | null
          payment_account_id?: string | null
          repaid_amount?: number
          repayment_amount?: number | null
          repayment_cycle?: string | null
          start_date?: string | null
          status?: string
          total_amount: number
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          initial_paid_amount?: number
          interest_rate?: number
          lender?: string | null
          lender_name?: string | null
          metadata?: Json
          monthly_payment?: number
          name?: string
          next_payment_date?: string | null
          payment_account_id?: string | null
          repaid_amount?: number
          repayment_amount?: number | null
          repayment_cycle?: string | null
          start_date?: string | null
          status?: string
          total_amount?: number
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "debts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          export_type: string
          file_format: string
          file_url: string | null
          filter: Json
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          export_type: string
          file_format: string
          file_url?: string | null
          filter?: Json
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          export_type?: string
          file_format?: string
          file_url?: string | null
          filter?: Json
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      file_links: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_id: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_links_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_scenarios: {
        Row: {
          base_end_date: string | null
          base_start_date: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          metadata: Json
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_end_date?: string | null
          base_start_date?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          base_end_date?: string | null
          base_start_date?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          email: string | null
          id: string
          metadata: Json
          name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          metadata?: Json
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          metadata?: Json
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      person_payment_records: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          metadata: Json
          person_id: string
          record_date: string
          status: string
          transaction_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json
          person_id: string
          record_date?: string
          status?: string
          transaction_id?: string | null
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json
          person_id?: string
          record_date?: string
          status?: string
          transaction_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_payment_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_payment_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_people_payment_summary"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "person_payment_records_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goal_entries: {
        Row: {
          amount: number
          created_at: string
          entry_date: string
          id: string
          metadata: Json
          note: string | null
          savings_goal_id: string
          transaction_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          entry_date?: string
          id?: string
          metadata?: Json
          note?: string | null
          savings_goal_id: string
          transaction_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          entry_date?: string
          id?: string
          metadata?: Json
          note?: string | null
          savings_goal_id?: string
          transaction_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goal_entries_savings_goal_id_fkey"
            columns: ["savings_goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goal_entries_savings_goal_id_fkey"
            columns: ["savings_goal_id"]
            isOneToOne: false
            referencedRelation: "v_savings_goal_progress"
            referencedColumns: ["savings_goal_id"]
          },
          {
            foreignKeyName: "savings_goal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          account_id: string | null
          category_id: string | null
          created_at: string
          current_amount: number
          deleted_at: string | null
          description: string | null
          id: string
          initial_saved_amount: number
          metadata: Json
          monthly_contribution: number
          name: string
          saved_amount: number
          status: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          category_id?: string | null
          created_at?: string
          current_amount?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          initial_saved_amount?: number
          metadata?: Json
          monthly_contribution?: number
          name: string
          saved_amount?: number
          status?: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          category_id?: string | null
          created_at?: string
          current_amount?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          initial_saved_amount?: number
          metadata?: Json
          monthly_contribution?: number
          name?: string
          saved_amount?: number
          status?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
        ]
      }
      scenario_items: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          item_date: string | null
          metadata: Json
          scenario_id: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_date?: string | null
          metadata?: Json
          scenario_id: string
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_date?: string | null
          metadata?: Json
          scenario_id?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "scenario_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_items_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "financial_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json
          note: string | null
          payment_date: string
          subscription_id: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          payment_date?: string
          subscription_id: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          payment_date?: string
          subscription_id?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_upcoming_subscriptions"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: string | null
          amount: number
          auto_create_transaction: boolean
          billing_cycle: string
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          id: string
          last_reminded_at: string | null
          metadata: Json
          name: string
          next_billing_date: string | null
          reminder_days_before: number
          reminder_enabled: boolean
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          auto_create_transaction?: boolean
          billing_cycle?: string
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_reminded_at?: string | null
          metadata?: Json
          name: string
          next_billing_date?: string | null
          reminder_days_before?: number
          reminder_enabled?: boolean
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          auto_create_transaction?: boolean
          billing_cycle?: string
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_reminded_at?: string | null
          metadata?: Json
          name?: string
          next_billing_date?: string | null
          reminder_days_before?: number
          reminder_enabled?: boolean
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "subscriptions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          metadata: Json
          note: string | null
          payment_method: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          status: string
          title: string | null
          transaction_date: string
          transfer_account_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          payment_method?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: string
          title?: string | null
          transaction_date?: string
          transfer_account_id?: string | null
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          payment_method?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: string
          title?: string | null
          transaction_date?: string
          transfer_account_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_account_id_fkey"
            columns: ["transfer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_account_id_fkey"
            columns: ["transfer_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          file_path: string | null
          file_size_bytes: number | null
          file_url: string
          id: string
          metadata: Json
          mime_type: string | null
          original_file_name: string
          stored_file_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          file_url: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          original_file_name: string
          stored_file_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          original_file_name?: string
          stored_file_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_format: string
          default_currency_code: string
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          metadata: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_format?: string
          default_currency_code?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id: string
          metadata?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_format?: string
          default_currency_code?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          metadata?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          currency_code: string
          date_format: string
          default_account_id: string | null
          default_expense_category_id: string | null
          default_income_category_id: string | null
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          date_format?: string
          default_account_id?: string | null
          default_expense_category_id?: string | null
          default_income_category_id?: string | null
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          date_format?: string
          default_account_id?: string | null
          default_expense_category_id?: string | null
          default_income_category_id?: string | null
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "user_settings_default_expense_category_id_fkey"
            columns: ["default_expense_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_default_income_category_id_fkey"
            columns: ["default_income_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_account_balances: {
        Row: {
          account_id: string | null
          created_at: string | null
          currency_code: string | null
          current_balance: number | null
          initial_balance: number | null
          is_active: boolean | null
          name: string | null
          sort_order: number | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_assets_with_usage: {
        Row: {
          asset_category: string | null
          asset_id: string | null
          created_at: string | null
          description: string | null
          name: string | null
          purchase_amount: number | null
          purchase_date: string | null
          status: string | null
          updated_at: string | null
          used_days: number | null
          user_id: string | null
        }
        Insert: {
          asset_category?: string | null
          asset_id?: string | null
          created_at?: string | null
          description?: string | null
          name?: string | null
          purchase_amount?: number | null
          purchase_date?: string | null
          status?: string | null
          updated_at?: string | null
          used_days?: never
          user_id?: string | null
        }
        Update: {
          asset_category?: string | null
          asset_id?: string | null
          created_at?: string | null
          description?: string | null
          name?: string | null
          purchase_amount?: number | null
          purchase_date?: string | null
          status?: string | null
          updated_at?: string | null
          used_days?: never
          user_id?: string | null
        }
        Relationships: []
      }
      v_budget_vs_actual: {
        Row: {
          actual_amount: number | null
          budget_item_id: string | null
          budget_name: string | null
          budget_plan_id: string | null
          budget_plan_status: string | null
          budget_status: string | null
          category_id: string | null
          category_name: string | null
          created_at: string | null
          end_date: string | null
          period_type: string | null
          plan_type: string | null
          planned_amount: number | null
          remaining_amount: number | null
          start_date: string | null
          type: string | null
          updated_at: string | null
          usage_percentage: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dashboard_summary: {
        Row: {
          active_debt_count: number | null
          active_savings_goal_count: number | null
          active_subscription_count: number | null
          current_month_expense: number | null
          current_month_income: number | null
          total_balance: number | null
          transaction_count: number | null
          user_id: string | null
        }
        Insert: {
          active_debt_count?: never
          active_savings_goal_count?: never
          active_subscription_count?: never
          current_month_expense?: never
          current_month_income?: never
          total_balance?: never
          transaction_count?: never
          user_id?: string | null
        }
        Update: {
          active_debt_count?: never
          active_savings_goal_count?: never
          active_subscription_count?: never
          current_month_expense?: never
          current_month_income?: never
          total_balance?: never
          transaction_count?: never
          user_id?: string | null
        }
        Relationships: []
      }
      v_debt_progress: {
        Row: {
          created_at: string | null
          debt_id: string | null
          due_date: string | null
          initial_paid_amount: number | null
          lender_name: string | null
          name: string | null
          paid_amount: number | null
          progress_percentage: number | null
          remaining_amount: number | null
          repayment_amount: number | null
          repayment_cycle: string | null
          start_date: string | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_monthly_income_expense: {
        Row: {
          month: string | null
          net_amount: number | null
          total_expense: number | null
          total_income: number | null
          transaction_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_people_payment_summary: {
        Row: {
          created_at: string | null
          name: string | null
          person_id: string | null
          total_incoming: number | null
          total_outgoing: number | null
          unpaid_borrowed_amount: number | null
          unpaid_lent_amount: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_savings_goal_progress: {
        Row: {
          created_at: string | null
          initial_saved_amount: number | null
          name: string | null
          progress_percentage: number | null
          remaining_amount: number | null
          saved_amount: number | null
          savings_goal_id: string | null
          status: string | null
          target_amount: number | null
          target_date: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_upcoming_subscriptions: {
        Row: {
          account_name: string | null
          amount: number | null
          billing_cycle: string | null
          category_name: string | null
          created_at: string | null
          name: string | null
          next_billing_date: string | null
          status: string | null
          subscription_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_yearly_income_expense: {
        Row: {
          net_amount: number | null
          total_expense: number | null
          total_income: number | null
          transaction_count: number | null
          user_id: string | null
          year: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_default_user_settings: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      seed_default_categories: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      setup_new_user_defaults: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
