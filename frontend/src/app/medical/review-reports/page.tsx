'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/medical/review-reports.html
// GET /api/self-reports?status=Pending — queue
// PATCH /api/self-reports/:id/review — approve/reject
export default function ReviewReportsPage() {
  return (
    <DashboardLayout allowedRoles={['medical']}>
      <div className="page-header"><h1>Review Self-Reports</h1></div>
      <div className="placeholder-notice"><p>Convert from <code>airms-prototype/medical/review-reports.html</code></p></div>
    </DashboardLayout>
  );
}
