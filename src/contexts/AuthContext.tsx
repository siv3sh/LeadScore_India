import { createContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Workspace, Subscription } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  workspace: Workspace | null;
  subscription: Subscription | null;
  loading: boolean;
  signUp: (email: string, password: string, workspaceName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadWorkspaceData(userId: string) {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    setWorkspace(ws as Workspace | null);

    if (ws) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('workspace_id', ws.id)
        .maybeSingle();
      setSubscription(sub as Subscription | null);
    } else {
      setSubscription(null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadWorkspaceData(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      (async () => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await loadWorkspaceData(newSession.user.id);
        } else {
          setWorkspace(null);
          setSubscription(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function signUp(email: string, password: string, workspaceName: string) {
    // The workspace and its free subscription are created by the
    // on_auth_user_created trigger, which reads workspace_name from this
    // metadata. Doing it here would run before a session exists and be
    // rejected by RLS.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { workspace_name: workspaceName } },
    });
    if (error) return { error: error.message };

    if (!data.user) return { error: 'Sign up failed. Please try again.' };

    if (!data.session) {
      return { error: 'Check your email for a confirmation link to finish signing up.' };
    }

    return { error: null };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setWorkspace(null);
    setSubscription(null);
  }

  async function refreshWorkspace() {
    if (user) {
      await loadWorkspaceData(user.id);
    }
  }

  return (
    <AuthContext.Provider
      value={{ session, user, workspace, subscription, loading, signUp, signIn, signOut, refreshWorkspace }}
    >
      {children}
    </AuthContext.Provider>
  );
}
