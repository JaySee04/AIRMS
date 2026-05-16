'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/medical/profile.html
export default function MedicalProfile() {
  return (
    <DashboardLayout allowedRoles={['medical']} title="My Profile">
      <div className="placeholder-notice">
        <p>Medical profile — convert from <code>airms-prototype/medical/profile.html</code></p>
      </div>
    </DashboardLayout>
  );
}
