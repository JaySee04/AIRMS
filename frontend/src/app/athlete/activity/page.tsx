'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/athlete/activity.html
// POST /api/activities — log new session, GET /api/activities/athlete/:id — history
export default function ActivityPage() {
  return (
    <DashboardLayout allowedRoles={['athlete']}>
      <div className="page-header"><h1>Activity Log</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/athlete/activity.html</code></p></div>
    </DashboardLayout>
  );
}
