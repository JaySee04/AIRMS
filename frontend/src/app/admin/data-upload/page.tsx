'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';
import ScreeningUpload from '@/components/upload/ScreeningUpload';

export default function AdminDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['admin']} title="Data Uploading">
      <ScreeningUpload allowedRole="admin" title="Admin · Data Uploading" />
    </DashboardLayout>
  );
}
