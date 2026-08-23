const express = require('express');
const { recordAudit } = require('../utils/audit');
const multer = require('multer');
const { sequelize, Athlete, MuscleFlag, Screening, AthleteDiscipline } = require('../models');
const { cleanDisciplineList } = require('../utils/disciplines');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { extractFromPdf } = require('../utils/holomotionExtract');
const { isVisionConfigured, visionConfig } = require('../utils/visionClient');
const { queuePostImport } = require('../utils/postImport');

// NOTE: the original Excel screening-upload path (multer excel filter,
// normaliseRow/validateRow, POST /screening/preview + /screening) was retired
// on 2026-07-12 — HoloMotion PDF ingestion is the sole import path. The
// removed code is preserved verbatim in archive/excel-upload/. The Excel
// BACKUP EXPORT (routes/export.js) is unrelated and remains live.

const router = express.Router();

const storage = multer.memoryStorage();

// Uploader for the PDF (HoloMotion) ingestion flow.
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

// ───────────────────────────── PDF (HoloMotion) flow ─────────────────────────
// The vision-model-backed ingestion path — AIRMS' sole screening import.
// HoloMotion PDFs have no text layer (jsPDF bakes everything in as graphics),
// so a vision model reads the rendered pages and returns structured JSON.
// Three fields the report never contains — athleteId, sport, program — are
// supplied by the operator at commit time (auto-filled client-side when the
// extracted name matches an existing athlete).

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
    // Deliberately does NOT echo the filename back: it can carry PII (the
    // sample's name + phone number live in the filename) and the UI shows the
    // browser's local File name instead, so returning it served no purpose.
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/upload/screening/pdf — commit a previewed extraction. Accepts JSON
// (not the file again) so we do not pay for a second vision call: the client
// sends back the extracted payload plus the operator-supplied metadata.
router.post('/screening/pdf', auth, rbac('medical', 'admin'), requirePermission('uploadData'), express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const {
      athlete = {}, myodynamia = [], tension = [], athleteId, sport, program,
      // Events the operator tagged the athlete with (only sports that have them,
      // e.g. badminton). When present, replaces the athlete's discipline set;
      // when omitted (undefined), existing events are left untouched so a
      // re-import that doesn't carry them doesn't wipe them.
      disciplines,
      // Screening-snapshot extras from the preview (stored on the screenings
      // history row, not the flat athletes columns).
      assessedAt = null, summary = null, subitems = null, prescription = null,
    } = req.body || {};

    // Auto Title-Case the name (report prints lowercase; operator may not fix it).
    if (athlete.name) athlete.name = String(athlete.name).replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

    const data = {
      ...athlete,
      athleteId: String(athleteId || athlete.athleteId || '').trim(),
      sport: sport || athlete.sport,
      program: program || athlete.program,
    };

    // The athlete's name is redacted from the screening image before extraction
    // (privacy — see utils/redactName.js), so the model no longer returns it.
    // For an athlete already on the roster (the normal case — the operator picks
    // them by ID), backfill name/sport/program from their record so the commit
    // still validates and the identity comes from OUR data, not the vision model.
    if (data.athleteId && (!data.name || !data.sport || !data.program)) {
      const roster = await Athlete.findOne({ where: { athleteId: data.athleteId } });
      if (roster) {
        if (!data.name) data.name = roster.name;
        if (!data.sport) data.sport = roster.sport;
        if (!data.program) data.program = roster.program;
      }
    }

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

    const disciplineRows = cleanDisciplineList(disciplines).map((discipline) => ({ athleteId: data.athleteId, discipline }));

    // Immutable history snapshot of this import (athletes table holds latest;
    // screenings holds every import for progress-over-time + report deltas).
    const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
    const screeningRow = {
      athleteId: data.athleteId,
      assessedAt: assessedAt ? new Date(assessedAt) : null,
      importedBy: req.user?.name || null,
      totalScore: num(athlete.overallActivityScore),
      exerciseRisks: num(athlete.injuryRiskIndex),
      rom: num(athlete.mobility),
      stability: num(athlete.stability),
      symmetry: num(athlete.symmetry),
      neckInjuryRisk: num(athlete.neckInjuryRisk) ?? 0,
      shoulderInjuryRisk: num(athlete.shoulderInjuryRisk) ?? 0,
      scoliosis: num(athlete.scoliosis) ?? 0,
      spinalDiscHerniation: num(athlete.spinalDiscHerniation) ?? 0,
      lumbarPelvisInjury: num(athlete.lumbarPelvisInjury) ?? 0,
      jointPain: num(athlete.jointPain) ?? 0,
      kneeInjuryRisk: num(athlete.kneeInjuryRisk) ?? 0,
      ankleInjuryRisk: num(athlete.ankleInjuryRisk) ?? 0,
      subitems: subitems || null,
      prescription: prescription || null,
      summaryText: summary || null,
      muscleFlags: { myodynamia, tension },
      // overallIndicator/band/escalations computed in Stage C once cohorts exist.
    };

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
      // Same wholesale replace for events (only when the client sent a set).
      if (Array.isArray(disciplines)) {
        await AthleteDiscipline.destroy({ where: { athleteId: data.athleteId }, transaction: t });
        if (disciplineRows.length) await AthleteDiscipline.bulkCreate(disciplineRows, { transaction: t });
      }
      await Screening.create(screeningRow, { transaction: t });
    });

    // New screening data → refresh cohort norms, re-score the indicators, and
    // alert on any athlete now at amber/red. Queued + debounced: a batch of N
    // commits coalesces into ONE recompute pass, and the response returns
    // immediately instead of waiting seconds. Non-fatal by the same contract
    // as before — a failed recompute is corrected by the next import or the
    // admin "Recompute" button.
    queuePostImport(data.athleteId);

    recordAudit(req, {
      action: 'screening.import',
      entity: 'athlete',
      entityId: data.athleteId,
      summary: `${action === 'created' ? 'Created' : 'Updated'} ${athlete.name || data.athleteId} from a HoloMotion import`,
      meta: { action, muscleFlags: flagRows.length, assessedAt, tokens: req.body?.usage || null },
    });

    res.json({ message: 'Import complete', action, athleteId: data.athleteId, muscleFlags: flagRows.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
