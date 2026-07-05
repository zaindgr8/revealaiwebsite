'use client';

export function Logo({ size = 50 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Reveal AI"
      style={{ height: size, width: 'auto', display: 'block', objectFit: 'contain' }}
    />
  );
}

// Logo PNG is the full wordmark — this returns null to avoid duplicating the brand name
export function LogoText({ size = 22 }: { size?: number }) {
  void size;
  return null;
}
