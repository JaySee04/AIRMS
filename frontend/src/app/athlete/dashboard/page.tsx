'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';

// TODO: Convert airms-prototype/athlete/dashboard.html to React components
// Key sections to implement:
//   - ACWR hero card (GET /api/activities/athlete/:id/acwr)
//   - Weekly load trend chart (Chart.js)
//   - Risk indicators radar/bar chart
//   - Muscle assessment body map (port bodymap.js → React SVG component)
//   - Activity log table (GET /api/activities/athlete/:id?weeks=1)
//   - Injury history (GET /api/injuries/athlete/:id)

export default function AthleteDashboard() {
  return (
    <DashboardLayout allowedRoles={['athlete']}>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="text-muted">Your workload, risk indicators and injury history</p>
      </div>
      <div className="placeholder-notice">
        <p>Athlete dashboard — convert from <code>airms-prototype/athlete/dashboard.html</code></p>
      </div>
    </DashboardLayout>
  );
}
