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
      alerts: {
        Row: {
          active: boolean
          coingecko_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          last_triggered_at: string | null
          one_shot: boolean
          symbol: string | null
          threshold: number
          user_id: string
        }
        Insert: {
          active?: boolean
          coingecko_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          last_triggered_at?: string | null
          one_shot?: boolean
          symbol?: string | null
          threshold: number
          user_id: string
        }
        Update: {
          active?: boolean
          coingecko_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          last_triggered_at?: string | null
          one_shot?: boolean
          symbol?: string | null
          threshold?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          amount: number
          avg_cost: number
          coingecko_id: string | null
          created_at: string
          id: string
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          avg_cost?: number
          coingecko_id?: string | null
          created_at?: string
          id?: string
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          avg_cost?: number
          coingecko_id?: string | null
          created_at?: string
          id?: string
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics_cache: {
        Row: {
          expires_at: string
          key: string
          payload: Json
          updated_at: string
        }
        Insert: {
          expires_at: string
          key: string
          payload: Json
          updated_at?: string
        }
        Update: {
          expires_at?: string
          key?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      news_cache: {
        Row: {
          click_count: number
          cluster_id: string | null
          fetched_at: string
          id: string
          image_url: string | null
          importance_score: number
          published_at: string
          sentiment: string | null
          source: string
          summary: string | null
          summary_uk: string | null
          tags: string[]
          title: string
          title_uk: string | null
          url: string
        }
        Insert: {
          click_count?: number
          cluster_id?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          importance_score?: number
          published_at: string
          sentiment?: string | null
          source: string
          summary?: string | null
          summary_uk?: string | null
          tags?: string[]
          title: string
          title_uk?: string | null
          url: string
        }
        Update: {
          click_count?: number
          cluster_id?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          importance_score?: number
          published_at?: string
          sentiment?: string | null
          source?: string
          summary?: string | null
          summary_uk?: string | null
          tags?: string[]
          title?: string
          title_uk?: string | null
          url?: string
        }
        Relationships: []
      }
      news_clusters: {
        Row: {
          headline: string
          id: string
          sentiment_avg: string | null
          story_count: number
          summary_uk: string | null
          tags: string[]
          topic: string | null
          updated_at: string
        }
        Insert: {
          headline: string
          id?: string
          sentiment_avg?: string | null
          story_count?: number
          summary_uk?: string | null
          tags?: string[]
          topic?: string | null
          updated_at?: string
        }
        Update: {
          headline?: string
          id?: string
          sentiment_avg?: string | null
          story_count?: number
          summary_uk?: string | null
          tags?: string[]
          topic?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      point_events: {
        Row: {
          created_at: string
          delta: number
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta?: number
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          breakdown: Json
          id: string
          taken_at: string
          total_value: number
          user_id: string
        }
        Insert: {
          breakdown?: Json
          id?: string
          taken_at?: string
          total_value: number
          user_id: string
        }
        Update: {
          breakdown?: Json
          id?: string
          taken_at?: string
          total_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_color: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          lang: string
          theme: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          lang?: string
          theme?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          lang?: string
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      tg_users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          first_name: string | null
          id: string
          lang: string | null
          last_name: string | null
          last_seen_at: string
          photo_url: string | null
          telegram_id: number | null
          username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          lang?: string | null
          last_name?: string | null
          last_seen_at?: string
          photo_url?: string | null
          telegram_id?: number | null
          username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          lang?: string | null
          last_name?: string | null
          last_seen_at?: string
          photo_url?: string | null
          telegram_id?: number | null
          username?: string | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          amount: number
          coingecko_id: string | null
          created_at: string
          executed_at: string
          fee: number
          id: string
          note: string | null
          price: number
          side: Database["public"]["Enums"]["trade_side"]
          symbol: string
          user_id: string
        }
        Insert: {
          amount: number
          coingecko_id?: string | null
          created_at?: string
          executed_at?: string
          fee?: number
          id?: string
          note?: string | null
          price?: number
          side: Database["public"]["Enums"]["trade_side"]
          symbol: string
          user_id: string
        }
        Update: {
          amount?: number
          coingecko_id?: string | null
          created_at?: string
          executed_at?: string
          fee?: number
          id?: string
          note?: string | null
          price?: number
          side?: Database["public"]["Enums"]["trade_side"]
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_cache: {
        Row: {
          created_at: string
          key: string
          kind: string
          text_uk: string
        }
        Insert: {
          created_at?: string
          key: string
          kind?: string
          text_uk: string
        }
        Update: {
          created_at?: string
          key?: string
          kind?: string
          text_uk?: string
        }
        Relationships: []
      }
      user_points: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          coingecko_id: string
          created_at: string
          id: string
          position: number
          symbol: string
          user_id: string
        }
        Insert: {
          coingecko_id: string
          created_at?: string
          id?: string
          position?: number
          symbol: string
          user_id: string
        }
        Update: {
          coingecko_id?: string
          created_at?: string
          id?: string
          position?: number
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_point: {
        Args: { _cooldown_seconds?: number; _delta?: number; _reason?: string }
        Returns: Json
      }
      bump_news_click: { Args: { _id: string }; Returns: undefined }
      current_tg_id: { Args: never; Returns: number }
      ensure_app_user: { Args: never; Returns: string }
    }
    Enums: {
      alert_kind:
        | "price_above"
        | "price_below"
        | "pct_change_24h_above"
        | "pct_change_24h_below"
        | "btc_dominance_cross"
        | "fear_greed_cross"
      trade_side: "buy" | "sell" | "transfer_in" | "transfer_out"
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
      alert_kind: [
        "price_above",
        "price_below",
        "pct_change_24h_above",
        "pct_change_24h_below",
        "btc_dominance_cross",
        "fear_greed_cross",
      ],
      trade_side: ["buy", "sell", "transfer_in", "transfer_out"],
    },
  },
} as const
