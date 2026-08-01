// Medical · Cohort Norms. Same page as the admin Cohort Norms view, mounted
// under /medical so it respects the role-based URL convention. The shared
// component gates admin-only controls (settings, notifications, queue
// governance) by role and allows norm-editing for medical staff who hold the
// editCohortNorms capability (backend enforces it either way).
export { default } from '../../admin/thresholds/page';
