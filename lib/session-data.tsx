'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth-context';
import { getRecentTherapySessions } from './ai';
import { ResourceCache } from './resource-cache';

const CacheContext = createContext<ResourceCache | null>(null);

export function SessionDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <AccountData key={user?.id ?? 'signed-out'}>{children}</AccountData>;
}

function AccountData({ children }: { children: React.ReactNode }) {
  const [cache] = useState(() => new ResourceCache());
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useEffect(() => {
    // These flows can mutate sessions or enrollment through their own APIs.
    // Revalidate only affected resources when leaving; retain their visible data.
    if (previousPath.current !== pathname) {
      if (/^\/(intent|chat|live)(\/|$)/.test(previousPath.current)) cache.get('history').invalidate();
      if (/^\/(intent|settings)(\/|$)/.test(previousPath.current)) cache.get('enrollment').invalidate();
      previousPath.current = pathname;
    }
  }, [cache, pathname]);
  useEffect(() => {
    const onChange = (event: Event) => {
      const key = (event as CustomEvent<unknown>).detail;
      if (typeof key === 'string') cache.get(key).invalidate();
      else cache.invalidate();
    };
    window.addEventListener('therapy-sessions-changed', onChange);
    window.addEventListener('focus', cache.invalidate);
    return () => {
      window.removeEventListener('therapy-sessions-changed', onChange);
      window.removeEventListener('focus', cache.invalidate);
    };
  }, [cache]);
  return <CacheContext.Provider value={cache}>{children}</CacheContext.Provider>;
}

export function useSessionResource<T>(key: string, loader: () => Promise<T>) {
  const cache = useContext(CacheContext);
  if (!cache) throw new Error('SessionDataProvider is required');
  const resource = cache.get<T>(key);
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  useEffect(() => { void resource.load(loader); }, [resource, loader]);
  const refresh = useCallback(() => resource.invalidate(), [resource]);
  return { ...snapshot, setData: resource.setData, refresh };
}

const loadCheckins = () => getRecentTherapySessions(60);
export function useCheckins() {
  return useSessionResource('checkins', loadCheckins);
}
