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
const { visionThrottle } = require('../utils/visionThrottle');
const { queuePostImport } = require('../utils/postImport');
const { sendError } = require('../utils/httpError');
const { GENDERS, PROGRAMMES } = require('../shared/facts');

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
// AIRMS' sole screening import, and since 2026-09-22 it READS the report where
// it can and looks at it where it cannot (§112).
//
// This comment used to say "HoloMotion PDFs have no text layer (jsPDF bakes
// everything in as graphics)". That is true of the COMPACT 12-page layout —
// scripts/samples/thung.pdf, which was the first sample and the one the whole
// pipeline was built around — and false of every other layout ISN produces.
// Measured across 17 real reports: 0 text items on the 12-page layout, a
// complete text layer on all 15 of the 28- and 38-page ones.
//
// So `extractFromPdf` tries utils/textLayerExtract.js first. When it succeeds
// the numbers are read EXACTLY and only page 1 is rendered, for HoloMotion's
// written Summary, which the text layer cannot give up (it is letter-spaced and
// the word boundaries are gone). When it fails — the compact layout — the
// original six-page vision path runs unchanged. Both were verified end to end
// against ground truth.
//
// Three fields the report never contains — athleteId, sport, program — are
// supplied by the operator at commit time (auto-filled client-side when the
// extracted name matches an existing athlete).

// GET /api/upload/screening/pdf/status — lets the UI show whether the feature
// is usable before the user picks a file. No secrets are returned.
// `configured` answers "is a VISION PROVIDER set up", which until 2026-09-22 was
// the same question as "can this institution import a report at all". It is not
// any more (§112): a report carrying a text layer — every 28- and 38-page layout
// measured — is read with no model, no tokens and no third-party request.
//
// `textLayer` is therefore reported separately and is unconditionally true: the
// reader is code in this process and needs nothing configured. An installation
// with no API key can ingest the expanded layouts and will be refused only on
// the compact one, which genuinely has no text to read.
//
// Both are sent because they gate different things, and collapsing them is what
// made an installation with no key unable to reach a path that works.
router.get('/screening/pdf/status', auth, rbac('medical', 'admin'), (_req, res) => {
  const cfg = visionConfig();
  const vision = isVisionConfigured();
  res.json({
    configured: vision,
    provider: cfg.provider,
    model: cfg.model || null,
    textLayer: true,
    // What the operator can actually do right now, so the UI does not have to
    // re-derive the policy and reach a different answer.
    canIngest: true,
    // The compact layout, and HoloMotion's written Summary on every layout,
    // both need the model. Named so the UI can say WHICH capability is reduced
    // rather than "not configured".
    needsVisionFor: vision ? [] : ['the compact 12-page layout', "HoloMotion's written Summary"],
  });
});

// POST /api/upload/screening/pdf/preview — render + extract, DO NOT commit.
// Returns the extracted athlete payload for the operator to review and to
// attach athleteId / sport / program before committing.
// `visionThrottle` sits AFTER the permission gate (an unauthorised caller is
// refused on permission, not charged quota) and BEFORE multer (an over-quota
// caller is answered without first buffering 20 MB). Both orderings are pinned
// by tests/visionThrottle.test.js.
router.post('/screening/pdf/preview', auth, rbac('medical', 'admin'), requirePermission('uploadData'), visionThrottle, uploadPdf.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    // NO BLANKET REFUSAL ON A MISSING PROVIDER (§112, 2026-09-22).
    //
    // This used to 503 here whenever VISION_API_KEY was unset, which was right
    // when every report had to be looked at and is wrong now that most are
    // read. It refused, without opening the file, imports that need nothing
    // configured — so an ISN installation with no API key could not use a path
    // that works perfectly.
    //
    // extractFromPdf decides: text layer first, and it raises an exposed 503
    // naming the compact layout only when it genuinely has to fall back and
    // cannot. The refusal now describes THIS report rather than the whole
    // feature.
    const result = await extractFromPdf(req.file.buffer);
    // Deliberately does NOT echo the filename back: it can carry PII (the
    // sample's name + phone number live in the filename) and the UI shows the
    // browser's local File name instead, so returning it served no purpose.
    res.json(result);
  } catch (err) {
    sendError(res, err, 'upload.js');
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
    // Both lists come from shared/facts.js — the same source as the columns
    // they are validated against, so this cannot reject a value the database
    // would have accepted, or accept one it will not.
    if (!data.program || !PROGRAMMES.includes(data.program)) {
      errors.push(`Missing or invalid Program (expected ${PROGRAMMES.join(' / ')})`);
    }
    if (data.gender && !GENDERS.includes(data.gender)) {
      errors.push(`Invalid Gender "${data.gender}" (expected ${GENDERS.join(' / ')})`);
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
    const { toNum: num } = require('../utils/num');
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
      // Idempotent on (athleteId, assessedAt), like the muscle-flag and event
      // replaces above. Committing the same report twice used to append a
      // SECOND screening row identical to the first, and nothing downstream
      // could tell them apart: reliability() paired them as a retest with a
      // difference of zero on every score. Measured — two such commits took the
      // dead band from the documented fallback of 2, correctly labelled an
      // assumption, to a DERIVED 5.7-11.5. The demo hands the same three
      // reports to two people, so this is the expected path, not an edge case.
      //
      // An undated screening still inserts: with no assessedAt there is nothing
      // to match on, and merging two undated rows would be a guess.
      const twin = screeningRow.assessedAt
        ? await Screening.findOne({
          where: { athleteId: data.athleteId, assessedAt: screeningRow.assessedAt },
          transaction: t,
        })
        : null;
      if (twin) {
        await Screening.update(screeningRow, { where: { id: twin.id }, transaction: t });
        action = action === 'created' ? 'created' : 're-imported';
      } else {
        await Screening.create(screeningRow, { transaction: t });
      }
    });

    // New screening data → refresh cohort norms, re-score the indicators, and
    // alert on any athlete now at amber/red. Queued + debounced: a batch of N
    // commits coalesces into ONE recompute pass, and the response returns
    // immediately instead of waiting seconds. Non-fatal by the same contract
    // as before — a failed recompute is corrected by the next import or the
    // admin "Recompute" button.
    // Awaited: see utils/postImport.js. On a long-lived process this returns
    // immediately and the work is still debounced; on a serverless host it is
    // the difference between the norms refreshing and silently not.
    await queuePostImport(data.athleteId);

    recordAudit(req, {
      action: 'screening.import',
      entity: 'athlete',
      entityId: data.athleteId,
      summary: `${action === 'created' ? 'Created' : 'Updated'} ${athlete.name || data.athleteId} from a HoloMotion import`,
      meta: { action, muscleFlags: flagRows.length, assessedAt, tokens: req.body?.usage || null },
    });

    res.json({ message: 'Import complete', action, athleteId: data.athleteId, muscleFlags: flagRows.length });
  } catch (err) {
    sendError(res, err, 'upload.js');
  }
});

module.exports = router;
