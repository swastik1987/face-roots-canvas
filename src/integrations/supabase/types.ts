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
      analyses: {
        Row: {
          card_storage_path: string | null
          completed_at: string | null
          error_message: string | null
          id: string
          model_versions: Json | null
          self_person_id: string
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          card_storage_path?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          model_versions?: Json | null
          self_person_id: string
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          card_storage_path?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          model_versions?: Json | null
          self_person_id?: string
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_self_person_id_fkey"
            columns: ["self_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          ip_hash: string | null
          policy_version: string
          scopes: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          ip_hash?: string | null
          policy_version: string
          scopes: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          ip_hash?: string | null
          policy_version?: string
          scopes?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      face_embeddings: {
        Row: {
          created_at: string | null
          embedding: string
          face_image_id: string
          id: string
          model_version: string
          person_id: string
          quality_score: number | null
        }
        Insert: {
          created_at?: string | null
          embedding: string
          face_image_id: string
          id?: string
          model_version: string
          person_id: string
          quality_score?: number | null
        }
        Update: {
          created_at?: string | null
          embedding?: string
          face_image_id?: string
          id?: string
          model_version?: string
          person_id?: string
          quality_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "face_embeddings_face_image_id_fkey"
            columns: ["face_image_id"]
            isOneToOne: false
            referencedRelation: "face_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_embeddings_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      face_images: {
        Row: {
          angle: string
          blur_score: number | null
          capture_method: string
          created_at: string | null
          expires_at: string | null
          face_confidence: number | null
          height: number | null
          id: string
          nsfw_score: number | null
          person_id: string
          storage_path: string
          width: number | null
        }
        Insert: {
          angle: string
          blur_score?: number | null
          capture_method: string
          created_at?: string | null
          expires_at?: string | null
          face_confidence?: number | null
          height?: number | null
          id?: string
          nsfw_score?: number | null
          person_id: string
          storage_path: string
          width?: number | null
        }
        Update: {
          angle?: string
          blur_score?: number | null
          capture_method?: string
          created_at?: string | null
          expires_at?: string | null
          face_confidence?: number | null
          height?: number | null
          id?: string
          nsfw_score?: number | null
          person_id?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "face_images_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      face_landmarks: {
        Row: {
          created_at: string | null
          face_image_id: string
          id: string
          landmarks_json: Json
          pose_pitch: number | null
          pose_roll: number | null
          pose_yaw: number | null
        }
        Insert: {
          created_at?: string | null
          face_image_id: string
          id?: string
          landmarks_json: Json
          pose_pitch?: number | null
          pose_roll?: number | null
          pose_yaw?: number | null
        }
        Update: {
          created_at?: string | null
          face_image_id?: string
          id?: string
          landmarks_json?: Json
          pose_pitch?: number | null
          pose_roll?: number | null
          pose_yaw?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "face_landmarks_face_image_id_fkey"
            columns: ["face_image_id"]
            isOneToOne: false
            referencedRelation: "face_images"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_embeddings: {
        Row: {
          created_at: string | null
          crop_storage_path: string | null
          embedding: string
          face_image_id: string
          feature_type: string
          id: string
          model_version: string
          person_id: string
          quality_score: number | null
        }
        Insert: {
          created_at?: string | null
          crop_storage_path?: string | null
          embedding: string
          face_image_id: string
          feature_type: string
          id?: string
          model_version: string
          person_id: string
          quality_score?: number | null
        }
        Update: {
          created_at?: string | null
          crop_storage_path?: string | null
          embedding?: string
          face_image_id?: string
          feature_type?: string
          id?: string
          model_version?: string
          person_id?: string
          quality_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_embeddings_face_image_id_fkey"
            columns: ["face_image_id"]
            isOneToOne: false
            referencedRelation: "face_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_embeddings_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_matches: {
        Row: {
          analysis_id: string
          created_at: string | null
          feature_type: string
          id: string
          llm_verdict: string | null
          runners_up: Json | null
          winner_confidence: number | null
          winner_person_id: string | null
          winner_similarity: number | null
        }
        Insert: {
          analysis_id: string
          created_at?: string | null
          feature_type: string
          id?: string
          llm_verdict?: string | null
          runners_up?: Json | null
          winner_confidence?: number | null
          winner_person_id?: string | null
          winner_similarity?: number | null
        }
        Update: {
          analysis_id?: string
          created_at?: string | null
          feature_type?: string
          id?: string
          llm_verdict?: string | null
          runners_up?: Json | null
          winner_confidence?: number | null
          winner_person_id?: string | null
          winner_similarity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_matches_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_matches_winner_person_id_fkey"
            columns: ["winner_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          birth_year_approx: number | null
          created_at: string | null
          display_name: string
          generation: number
          id: string
          is_self: boolean
          owner_user_id: string
          relationship_tag: string
        }
        Insert: {
          birth_year_approx?: number | null
          created_at?: string | null
          display_name: string
          generation?: number
          id?: string
          is_self?: boolean
          owner_user_id: string
          relationship_tag: string
        }
        Update: {
          birth_year_approx?: number | null
          created_at?: string | null
          display_name?: string
          generation?: number
          id?: string
          is_self?: boolean
          owner_user_id?: string
          relationship_tag?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age_attested_18_plus: boolean | null
          age_attested_at: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          locale: string | null
          plan: string | null
        }
        Insert: {
          age_attested_18_plus?: boolean | null
          age_attested_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          locale?: string | null
          plan?: string | null
        }
        Update: {
          age_attested_18_plus?: boolean | null
          age_attested_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          locale?: string | null
          plan?: string | null
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          created_at: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      verdict_cache: {
        Row: {
          created_at: string | null
          feature_type: string
          model_version: string
          user_crop_hash: string
          verdict: string
          winner_crop_hash: string
        }
        Insert: {
          created_at?: string | null
          feature_type: string
          model_version?: string
          user_crop_hash: string
          verdict: string
          winner_crop_hash: string
        }
        Update: {
          created_at?: string | null
          feature_type?: string
          model_version?: string
          user_crop_hash?: string
          verdict?: string
          winner_crop_hash?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_feature_embeddings: {
        Args: {
          family_person_ids: string[]
          feature_type_filter: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          person_id: string
          similarity: number
        }[]
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
