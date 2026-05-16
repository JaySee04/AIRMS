'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/medical/dashboard.html
export default function MedicalDashboard() {
  return (
    <DashboardLayout allowedRoles={['medical']} title="Athlete Dashboard">
      <div className="placeholder-notice">
        <p>Medical dashboard — convert from <code>airms-prototype/medical/dashboard.html</code></p>
      </div>
    </DashboardLayout>
  );
}
