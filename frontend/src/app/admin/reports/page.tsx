'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/admin/reports.html
export default function AdminReportsPage() {
  return (
    <DashboardLayout allowedRoles={['admin']} title="PDF Reports">
      <div className="placeholder-notice">
        <p>PDF reports — convert from <code>airms-prototype/admin/reports.html</code></p>
      </div>
    </DashboardLayout>
  );
}
