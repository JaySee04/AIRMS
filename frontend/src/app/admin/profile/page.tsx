'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/admin/profile.html
export default function AdminProfile() {
  return (
    <DashboardLayout allowedRoles={['admin']} title="My Profile">
      <div className="placeholder-notice">
        <p>Admin profile — convert from <code>airms-prototype/admin/profile.html</code></p>
      </div>
    </DashboardLayout>
  );
}
