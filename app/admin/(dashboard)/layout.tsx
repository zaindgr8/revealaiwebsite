import type { Metadata } from 'next';
import { requireAdminSession } from '@/lib/admin-auth';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();
  return <AdminShell>{children}</AdminShell>;
}
