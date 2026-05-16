'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: GET /api/athletes/:id — athlete profile
export default function AthleteProfile() {
  return (
    <DashboardLayout allowedRoles={['athlete']}>
      <div className="page-header"><h1>My Profile</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/athlete/profile.html</code></p></div>
    </DashboardLayout>
  );
}
