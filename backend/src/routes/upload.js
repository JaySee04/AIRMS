const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { sequelize, Athlete, MuscleFlag } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { extractFromPdf } = require('../utils/holomotionExtract');
const { isVisionConfigured, visionConfig } = require('../utils/visionClient');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are accepted'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Separate uploader for the PDF (HoloMotion) ingestion flow. Kept distinct from
// the Excel uploader so the two paths never share a filter or size limit.
const uploadPdf = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files (.pdf) are accepted'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB — HoloMotion exports run ~1 MB
});

// Shared row → Athlete payload normaliser. Tolerates many column-name variants
// because Dr Thung's final canonical schema is still being defined.
function normaliseRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return undefined;
  };
  const athleteId = String(get('Athlete ID', 'athleteId', 'AthleteID', 'ID') || '').trim();
  return {
    athleteId,
    data: {
      athleteId,
      name: get('Name', 'name'),
      age: get('Age', 'age'),
      gender: get('Gender', 'gender'),
      weight: get('Weight (kg)', 'Weight', 'weight'),
      height: get('Height (cm)', 'Height', 'height'),
      sport: get('Sport', 'Sports', 'sport'),
      program: get('Program', 'Programme', 'program'),
      overallActivityScore: get('Overall Activity Score', 'Overall Physical Activity Score', 'overallActivityScore'),
      injuryRiskIndex: get('Injury Risk Index', 'injuryRiskIndex'),
      mobility: get('Mobility', 'mobility'),
      stability: get('Stability', 'stability'),
      symmetry: get('Symmetry', 'symmetry'),
      // "Exercise Risk Score" in the Excel is a column-GROUP header spanning
      // the five injury-risk indicators (neck, shoulder, scoliosis, spinal
      // disc, lumbar-pelvis), not a leaf value of its own. The previous
      // extraction here misread it and produced null on every row.
    },
  };
}

function validateRow(data) {
  const errors = [];
  if (!data.athleteId) errors.push('Missing Athlete ID');
  if (!data.name) errors.push('Missing Name');
  if (!data.sport) errors.push('Missing Sport');
  if (data.program && !['PODIUM', 'PELAPIS', 'OTHERS'].includes(data.program)) {
    errors.push(`Invalid Program "${data.program}" (expected PODIUM / PELAPIS / OTHERS)`);
  }
  if (data.gender && !['Male', 'Female'].includes(data.gender)) {
    errors.push(`Invalid Gender "${data.gender}" (expected Male / Female)`);
  }
  return errors;
}

