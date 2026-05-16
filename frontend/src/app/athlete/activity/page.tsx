'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/athlete/activity.html
export default function ActivityPage() {
  return (
    <DashboardLayout allowedRoles={['athlete']} title="Activity Tracking">
      <div className="placeholder-notice">
        <p>Activity tracking — convert from <code>airms-prototype/athlete/activity.html</code></p>
      </div>
    </DashboardLayout>
  );
}
