'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';
import PdfScreeningUpload from '@/components/upload/PdfScreeningUpload';
import DataBackupCard from '@/components/upload/DataBackupCard';

export default function AdminDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['admin']} title="Data Uploading">
      <PdfScreeningUpload />
      <div style={{ height: 28 }} />
      <DataBackupCard />
    </DashboardLayout>
  );
}
