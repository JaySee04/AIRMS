'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/medical/data-upload.html
export default function MedicalDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['medical']} title="Data Uploading">
      <div className="placeholder-notice">
        <p>Data uploading — convert from <code>airms-prototype/medical/data-upload.html</code></p>
      </div>
    </DashboardLayout>
  );
}
