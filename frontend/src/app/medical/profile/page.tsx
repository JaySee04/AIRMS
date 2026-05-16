'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
export default function MedicalProfile() {
  return (
    <DashboardLayout allowedRoles={['medical']}>
      <div className="page-header"><h1>My Profile</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/medical/profile.html</code></p></div>
    </DashboardLayout>
  );
}
