'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/medical/injury-log.html
// POST /api/injuries — log injury, GET /api/injuries — list
export default function InjuryLogPage() {
  return (
    <DashboardLayout allowedRoles={['medical']}>
      <div className="page-header"><h1>Injury Log</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/medical/injury-log.html</code></p></div>
    </DashboardLayout>
  );
}
