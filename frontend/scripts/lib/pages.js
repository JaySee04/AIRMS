// EVERY AUTHENTICATED PAGE, AND A ROLE THAT CAN REACH IT.
//
// One definition, because there are now two browser sweeps that need it
// (verify:contrast and verify:a11y) and a second hand-kept copy is how the first
// one went wrong: it named `/executive/dashboard`, a route that has never
// existed — `executive` has no pages of its own and lands on /admin/dashboard —
// so the audit swept Next's 404 page and counted it clean, while missing ten
// real pages. "Eleven pages" was ten of twenty-one (§121.8).
//
// src/app/contrastPages.test.ts reads THIS file and fails if it and src/app
// disagree in either direction, or if a page is listed under a role its own
// `allowedRoles` refuses.

const PAGES = [
  // admin + executive read the same analytics surfaces; executive is the
  // read-only one, so it renders FEWER controls — swept under both, because the
  // difference is exactly the buttons an audit cares about.
  ['admin', '/admin/dashboard'], ['executive', '/admin/dashboard'],
  ['admin', '/admin/activity'], ['executive', '/admin/activity'],
  ['admin', '/admin/audit'], ['executive', '/admin/audit'],
  ['admin', '/admin/reports'], ['executive', '/admin/reports'],
  ['admin', '/admin/profile'], ['executive', '/admin/profile'],
  ['admin', '/admin/data-upload'],
  ['admin', '/admin/personnel'],
  ['admin', '/admin/settings'],
  ['admin', '/admin/thresholds'], ['medical', '/admin/thresholds'],
  // /medical/cohort-norms re-exports /admin/thresholds, so it is the same tree
  // under a different URL — swept anyway, because the layout it mounts under is
  // the medical one.
  ['medical', '/medical/cohort-norms'],
  ['medical', '/medical/dashboard'], ['medical', '/medical/data-upload'],
  ['medical', '/medical/profile'],
  ['coach', '/coach/dashboard'], ['coach', '/coach/reports'],
  ['coach', '/coach/profile'],
  ['athlete', '/athlete/dashboard'], ['athlete', '/athlete/history'],
  ['athlete', '/athlete/squad'], ['athlete', '/athlete/profile'],
];

/** Routes with no DashboardLayout — sign-in and the account-recovery flow. */
const PUBLIC_ROUTES = ['/', '/activate', '/forgot-password', '/reset-password', '/verify-otp'];

module.exports = { PAGES, PUBLIC_ROUTES };
