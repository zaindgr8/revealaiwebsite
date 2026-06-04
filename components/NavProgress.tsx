'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { COLORS } from '@/lib/theme';

export function NavProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    setProgress(15);
    const t1 = setTimeout(() => setProgress(60), 120);
    const t2 = setTimeout(() => setProgress(85), 400);
    const t3 = setTimeout(() => {
      setProgress(100);
      setTimeout(() => setVisible(false), 200);
    }, 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [pathname]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 2.5,
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.green})`,
          boxShadow: `0 0 10px ${COLORS.blue}`,
          transition: 'width 0.25s ease',
        }}
      />
    </div>
  );
}
