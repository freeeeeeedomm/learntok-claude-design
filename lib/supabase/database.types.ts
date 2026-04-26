export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          display_order: number
          is_active: boolean
          slug: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          is_active?: boolean
          slug: string
        }
        Update: {
          created_at?: string
          display_order?: number
          is_active?: boolean
          slug?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_preset: boolean
          owner_id: string | null
          position: number
          title: string
          topic_id: string | null
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_preset?: boolean
          owner_id?: string | null
          position?: number
          title: string
          topic_id?: string | null
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_preset?: boolean
          owner_id?: string | null
          position?: number
          title?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          created_at: string
          delta_seconds: number
          id: number
          label: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta_seconds: number
          id?: number
          label: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta_seconds?: number
          id?: number
          label?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          lesson_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          course_id: string
          created_at: string
          duration_seconds: number
          id: string
          position: number
          title: string
          yt_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          duration_seconds: number
          id?: string
          position: number
          title: string
          yt_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          position?: number
          title?: string
          yt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_courses: {
        Row: {
          added_at: string
          course_id: string
          position: number
          user_id: string
        }
        Insert: {
          added_at?: string
          course_id: string
          position?: number
          user_id: string
        }
        Update: {
          added_at?: string
          course_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_courses_user_id_fkey"
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
          display_name: string | null
          email: string
          id: string
          interests: string[] | null
          is_admin: boolean
          jar_balance_cached: number
          last_study_date: string | null
          nudge_at_seconds: number
          onboarded: boolean
          rate: number
          show_timer: boolean
          streak: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          interests?: string[] | null
          is_admin?: boolean
          jar_balance_cached?: number
          last_study_date?: string | null
          nudge_at_seconds?: number
          onboarded?: boolean
          rate?: number
          show_timer?: boolean
          streak?: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          interests?: string[] | null
          is_admin?: boolean
          jar_balance_cached?: number
          last_study_date?: string | null
          nudge_at_seconds?: number
          onboarded?: boolean
          rate?: number
          show_timer?: boolean
          streak?: number
        }
        Relationships: []
      }
      sessions: {
        Row: {
          budget_seconds: number | null
          earned_or_spent_seconds: number
          ended_at: string | null
          id: string
          kind: string
          last_heartbeat_at: string
          lesson_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          budget_seconds?: number | null
          earned_or_spent_seconds?: number
          ended_at?: string | null
          id?: string
          kind: string
          last_heartbeat_at?: string
          lesson_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          budget_seconds?: number | null
          earned_or_spent_seconds?: number
          ended_at?: string | null
          id?: string
          kind?: string
          last_heartbeat_at?: string
          lesson_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          color: string | null
          created_at: string
          group_id: string | null
          icon: string | null
          id: string
          is_preset: boolean
          owner_id: string | null
          position: number
          title: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          group_id?: string | null
          icon?: string | null
          id?: string
          is_preset?: boolean
          owner_id?: string | null
          position?: number
          title: string
        }
        Update: {
          color?: string | null
          created_at?: string
          group_id?: string | null
          icon?: string | null
          id?: string
          is_preset?: boolean
          owner_id?: string | null
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topics_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "topic_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_groups: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_preset: boolean
          key: string | null
          owner_id: string | null
          position: number
          title: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_preset?: boolean
          key?: string | null
          owner_id?: string | null
          position?: number
          title: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_preset?: boolean
          key?: string | null
          owner_id?: string | null
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_pool: {
        Row: {
          author: string | null
          category: string
          created_at: string
          id: string
          is_active: boolean
          scraped_at: string
          source: string
          thumbnail_url: string | null
          title: string | null
          video_id: string
        }
        Insert: {
          author?: string | null
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          scraped_at?: string
          source?: string
          thumbnail_url?: string | null
          title?: string | null
          video_id: string
        }
        Update: {
          author?: string | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          scraped_at?: string
          source?: string
          thumbnail_url?: string | null
          title?: string | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_pool_category_fk"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_heartbeat_delta: {
        Args: {
          p_session_id: string
          p_user_id: string
          p_delta: number
          p_label: string
          p_ref_id: string
          p_now: string
        }
        Returns: Json
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

