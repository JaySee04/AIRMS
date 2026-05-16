'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/athlete/injury-report.html
// POST /api/self-reports — submit, GET /api/self-reports/mine — view status
export default function InjuryReportPage() {
  return (
    <DashboardLayout allowedRoles={['athlete']}>
      <div className="page-header"><h1>Report an Injury</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/athlete/injury-report.html</code></p></div>
    </DashboardLayout>
  );
}
