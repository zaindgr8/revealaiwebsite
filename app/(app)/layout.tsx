import { AuthGuard } from '@/components/AuthGuard';
import { SessionDataProvider } from '@/lib/session-data';
import { AppNavigation } from '@/components/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SessionDataProvider>
        <AppNavigation>{children}</AppNavigation>
      </SessionDataProvider>
    </AuthGuard>
  );
}
