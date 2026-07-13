'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getProfile, type Profile } from './profile';

type AuthCtx = {
  user: User | null;
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  refreshProfile: () => void;
  loading: boolean;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  profile: null,
  setProfile: () => {},
  refreshProfile: () => {},
  loading: true,
});

/**
 * Initialize the 3-day free trial if the user doesn't have one yet.
 * Fails silently if DB columns don't exist yet (migration not run).
 */
async function initTrialIfNeeded(userId: string) {
  try {
    // Only try if DB supports the column — wrap in try/catch
    const { data, error } = await supabase
      .from('profiles')
      .select('trial_ends_at')
      .eq('id', userId)
      .single();

    // If column doesn't exist, Supabase returns a 42703 error — skip gracefully
    if (error?.code === '42703') return;
    if (error) return;

    if (!data?.trial_ends_at) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 3); // 3-day free trial
      await supabase
        .from('profiles')
        .update({
          trial_ends_at: trialEnd.toISOString(),
          subscription_status: 'trial',
          subscription_minutes_remaining: 0,
          total_minutes_used: 0,
        })
        .eq('id', userId);
    }
  } catch {
    // Silently skip — don't block profile loading
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileData = useCallback(async (userId: string) => {
    try {
      // Initialize trial on first login (no-op if already set or migration not run)
      await initTrialIfNeeded(userId);
      const p = await getProfile(userId);
      setProfile(p);
    } catch (e) {
      console.warn('[auth] could not fetch profile:', e);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        fetchProfileData(sessionUser.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        fetchProfileData(sessionUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchProfileData]);

  const refreshProfile = useCallback(() => {
    if (user?.id) fetchProfileData(user.id);
  }, [user?.id, fetchProfileData]);

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, refreshProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
