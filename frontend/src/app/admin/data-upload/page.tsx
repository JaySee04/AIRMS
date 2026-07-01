'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';
import ScreeningUpload from '@/components/upload/ScreeningUpload';
import PdfScreeningUpload from '@/components/upload/PdfScreeningUpload';
import DataBackupCard from '@/components/upload/DataBackupCard';

export default function AdminDataUploadPage() {
  return (
    <DashboardLayout allowedRoles={['admin']} title="Data Uploading">
      <ScreeningUpload allowedRole="admin" title="Admin · Data Uploading" />
      <div style={{ height: 28 }} />
      <PdfScreeningUpload />
      <div style={{ height: 28 }} />
      <DataBackupCard />
    </DashboardLayout>
  );
}
