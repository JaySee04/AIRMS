'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/medical/data-upload.html
// POST /api/upload/screening — multipart Excel upload
export default function MedicalDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['medical']}>
      <div className="page-header"><h1>Data Upload</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/medical/data-upload.html</code></p></div>
    </DashboardLayout>
  );
}
