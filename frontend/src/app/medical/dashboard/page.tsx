'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';

// TODO: Convert airms-prototype/medical/dashboard.html to React components
// Key sections:
//   - Athlete search + sport/program filter (GET /api/athletes)
//   - Selected athlete detail card with risk chart + workload chart + body map
//   - Injury history table (GET /api/injuries/athlete/:id)
//   - Quick-log injury action

export default function MedicalDashboard() {
  return (
    <DashboardLayout allowedRoles={['medical']}>
      <div className="page-header">
        <h1>Athlete Monitor</h1>
        <p className="text-muted">Search and review individual athlete health data</p>
      </div>
      <div className="placeholder-notice">
        <p>Medical dashboard — convert from <code>airms-prototype/medical/dashboard.html</code></p>
      </div>
    </DashboardLayout>
  );
}
