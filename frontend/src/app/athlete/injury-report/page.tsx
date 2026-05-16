'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/athlete/injury-report.html
export default function InjuryReportPage() {
  return (
    <DashboardLayout allowedRoles={['athlete']} title="Injury Reporting">
      <div className="placeholder-notice">
        <p>Injury reporting — convert from <code>airms-prototype/athlete/injury-report.html</code></p>
      </div>
    </DashboardLayout>
  );
}
