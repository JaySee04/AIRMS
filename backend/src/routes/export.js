// Admin data-backup export. Streams the current database state as a multi-sheet
// Excel workbook so the Excel-era statistics and data are preserved now that
// ingestion is moving to HoloMotion PDFs. Read-only; uses the already-present
// `xlsx` dependency and builds the workbook in memory (no temp files).
const express = require('express');
const XLSX = require('xlsx');
const { Athlete, MuscleFlag } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { recordAudit } = require('../utils/audit');
const { sendError } = require('../utils/httpError');

const router = express.Router();

// GET /api/export/backup.xlsx — athlete + muscle-flag snapshot (HoloMotion data).
router.get('/backup.xlsx', auth, rbac('admin'), async (req, res) => {
  try {
    const [athletes, flags] = await Promise.all([
      Athlete.findAll({ order: [['athleteId', 'ASC']], raw: true }),
      MuscleFlag.findAll({ order: [['athleteId', 'ASC']], raw: true }),
    ]);

    const wb = XLSX.utils.book_new();
    // Sheet names are capped at 31 chars by the format; keep them short.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(athletes), 'Athletes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flags), 'MuscleFlags');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="airms-backup-${stamp}.xlsx"`);
    // The single largest data egress in the system — every athlete row and every
    // muscle flag, in one file. If any read is worth a trail, this one is.
    recordAudit(req, {
      action: 'export.backup',
      entity: 'backup',
      summary: `Full backup exported — ${athletes.length} athletes, ${flags.length} muscle flags`,
      meta: { athletes: athletes.length, muscleFlags: flags.length },
    });
    res.send(buffer);
  } catch (err) {
    sendError(res, err, 'export.js');
  }
});

module.exports = router;
