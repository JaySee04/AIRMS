'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';
import PdfScreeningUpload from '@/components/upload/PdfScreeningUpload';

export default function MedicalDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['medical']} requiredPermission="uploadData" title="Screening Import">
      <PdfScreeningUpload />
    </DashboardLayout>
  );
}
