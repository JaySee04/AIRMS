'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
export default function AdminDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['admin']}>
      <div className="page-header"><h1>Data Upload</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/admin/data-upload.html</code></p></div>
    </DashboardLayout>
  );
}
