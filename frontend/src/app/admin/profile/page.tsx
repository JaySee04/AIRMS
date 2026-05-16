'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
export default function AdminProfile() {
  return (
    <DashboardLayout allowedRoles={['admin']}>
      <div className="page-header"><h1>My Profile</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/admin/profile.html</code></p></div>
    </DashboardLayout>
  );
}
