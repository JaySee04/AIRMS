'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/admin/reports.html — PDF report builder
export default function AdminReportsPage() {
  return (
    <DashboardLayout allowedRoles={['admin']}>
      <div className="page-header"><h1>Reports</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/admin/reports.html</code></p></div>
    </DashboardLayout>
  );
}
