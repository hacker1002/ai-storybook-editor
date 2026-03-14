import { create } from 'zustand';
import { supabase } from '@/apis/supabase';
import type { User } from '@/types/auth';
import type { Session } from '@supabase/supabase-js';
import { mapSupabaseUser } from '@/types/auth';
import { useBookStore } from './book-store';
import { useSnapshotStore } from './snapshot-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'AuthStore');

interface AuthStore {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    log.info('initialize', 'checking session');
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      log.info('initialize', 'session found', { userId: session.user.id });
      set({
        user: mapSupabaseUser(session.user),
        session,
        isAuthenticated: true,
        isInitialized: true,
      });
    } else {
      log.info('initialize', 'no session');
      set({ isInitialized: true });
    }

    // Subscribe to auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      log.info('initialize', 'auth state change', { event, hasSession: !!session });
      if (event === 'SIGNED_OUT' || !session) {
        set({ user: null, session: null, isAuthenticated: false });
      } else if (session?.user) {
        set({
          user: mapSupabaseUser(session.user),
          session,
          isAuthenticated: true,
        });
      }
    });
  },

  login: async (email, password) => {
    log.info('login', 'start', { email });
    set({ isLoading: true });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      log.error('login', 'failed', { email, error: error.message });
      set({ isLoading: false });
      return {
        error: error.message === 'Invalid login credentials'
          ? 'Email hoặc mật khẩu không đúng'
          : 'Đăng nhập thất bại. Vui lòng thử lại.',
      };
    }

    if (data.user) {
      log.info('login', 'success', { userId: data.user.id });
      set({
        user: mapSupabaseUser(data.user),
        session: data.session,
        isAuthenticated: true,
        isLoading: false,
      });
    }

    return {};
  },

  logout: async () => {
    log.info('logout', 'start');
    await supabase.auth.signOut();

    // Clear all data stores
    useBookStore.getState().clearBooks();
    useSnapshotStore.getState().resetSnapshot();

    log.info('logout', 'done');
    set({ user: null, session: null, isAuthenticated: false });
  },
}));
