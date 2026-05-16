'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/athlete/profile.html
export default function AthleteProfile() {
  return (
    <DashboardLayout allowedRoles={['athlete']} title="My Profile">
      <div className="placeholder-notice">
        <p>Athlete profile — convert from <code>airms-prototype/athlete/profile.html</code></p>
      </div>
    </DashboardLayout>
  );
}