// POST /api/upload/screening/preview — parse + validate, DO NOT commit
router.post('/screening/preview', auth, rbac('medical', 'admin'), requirePermission('uploadData'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const preview = await Promise.all(rows.map(async (row, index) => {
      const { athleteId, data } = normaliseRow(row);
      const errors = validateRow(data);
      let action = 'create';
      if (athleteId) {
        const existing = await Athlete.findOne({ where: { athleteId }, attributes: ['athleteId'] });
        if (existing) action = 'update';
      }
      return { index, athleteId, name: data.name, sport: data.sport, action, errors, data };
    }));

    res.json({
      filename: req.file.originalname,
      total: rows.length,
      valid: preview.filter((r) => r.errors.length === 0).length,
      invalid: preview.filter((r) => r.errors.length > 0).length,
      rows: preview,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/upload/screening — import athlete screening data from Excel.
// Wrapped in a transaction so a mid-batch failure rolls back atomically —
// matches the "relational integrity" claim defended in DESIGN_DECISIONS §5.
router.post('/screening', auth, rbac('medical', 'admin'), requirePermission('uploadData'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const results = { created: 0, updated: 0, errors: [] };

    await sequelize.transaction(async (t) => {
      for (const row of rows) {
        try {
          const { athleteId, data } = normaliseRow(row);
          if (!athleteId) { results.errors.push({ row, reason: 'Missing Athlete ID' }); continue; }
          const valErrors = validateRow(data);
          if (valErrors.length) { results.errors.push({ row, reason: valErrors.join('; ') }); continue; }

          const existing = await Athlete.findOne({ where: { athleteId }, transaction: t });
          if (existing) {
            await Athlete.update(data, { where: { athleteId }, transaction: t });
            results.updated++;
          } else {
            await Athlete.create(data, { transaction: t });
            results.created++;
          }
        } catch (err) {
          results.errors.push({ row, reason: err.message });
        }
      }
    });

    res.json({ message: 'Import complete', ...results, total: rows.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ───────────────────────────── PDF (HoloMotion) flow ─────────────────────────
// A separate, vision-model-backed ingestion path. The Excel routes above are
// untouched. HoloMotion PDFs have no text layer (jsPDF bakes everything in as
// graphics), so a vision model reads the rendered pages and returns structured
// JSON. Three fields the report never contains — athleteId, sport, program —
// are supplied by the operator at commit time.

// GET /api/upload/screening/pdf/status — lets the UI show whether the feature
// is usable before the user picks a file. No secrets are returned.
router.get('/screening/pdf/status', auth, rbac('medical', 'admin'), (_req, res) => {
  const cfg = visionConfig();
  res.json({
    configured: isVisionConfigured(),
    provider: cfg.provider,
    model: cfg.model || null,
  });
});

// POST /api/upload/screening/pdf/preview — render + extract, DO NOT commit.
// Returns the extracted athlete payload for the operator to review and to
// attach athleteId / sport / program before committing.
router.post('/screening/pdf/preview', auth, rbac('medical', 'admin'), requirePermission('uploadData'), uploadPdf.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    if (!isVisionConfigured()) {
      return res.status(503).json({
        message: 'PDF ingestion is not configured. Set VISION_API_KEY and VISION_MODEL in the backend environment.',
      });
    }
    const result = await extractFromPdf(req.file.buffer);
    res.json({ filename: req.file.originalname, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/upload/screening/pdf — commit a previewed extraction. Accepts JSON
// (not the file again) so we do not pay for a second vision call: the client
// sends back the extracted payload plus the operator-supplied metadata.
router.post('/screening/pdf', auth, rbac('medical', 'admin'), requirePermission('uploadData'), express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const { athlete = {}, myodynamia = [], tension = [], athleteId, sport, program } = req.body || {};

    const data = {
      ...athlete,
      athleteId: String(athleteId || athlete.athleteId || '').trim(),
      sport: sport || athlete.sport,
      program: program || athlete.program,
    };

    const errors = [];
    if (!data.athleteId) errors.push('Missing Athlete ID');
    if (!data.name) errors.push('Missing Name');
    if (!data.sport) errors.push('Missing Sport');
    if (!data.program || !['PODIUM', 'PELAPIS', 'OTHERS'].includes(data.program)) {
      errors.push('Missing or invalid Program (expected PODIUM / PELAPIS / OTHERS)');
    }
    if (data.gender && !['Male', 'Female'].includes(data.gender)) {
      errors.push(`Invalid Gender "${data.gender}" (expected Male / Female)`);
    }
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    const flagRows = [
      ...(Array.isArray(myodynamia) ? myodynamia : []).map((m) => ({ ...m, flagType: 'myodynamia' })),
      ...(Array.isArray(tension) ? tension : []).map((m) => ({ ...m, flagType: 'tension' })),
    ]
      .filter((m) => m.muscle && ['L', 'R', 'B'].includes(m.side))
      .map((m) => ({ athleteId: data.athleteId, flagType: m.flagType, muscle: String(m.muscle).trim(), side: m.side }));

    let action = 'created';
    await sequelize.transaction(async (t) => {
      const existing = await Athlete.findOne({ where: { athleteId: data.athleteId }, transaction: t });
      if (existing) {
        await Athlete.update(data, { where: { athleteId: data.athleteId }, transaction: t });
        action = 'updated';
      } else {
        await Athlete.create(data, { transaction: t });
      }
      // Replace muscle flags wholesale so re-importing a newer screen is idempotent.
      await MuscleFlag.destroy({ where: { athleteId: data.athleteId }, transaction: t });
      if (flagRows.length) await MuscleFlag.bulkCreate(flagRows, { transaction: t });
    });

    res.json({ message: 'Import complete', action, athleteId: data.athleteId, muscleFlags: flagRows.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
