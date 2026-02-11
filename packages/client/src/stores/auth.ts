import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import type { Profile } from "@datchat/shared";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    // Get current session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      set({
        session,
        user: session.user,
        profile: profile as Profile | null,
        loading: false,
      });
    } else {
      set({ loading: false });
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        set({
          session,
          user: session.user,
          profile: profile as Profile | null,
        });
      } else if (event === "SIGNED_OUT") {
        set({ session: null, user: null, profile: null });
      }
    });
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  },

  register: async (email, password, username) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) throw error;
  },

  logout: async () => {
    try {
      const currentUserId = get().user?.id;
      if (currentUserId) {
        await supabase.from("profiles").update({ status: "offline" }).eq("id", currentUserId);
      }

      await supabase.auth.signOut();
      // Reset state immediately
      set({ session: null, user: null, profile: null });
    } catch (error) {
      console.error("Logout error:", error);
      // Force reset even if signOut fails
      set({ session: null, user: null, profile: null });
    }
  },

  updateProfile: async (updates) => {
    const user = get().user;
    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw error;
    set({ profile: data as Profile });
  },
}));
