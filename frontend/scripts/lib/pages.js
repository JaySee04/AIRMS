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
  // Cohort Norms is ADMIN ONLY since §123. Two medical entries were removed
  // here — one for this route and one for the medical re-export of it, which is
  // deleted. Either would now sweep a redirect and report it clean, which is
  // the phantom-page failure contrastPages.test.ts exists to catch (§121.8).
  //
  // The removed entries are described rather than QUOTED: parseListed() reads
  // this file as text, so a commented-out entry in the real syntax is parsed as
  // a live one. Measured — writing them out made the guard report the deleted
  // page as still listed. That is §118's prose-blindness trap, from the other
  // side: not a comment satisfying an assertion, a comment creating a finding.
  ['admin', '/admin/thresholds'],
  // The medical screening-import entry went the same way: the import is
  // admin-only now, and the admin route above is the same screen for the role
  // that still has it.
  ['medical', '/medical/dashboard'],
  ['medical', '/medical/sport-assessment'],
  ['medical', '/medical/profile'],
  ['coach', '/coach/dashboard'], ['coach', '/coach/reports'],
  ['coach', '/coach/profile'],
  ['athlete', '/athlete/dashboard'], ['athlete', '/athlete/history'],
  ['athlete', '/athlete/squad'], ['athlete', '/athlete/profile'],
];

/** Routes with no DashboardLayout — sign-in and the account-recovery flow. */
const PUBLIC_ROUTES = ['/', '/activate', '/forgot-password', '/reset-password', '/verify-otp'];

module.exports = { PAGES, PUBLIC_ROUTES };
