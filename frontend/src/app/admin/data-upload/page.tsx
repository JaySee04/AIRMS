'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/admin/data-upload.html
export default function AdminDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['admin']} title="Data Uploading">
      <div className="placeholder-notice">
        <p>Data uploading — convert from <code>airms-prototype/admin/data-upload.html</code></p>
      </div>
    </DashboardLayout>
  );
}
