'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';

// TODO: Convert airms-prototype/admin/dashboard.html to React components
// Key sections:
//   - Multi-filter bar (sport, program, gender, body part, date range)
//   - KPI cards (GET /api/injuries/analytics/summary)
//   - Injuries by body part bar chart
//   - Injuries by type doughnut chart
//   - Monthly trend line chart
//   - Severity/side distribution charts
//   - Gender breakdown chart

export default function AdminDashboard() {
  return (
    <DashboardLayout allowedRoles={['admin']}>
      <div className="page-header">
        <h1>Injury Analytics</h1>
        <p className="text-muted">System-wide injury trends across all sports and programs</p>
      </div>
      <div className="placeholder-notice">
        <p>Admin analytics — convert from <code>airms-prototype/admin/dashboard.html</code></p>
      </div>
    </DashboardLayout>
  );
}
