'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/medical/injury-log.html
export default function InjuryLogPage() {
  return (
    <DashboardLayout allowedRoles={['medical']} title="Injury Logging">
      <div className="placeholder-notice">
        <p>Injury logging — convert from <code>airms-prototype/medical/injury-log.html</code></p>
      </div>
    </DashboardLayout>
  );
}
