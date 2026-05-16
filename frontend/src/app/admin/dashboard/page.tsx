'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/admin/dashboard.html
export default function AdminDashboard() {
  return (
    <DashboardLayout allowedRoles={['admin']} title="Injury Analytics">
      <div className="placeholder-notice">
        <p>Admin analytics — convert from <code>airms-prototype/admin/dashboard.html</code></p>
      </div>
    </DashboardLayout>
  );
}
