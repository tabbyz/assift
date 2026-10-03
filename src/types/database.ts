export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      assist_runs: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          end_date: string
          error: string | null
          id: string
          instructions: string | null
          models: Json | null
          request: Json | null
          result: Json | null
          rolled_back_at: string | null
          start_date: string
          status: Database["public"]["Enums"]["assist_run_status"]
          tenant_id: string
          updated_at: string
          usage: Json | null
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          end_date: string
          error?: string | null
          id?: string
          instructions?: string | null
          models?: Json | null
          request?: Json | null
          result?: Json | null
          rolled_back_at?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["assist_run_status"]
          tenant_id: string
          updated_at?: string
          usage?: Json | null
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          end_date?: string
          error?: string | null
          id?: string
          instructions?: string | null
          models?: Json | null
          request?: Json | null
          result?: Json | null
          rolled_back_at?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["assist_run_status"]
          tenant_id?: string
          updated_at?: string
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assist_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      date_notes: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          note: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      patterns: {
        Row: {
          color_hex: string
          created_at: string
          default_required_nums: Json
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["pattern_kind"]
          name: string
          pair_pattern_id: string | null
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color_hex?: string
          created_at?: string
          default_required_nums?: Json
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["pattern_kind"]
          name: string
          pair_pattern_id?: string | null
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color_hex?: string
          created_at?: string
          default_required_nums?: Json
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["pattern_kind"]
          name?: string
          pair_pattern_id?: string | null
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patterns_pair_pattern_id_tenant_id_fkey"
            columns: ["pair_pattern_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "patterns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_change_logs: {
        Row: {
          created_at: string
          id: string
          staffs_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          staffs_count: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          staffs_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_admin: boolean
          max_staffs_count: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_admin?: boolean
          max_staffs_count?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_admin?: boolean
          max_staffs_count?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      required_nums: {
        Row: {
          date: string
          id: string
          num: number
          pattern_id: string
          tenant_id: string
        }
        Insert: {
          date: string
          id?: string
          num?: number
          pattern_id: string
          tenant_id: string
        }
        Update: {
          date?: string
          id?: string
          num?: number
          pattern_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "required_nums_pattern_id_tenant_id_fkey"
            columns: ["pattern_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "required_nums_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restrictions: {
        Row: {
          created_at: string
          days: number | null
          hard: boolean
          id: string
          kind: Database["public"]["Enums"]["restriction_kind"]
          pattern1_id: string | null
          pattern2_id: string | null
          position: number
          staff_id: string | null
          tenant_id: string
          updated_at: string
          wdays: number[] | null
        }
        Insert: {
          created_at?: string
          days?: number | null
          hard?: boolean
          id?: string
          kind: Database["public"]["Enums"]["restriction_kind"]
          pattern1_id?: string | null
          pattern2_id?: string | null
          position?: number
          staff_id?: string | null
          tenant_id: string
          updated_at?: string
          wdays?: number[] | null
        }
        Update: {
          created_at?: string
          days?: number | null
          hard?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["restriction_kind"]
          pattern1_id?: string | null
          pattern2_id?: string | null
          position?: number
          staff_id?: string | null
          tenant_id?: string
          updated_at?: string
          wdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "restrictions_pattern1_id_tenant_id_fkey"
            columns: ["pattern1_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "restrictions_pattern2_id_tenant_id_fkey"
            columns: ["pattern2_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "restrictions_staff_id_tenant_id_fkey"
            columns: ["staff_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "staffs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "restrictions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shares: {
        Row: {
          code: string
          created_at: string
          end_date: string
          id: string
          start_date: string
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          end_date: string
          id?: string
          start_date: string
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          end_date?: string
          id?: string
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shares_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          assist_run_id: string | null
          created_at: string
          date: string
          fixed: boolean
          id: string
          pattern_id: string
          staff_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assist_run_id?: string | null
          created_at?: string
          date: string
          fixed?: boolean
          id?: string
          pattern_id: string
          staff_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assist_run_id?: string | null
          created_at?: string
          date?: string
          fixed?: boolean
          id?: string
          pattern_id?: string
          staff_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_assist_run_id_tenant_id_fkey"
            columns: ["assist_run_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "assist_runs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shifts_pattern_id_tenant_id_fkey"
            columns: ["pattern_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shifts_staff_id_tenant_id_fkey"
            columns: ["staff_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "staffs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_default_patterns: {
        Row: {
          day_key: string
          pattern_id: string
          staff_id: string
          tenant_id: string
        }
        Insert: {
          day_key: string
          pattern_id: string
          staff_id: string
          tenant_id: string
        }
        Update: {
          day_key?: string
          pattern_id?: string
          staff_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_default_patterns_pattern_id_tenant_id_fkey"
            columns: ["pattern_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "staff_default_patterns_staff_id_tenant_id_fkey"
            columns: ["staff_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "staffs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "staff_default_patterns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_patterns: {
        Row: {
          pattern_id: string
          staff_id: string
          tenant_id: string
        }
        Insert: {
          pattern_id: string
          staff_id: string
          tenant_id: string
        }
        Update: {
          pattern_id?: string
          staff_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_patterns_pattern_id_tenant_id_fkey"
            columns: ["pattern_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "staff_patterns_staff_id_tenant_id_fkey"
            columns: ["staff_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "staffs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "staff_patterns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staffs: {
        Row: {
          available_wdays: number[]
          created_at: string
          id: string
          max_work_week: number
          name: string
          position: number
          retired_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          available_wdays?: number[]
          created_at?: string
          id?: string
          max_work_week?: number
          name: string
          position?: number
          retired_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          available_wdays?: number[]
          created_at?: string
          id?: string
          max_work_week?: number
          name?: string
          position?: number
          retired_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          assist_notes: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          shift_cycle: Database["public"]["Enums"]["shift_cycle"]
          start_of_week: number
          updated_at: string
        }
        Insert: {
          assist_notes?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          shift_cycle?: Database["public"]["Enums"]["shift_cycle"]
          start_of_week?: number
          updated_at?: string
        }
        Update: {
          assist_notes?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          shift_cycle?: Database["public"]["Enums"]["shift_cycle"]
          start_of_week?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_shift: {
        Args: {
          p_date: string
          p_fixed: boolean
          p_pattern_id?: string
          p_staff_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      clear_draft_shifts: {
        Args: {
          p_end: string
          p_staff_id?: string
          p_start: string
          p_tenant_id: string
        }
        Returns: number
      }
      copy_shifts: {
        Args: {
          p_from_end: string
          p_from_start: string
          p_pattern_ids: string[]
          p_tenant_id: string
          p_to_start: string
        }
        Returns: number
      }
      reorder_positions: {
        Args: { p_ids: string[]; p_table: string; p_tenant_id: string }
        Returns: undefined
      }
      rollback_assist_run: {
        Args: { p_run_id: string; p_tenant_id: string }
        Returns: number
      }
      set_shifts_fixed: {
        Args: {
          p_end: string
          p_fixed: boolean
          p_staff_id?: string
          p_start: string
          p_tenant_id: string
        }
        Returns: number
      }
    }
    Enums: {
      assist_run_status: "running" | "succeeded" | "failed"
      pattern_kind: "workday" | "dayoff"
      restriction_kind:
        | "deny_pattern_pair"
        | "max_work_week"
        | "max_work_consecutive"
        | "sat_or_sun_dayoff"
        | "min_work_week"
        | "max_weekend_days"
        | "prefer_dayoff_wdays"
      shift_cycle: "month" | "half_month" | "two_week" | "week"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      assist_run_status: ["running", "succeeded", "failed"],
      pattern_kind: ["workday", "dayoff"],
      restriction_kind: [
        "deny_pattern_pair",
        "max_work_week",
        "max_work_consecutive",
        "sat_or_sun_dayoff",
        "min_work_week",
        "max_weekend_days",
        "prefer_dayoff_wdays",
      ],
      shift_cycle: ["month", "half_month", "two_week", "week"],
    },
  },
} as const

