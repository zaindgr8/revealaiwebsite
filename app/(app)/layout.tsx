import { AuthGuard } from '@/components/AuthGuard';
import { AppNavigation } from '@/components/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppNavigation>{children}</AppNavigation>
    </AuthGuard>
  );
}
