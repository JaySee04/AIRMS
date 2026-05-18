'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';
import ScreeningUpload from '@/components/upload/ScreeningUpload';

export default function MedicalDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['medical']} title="Data Uploading">
      <ScreeningUpload allowedRole="medical" title="Medical · Data Uploading" />
    </DashboardLayout>
  );
}
