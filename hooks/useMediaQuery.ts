'use client';
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string, fallback = false) {
  const [matches, setMatches] = useState(fallback);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 768px)');
}
