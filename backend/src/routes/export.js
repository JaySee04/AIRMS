// Admin data-backup export. Streams the whole database state as a multi-sheet
// Excel workbook — the offline record ISN keeps, reviews and hands over.
// Read-only; uses the already-present `xlsx` dependency and builds the workbook
// in memory (no temp files).
//
// WHAT GOES IN IT, AND WHY THAT IS NOT OBVIOUS, is utils/backupWorkbook.js.
// Short version: this exported 2 of 9 tables from 2026-07-01 to 2026-10-09 —
// no screenings, no norms, no trail, and the scores it DID write had no
// `assessedAt` beside them (DESIGN_DECISIONS §149).
const { isnToday } = require('../utils/dates');
const express = require('express');
const XLSX = require('xlsx');
const models = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { recordAudit } = require('../utils/audit');
const { sendError } = require('../utils/httpError');
const { collect, manifestRows, headerFor } = require('../utils/backupWorkbook');

const router = express.Router();

// GET /api/export/backup.xlsx — the full database snapshot.
router.get('/backup.xlsx', auth, rbac('admin'), async (req, res) => {
  try {
    // ISN's calendar, not the server's: a backup taken at 07:00 Malaysian time
    // was named with the previous day's date on the hosted instance, which runs
    // UTC (DD 62).
    const stamp = isnToday();
    const plan = await collect(models);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(manifestRows(plan, stamp)),
      'Manifest',
    );
    for (const s of plan) {
      // An empty table still gets its header row, so "nothing in this table"
      // and "this table was not exported" stay distinguishable.
      const sheet = s.rows.length
        ? XLSX.utils.json_to_sheet(s.rows)
        : XLSX.utils.aoa_to_sheet([headerFor(s.model, s.omit)]);
      // Sheet names are capped at 31 chars by the format; keep them short.
      XLSX.utils.book_append_sheet(wb, sheet, s.name);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="airms-backup-${stamp}.xlsx"`);

    // The single largest data egress in the system — every athlete, every
    // screening and the whole trail, in one file. If any read is worth a trail,
    // this one is. The counts go on the row so the audit entry says what left.
    const counts = Object.fromEntries(plan.map((s) => [s.name, s.rows.length]));
    recordAudit(req, {
      action: 'export.backup',
      entity: 'backup',
      summary: `Full backup exported — ${plan.map((s) => `${s.rows.length} ${s.name.toLowerCase()}`).join(', ')}`,
      meta: counts,
    });
    res.send(buffer);
  } catch (err) {
    sendError(res, err, 'export.js');
  }
});

module.exports = router;
