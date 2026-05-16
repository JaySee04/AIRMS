'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
// TODO: Convert airms-prototype/medical/review-reports.html
export default function ReviewReportsPage() {
  return (
    <DashboardLayout allowedRoles={['medical']} title="Self-Report Review">
      <div className="placeholder-notice">
        <p>Self-report review — convert from <code>airms-prototype/medical/review-reports.html</code></p>
      </div>
    </DashboardLayout>
  );
}
