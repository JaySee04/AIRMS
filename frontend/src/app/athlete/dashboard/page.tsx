'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/athlete/dashboard.html
export default function AthleteDashboard() {
  return (
    <DashboardLayout allowedRoles={['athlete']} title="My Dashboard">
      <div className="placeholder-notice">
        <p>Athlete dashboard — convert from <code>airms-prototype/athlete/dashboard.html</code></p>
      </div>
    </DashboardLayout>
  );
}
