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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      chess_lobbies: {
        Row: {
          coaching_mode: boolean
          created_at: string
          elo_level: string | null
          host_name: string
          id: string
          increment: number
          minutes: number
          opponent_name: string | null
          status: string
          time_control: string
        }
        Insert: {
          coaching_mode?: boolean
          created_at?: string
          elo_level?: string | null
          host_name: string
          id?: string
          increment?: number
          minutes?: number
          opponent_name?: string | null
          status?: string
          time_control: string
        }
        Update: {
          coaching_mode?: boolean
          created_at?: string
          elo_level?: string | null
          host_name?: string
          id?: string
          increment?: number
          minutes?: number
          opponent_name?: string | null
          status?: string
          time_control?: string
        }
        Relationships: []
      }
      bot_profiles: {
        Row: {
          book: Json
          created_at: string
          elo_target: number
          id: string
          name: string
          style: Json
        }
        Insert: {
          book: Json
          created_at?: string
          elo_target: number
          id?: string
          name: string
          style: Json
        }
        Update: {
          book?: Json
          created_at?: string
          elo_target?: number
          id?: string
          name?: string
          style?: Json
        }
        Relationships: []
      }
      puzzles: {
        Row: {
          best_line: Json
          created_at: string
          fen: string
          id: string
          source: string
          theme: string[]
        }
        Insert: {
          best_line: Json
          created_at?: string
          fen: string
          id?: string
          source?: string
          theme?: string[]
        }
        Update: {
          best_line?: Json
          created_at?: string
          fen?: string
          id?: string
          source?: string
          theme?: string[]
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          created_at: string
          created_by: string | null
          current_round: number
          description: string | null
          ends_at: string | null
          format: 'swiss' | 'arena'
          id: string
          is_rated: boolean
          name: string
          settings: Json
          starts_at: string | null
          status: 'draft' | 'ongoing' | 'completed' | 'archived' | 'cancelled'
          time_control: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_round?: number
          description?: string | null
          ends_at?: string | null
          format?: 'swiss' | 'arena'
          id?: string
          is_rated?: boolean
          name: string
          settings?: Json
          starts_at?: string | null
          status?: 'draft' | 'ongoing' | 'completed' | 'archived' | 'cancelled'
          time_control?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_round?: number
          description?: string | null
          ends_at?: string | null
          format?: 'swiss' | 'arena'
          id?: string
          is_rated?: boolean
          name?: string
          settings?: Json
          starts_at?: string | null
          status?: 'draft' | 'ongoing' | 'completed' | 'archived' | 'cancelled'
          time_control?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tournaments_created_by_fkey'
            columns: ['created_by']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      tournament_players: {
        Row: {
          draws: number
          flags: Json
          id: string
          joined_at: string
          last_active_at: string | null
          losses: number
          player_id: string
          provisional_rating: boolean
          rating: number | null
          score: number
          streak: number
          tournament_id: string
          wins: number
        }
        Insert: {
          draws?: number
          flags?: Json
          id?: string
          joined_at?: string
          last_active_at?: string | null
          losses?: number
          player_id: string
          provisional_rating?: boolean
          rating?: number | null
          score?: number
          streak?: number
          tournament_id: string
          wins?: number
        }
        Update: {
          draws?: number
          flags?: Json
          id?: string
          joined_at?: string
          last_active_at?: string | null
          losses?: number
          player_id?: string
          provisional_rating?: boolean
          rating?: number | null
          score?: number
          streak?: number
          tournament_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: 'tournament_players_player_id_fkey'
            columns: ['player_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tournament_players_tournament_id_fkey'
            columns: ['tournament_id']
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          }
        ]
      }
      pairings: {
        Row: {
          black_id: string | null
          board: number
          completed_at: string | null
          created_at: string
          id: string
          metadata: Json
          result_status: 'pending' | 'reported' | 'validated' | 'under_review' | 'cancelled'
          round: number
          started_at: string | null
          tournament_id: string
          white_id: string | null
        }
        Insert: {
          black_id?: string | null
          board: number
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          result_status?: 'pending' | 'reported' | 'validated' | 'under_review' | 'cancelled'
          round: number
          started_at?: string | null
          tournament_id: string
          white_id?: string | null
        }
        Update: {
          black_id?: string | null
          board?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          result_status?: 'pending' | 'reported' | 'validated' | 'under_review' | 'cancelled'
          round?: number
          started_at?: string | null
          tournament_id?: string
          white_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'pairings_black_id_fkey'
            columns: ['black_id']
            referencedRelation: 'tournament_players'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pairings_tournament_id_fkey'
            columns: ['tournament_id']
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pairings_white_id_fkey'
            columns: ['white_id']
            referencedRelation: 'tournament_players'
            referencedColumns: ['id']
          }
        ]
      }
      results: {
        Row: {
          accuracy: Json | null
          black_score: number
          flagged: boolean
          id: string
          move_times: Json | null
          notes: string | null
          outcome: 'white' | 'black' | 'draw' | 'bye' | 'double_forfeit'
          pairing_id: string
          player_metrics: Json
          rating_diff: Json | null
          reported_at: string
          reported_by: string | null
          suspicious_accuracy: boolean
          suspicious_timing: boolean
          tournament_id: string
          white_score: number
        }
        Insert: {
          accuracy?: Json | null
          black_score?: number
          flagged?: boolean
          id?: string
          move_times?: Json | null
          notes?: string | null
          outcome: 'white' | 'black' | 'draw' | 'bye' | 'double_forfeit'
          pairing_id: string
          player_metrics?: Json
          rating_diff?: Json | null
          reported_at?: string
          reported_by?: string | null
          suspicious_accuracy?: boolean
          suspicious_timing?: boolean
          tournament_id: string
          white_score?: number
        }
        Update: {
          accuracy?: Json | null
          black_score?: number
          flagged?: boolean
          id?: string
          move_times?: Json | null
          notes?: string | null
          outcome?: 'white' | 'black' | 'draw' | 'bye' | 'double_forfeit'
          pairing_id?: string
          player_metrics?: Json
          rating_diff?: Json | null
          reported_at?: string
          reported_by?: string | null
          suspicious_accuracy?: boolean
          suspicious_timing?: boolean
          tournament_id?: string
          white_score?: number
        }
        Relationships: [
          {
            foreignKeyName: 'results_pairing_id_fkey'
            columns: ['pairing_id']
            referencedRelation: 'pairings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'results_reported_by_fkey'
            columns: ['reported_by']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'results_tournament_id_fkey'
            columns: ['tournament_id']
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
