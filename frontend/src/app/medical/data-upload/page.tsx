'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';
import ScreeningUpload from '@/components/upload/ScreeningUpload';
import PdfScreeningUpload from '@/components/upload/PdfScreeningUpload';

export default function MedicalDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['medical']} requiredPermission="uploadData" title="Data Uploading">
      <ScreeningUpload allowedRole="medical" title="Medical · Data Uploading" />
      <div style={{ height: 28 }} />
      <PdfScreeningUpload />
    </DashboardLayout>
  );
}
