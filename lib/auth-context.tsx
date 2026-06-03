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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileData = useCallback(async (userId: string) => {
    try {
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
