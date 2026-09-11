import { COLORS } from '@/lib/theme';
import { getAllUsers } from '@/lib/admin-data';
import { SetupNeeded } from '@/components/admin/SetupNeeded';
import { UsersTable } from '@/components/admin/UsersTable';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  let users;
  try {
    users = await getAllUsers();
  } catch (err) {
    return <SetupNeeded message={(err as Error).message} />;
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 4px', fontFamily: 'var(--font-syne)', letterSpacing: '-0.4px' }}>
          Users
        </h1>
        <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: 0 }}>
          Every registered account — trial status, subscription, usage, and engagement.
        </p>
      </div>

      <UsersTable users={users} />
    </div>
  );
}
