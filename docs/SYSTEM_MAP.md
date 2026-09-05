# AIRMS system map

**GENERATED — do not edit.** Run `cd backend; npm run map`.

Every table below is read from the code: the models are introspected, the
routes and pages are parsed from source, the settings and shared facts are
imported. Nothing here is typed by hand, so it cannot drift from what the
system actually does — `backend/tests/systemMap.test.js` fails if the
committed copy is stale.

This is the *what*. The **why** is [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md),
the measured figures are `npm run measure:facts` (which needs the database),
and the access model argued in prose is [`PERMISSIONS.md`](PERMISSIONS.md).

Counts: **9 models**, **138 columns**, **59 endpoints**, **25 pages**.

## 1. Data model

### Athlete — `athletes`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **athleteId** (PK) | athlete_id | STRING(16) | yes |  |
| name | name | STRING(120) | no |  |
| age | age | INTEGER | yes |  |
| gender | gender | ENUM(Male \| Female) | yes |  |
| sex | sex | ENUM(M \| F) | yes |  |
| weight | weight | DECIMAL | yes |  |
| height | height | DECIMAL | yes |  |
| sport | sport | STRING(64) | no |  |
| program | program | ENUM(PODIUM \| PELAPIS \| OTHERS) | no |  |
| overallActivityScore | overall_activity_score | DECIMAL | yes |  |
| injuryRiskIndex | injury_risk_index | DECIMAL | yes |  |
| mobility | mobility | DECIMAL | yes |  |
| stability | stability | DECIMAL | yes |  |
| symmetry | symmetry | DECIMAL | yes |  |
| exerciseRiskScore | exercise_risk_score | DECIMAL | yes |  |
| neckInjuryRisk | neck_injury_risk | DECIMAL | yes | 0 |
| shoulderInjuryRisk | shoulder_injury_risk | DECIMAL | yes | 0 |
| scoliosis | scoliosis | DECIMAL | yes | 0 |
| spinalDiscHerniation | spinal_disc_herniation | DECIMAL | yes | 0 |
| lumbarPelvisInjury | lumbar_pelvis_injury | DECIMAL | yes | 0 |
| jointPain | joint_pain | DECIMAL | yes | 0 |
| kneeInjuryRisk | knee_injury_risk | DECIMAL | yes | 0 |
| ankleInjuryRisk | ankle_injury_risk | DECIMAL | yes | 0 |
| isActive | is_active | BOOLEAN | yes | true |
| isInjured | is_injured | BOOLEAN | yes | false |
| injuryNote | injury_note | TEXT | yes |  |
| injuryBy | injury_by | STRING(120) | yes |  |
| injuryAt | injury_at | DATE | yes |  |
| normExcluded | norm_excluded | BOOLEAN | yes | false |
| createdAt | created_at | DATE | no |  |
| updatedAt | updated_at | DATE | no |  |

### AthleteDiscipline — `athlete_disciplines`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **id** (PK) | id | INTEGER | yes |  |
| athleteId | athlete_id | STRING(16) | no |  |
| discipline | discipline | STRING(48) | no |  |
| createdAt | created_at | DATE | no |  |
| updatedAt | updated_at | DATE | no |  |

### AuditLog — `audit_logs`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **id** (PK) | id | INTEGER | yes |  |
| actorId | actor_id | INTEGER | yes |  |
| actorName | actor_name | STRING(120) | yes |  |
| actorRole | actor_role | STRING(32) | yes |  |
| action | action | STRING(64) | no |  |
| entity | entity | STRING(32) | yes |  |
| entityId | entity_id | STRING(64) | yes |  |
| summary | summary | STRING(500) | yes |  |
| meta | meta | JSON | yes |  |
| createdAt | created_at | DATE | no |  |

### CohortNormVersion — `cohort_norm_versions`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **id** (PK) | id | INTEGER | yes |  |
| label | label | STRING(120) | no |  |
| note | note | TEXT | yes |  |
| createdBy | created_by | STRING(120) | yes |  |
| snapshot | snapshot | JSON | no |  |
| createdAt | created_at | DATE | no |  |
| updatedAt | updated_at | DATE | no |  |

### CohortThreshold — `cohort_thresholds`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **id** (PK) | id | INTEGER | yes |  |
| sport | sport | STRING(64) | no |  |
| programme | programme | STRING(16) | yes |  |
| gender | gender | STRING(8) | yes |  |
| discipline | discipline | STRING(64) | yes |  |
| tier | tier | ENUM(spgd \| spg \| sg \| s \| all) | no |  |
| n | n | INTEGER | no | 0 |
| stats | stats | JSON | no |  |
| overrides | overrides | JSON | yes |  |
| freshStats | fresh_stats | JSON | yes |  |
| freshN | fresh_n | INTEGER | yes |  |
| freshAt | fresh_at | DATE | yes |  |
| addedSincePin | added_since_pin | BOOLEAN | no | false |
| status | status | ENUM(pending \| approved) | no | pending |
| computedAt | computed_at | DATE | yes |  |
| approvedAt | approved_at | DATE | yes |  |
| approvedBy | approved_by | STRING(120) | yes |  |
| createdAt | created_at | DATE | no |  |
| updatedAt | updated_at | DATE | no |  |

### MuscleFlag — `muscle_flags`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **id** (PK) | id | INTEGER | yes |  |
| athleteId | athlete_id | STRING(16) | no |  |
| flagType | flag_type | ENUM(myodynamia \| tension) | no |  |
| muscle | muscle | STRING(64) | no |  |
| side | side | ENUM(L \| R \| B) | no |  |
| createdAt | created_at | DATE | no |  |
| updatedAt | updated_at | DATE | no |  |

### Screening — `screenings`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **id** (PK) | id | INTEGER | yes |  |
| athleteId | athlete_id | STRING(16) | no |  |
| assessedAt | assessed_at | DATE | yes |  |
| importedBy | imported_by | STRING(120) | yes |  |
| totalScore | total_score | DECIMAL | yes |  |
| exerciseRisks | exercise_risks | DECIMAL | yes |  |
| rom | rom | DECIMAL | yes |  |
| stability | stability | DECIMAL | yes |  |
| symmetry | symmetry | DECIMAL | yes |  |
| neckInjuryRisk | neck_injury_risk | DECIMAL | yes | 0 |
| shoulderInjuryRisk | shoulder_injury_risk | DECIMAL | yes | 0 |
| scoliosis | scoliosis | DECIMAL | yes | 0 |
| spinalDiscHerniation | spinal_disc_herniation | DECIMAL | yes | 0 |
| lumbarPelvisInjury | lumbar_pelvis_injury | DECIMAL | yes | 0 |
| jointPain | joint_pain | DECIMAL | yes | 0 |
| kneeInjuryRisk | knee_injury_risk | DECIMAL | yes | 0 |
| ankleInjuryRisk | ankle_injury_risk | DECIMAL | yes | 0 |
| subitems | subitems | JSON | yes |  |
| prescription | prescription | JSON | yes |  |
| summaryText | summary_text | TEXT | yes |  |
| muscleFlags | muscle_flags | JSON | yes |  |
| overallIndicator | overall_indicator | DECIMAL | yes |  |
| overallBand | overall_band | ENUM(green \| amber \| red) | yes |  |
| escalations | escalations | INTEGER | no | 0 |
| factors | factors | JSON | yes |  |
| reasonsAgainst | reasons_against | JSON | yes |  |
| cohortZ | cohort_z | DECIMAL | yes |  |
| cohortRank | cohort_rank | INTEGER | yes |  |
| cohortSize | cohort_size | INTEGER | yes |  |
| cohortLabel | cohort_label | STRING(160) | yes |  |
| cohortDeltas | cohort_deltas | JSON | yes |  |
| overrideBand | override_band | ENUM(green \| amber \| red) | yes |  |
| overrideNote | override_note | TEXT | yes |  |
| overrideBy | override_by | STRING(120) | yes |  |
| overrideAt | override_at | DATE | yes |  |
| createdAt | created_at | DATE | no |  |
| updatedAt | updated_at | DATE | no |  |

### Setting — `settings`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **key** (PK) | key | STRING(64) | yes |  |
| value | value | JSON | no |  |
| createdAt | created_at | DATE | no |  |
| updatedAt | updated_at | DATE | no |  |

### User — `users`

| Attribute | Column | Type | Null | Default |
|---|---|---|---|---|
| **id** (PK) | id | INTEGER | yes |  |
| name | name | STRING(120) | no |  |
| email | email | STRING(160) | no |  |
| password | password | STRING(255) | no |  |
| role | role | ENUM(athlete \| medical \| admin \| coach \| executive) | no |  |
| athleteId | athlete_id | STRING(16) | yes |  |
| coachSport | coach_sport | STRING(64) | yes | null |
| permissions | permissions | JSON | yes | null |
| notifyPrefs | notify_prefs | JSON | yes | null |
| isActive | is_active | BOOLEAN | yes | true |
| invitedAt | invited_at | DATE | yes |  |
| activatedAt | activated_at | DATE | yes |  |
| resetTokenHash | reset_token_hash | STRING(64) | yes |  |
| resetTokenExpiresAt | reset_token_expires_at | DATE | yes |  |
| resetCodeAttempts | reset_code_attempts | INTEGER | no | 0 |
| lastLoginAt | last_login_at | DATE | yes |  |
| createdAt | created_at | DATE | no |  |
| updatedAt | updated_at | DATE | no |  |

## 2. API endpoints

`roles` is the `rbac(...)` allow-list. `permission` is the extra per-account
capability check, which applies to medical accounts. A scoped role may still be
refused inside the handler — see PERMISSIONS.md for what each role actually reaches.

| Method | Path | Roles | Permission | File |
|---|---|---|---|---|
| GET | `/api/athletes` | medical, admin, executive | viewRecords | backend/src/routes/athletes.js |
| POST | `/api/athletes` | admin |  | backend/src/routes/athletes.js |
| DELETE | `/api/athletes/:id` | admin |  | backend/src/routes/athletes.js |
| GET | `/api/athletes/:id` | athlete, medical, admin, coach | viewRecords | backend/src/routes/athletes.js |
| PATCH | `/api/athletes/:id` | medical, admin | viewRecords | backend/src/routes/athletes.js |
| PATCH | `/api/athletes/:id/injury` | medical, admin | viewRecords | backend/src/routes/athletes.js |
| GET | `/api/athletes/:id/sport-context` | medical, admin | viewRecords | backend/src/routes/athletes.js |
| GET | `/api/athletes/analytics/periods` | admin, executive |  | backend/src/routes/athletes.js |
| GET | `/api/athletes/analytics/screening` | admin, executive |  | backend/src/routes/athletes.js |
| GET | `/api/athletes/meta/disciplines` | medical, admin, executive | viewRecords | backend/src/routes/athletes.js |
| GET | `/api/athletes/meta/sports` | medical, admin, executive | viewRecords | backend/src/routes/athletes.js |
| GET | `/api/athletes/teammates` | any signed-in |  | backend/src/routes/athletes.js |
| GET | `/api/audit` | admin, executive |  | backend/src/routes/audit.js |
| GET | `/api/audit/staff` | admin, executive |  | backend/src/routes/audit.js |
| POST | `/api/auth/change-password` | PUBLIC |  | backend/src/routes/auth.js |
| POST | `/api/auth/forgot-password` | PUBLIC |  | backend/src/routes/auth.js |
| POST | `/api/auth/login` | PUBLIC |  | backend/src/routes/auth.js |
| GET | `/api/auth/me` | PUBLIC |  | backend/src/routes/auth.js |
| GET | `/api/auth/notification-preferences` | PUBLIC |  | backend/src/routes/auth.js |
| PUT | `/api/auth/notification-preferences` | PUBLIC |  | backend/src/routes/auth.js |
| POST | `/api/auth/reset-password` | PUBLIC |  | backend/src/routes/auth.js |
| POST | `/api/auth/verify-otp` | PUBLIC |  | backend/src/routes/auth.js |
| GET | `/api/coach/readiness` | coach |  | backend/src/routes/coach.js |
| GET | `/api/cohorts` | admin, medical |  | backend/src/routes/cohorts.js |
| PATCH | `/api/cohorts/:id` | admin, medical |  | backend/src/routes/cohorts.js |
| GET | `/api/cohorts/:id/members` | admin, medical |  | backend/src/routes/cohorts.js |
| PATCH | `/api/cohorts/members/:athleteId` | admin, medical |  | backend/src/routes/cohorts.js |
| POST | `/api/cohorts/recompute` | admin, medical |  | backend/src/routes/cohorts.js |
| GET | `/api/cohorts/settings/all` | admin, medical |  | backend/src/routes/cohorts.js |
| PATCH | `/api/cohorts/settings/all` | admin |  | backend/src/routes/cohorts.js |
| POST | `/api/cohorts/settings/mail/:kind/send-now` | admin |  | backend/src/routes/cohorts.js |
| GET | `/api/cohorts/versions` | admin, medical |  | backend/src/routes/cohorts.js |
| POST | `/api/cohorts/versions` | admin, medical |  | backend/src/routes/cohorts.js |
| DELETE | `/api/cohorts/versions/:id` | admin |  | backend/src/routes/cohorts.js |
| PATCH | `/api/cohorts/versions/:id` | admin, medical |  | backend/src/routes/cohorts.js |
| POST | `/api/cohorts/versions/:id/pin` | admin |  | backend/src/routes/cohorts.js |
| POST | `/api/cohorts/versions/:id/restore` | admin |  | backend/src/routes/cohorts.js |
| POST | `/api/cohorts/versions/unpin` | admin |  | backend/src/routes/cohorts.js |
| GET | `/api/export/backup.xlsx` | admin |  | backend/src/routes/export.js |
| GET | `/api/isn/athletes` | medical, admin |  | backend/src/routes/isn.js |
| GET | `/api/isn/athletes/:ic` | medical, admin |  | backend/src/routes/isn.js |
| GET | `/api/screening-reports/activity-log.pdf` | admin, executive |  | backend/src/routes/screeningReports.js |
| GET | `/api/screening-reports/holistic.pdf` | admin, executive |  | backend/src/routes/screeningReports.js |
| GET | `/api/screening-reports/individual/:id.pdf` | athlete, medical, admin, coach, executive | viewRecords | backend/src/routes/screeningReports.js |
| GET | `/api/screening-reports/programme-activity.pdf` | admin, executive |  | backend/src/routes/screeningReports.js |
| GET | `/api/screening-reports/team.pdf` | medical, admin, coach, executive | viewRecords | backend/src/routes/screeningReports.js |
| GET | `/api/screenings/:id/full` | athlete, medical, admin, coach | viewRecords | backend/src/routes/screenings.js |
| PATCH | `/api/screenings/:id/override` | medical, admin | viewRecords | backend/src/routes/screenings.js |
| POST | `/api/screenings/:id/reinstate` | medical, admin | viewRecords | backend/src/routes/screenings.js |
| GET | `/api/screenings/athlete/:id` | athlete, medical, admin, coach | viewRecords | backend/src/routes/screenings.js |
| GET | `/api/screenings/reliability` | any signed-in |  | backend/src/routes/screenings.js |
| POST | `/api/upload/screening/pdf` | medical, admin | uploadData | backend/src/routes/upload.js |
| POST | `/api/upload/screening/pdf/preview` | medical, admin | uploadData | backend/src/routes/upload.js |
| GET | `/api/upload/screening/pdf/status` | medical, admin |  | backend/src/routes/upload.js |
| GET | `/api/users` | PUBLIC |  | backend/src/routes/users.js |
| POST | `/api/users` | PUBLIC |  | backend/src/routes/users.js |
| PATCH | `/api/users/:id` | PUBLIC |  | backend/src/routes/users.js |
| POST | `/api/users/:id/invite` | PUBLIC |  | backend/src/routes/users.js |
| GET | `/api/users/permission-meta` | PUBLIC |  | backend/src/routes/users.js |

## 3. Pages

`roles` is the `allowedRoles` on the page's `DashboardLayout`. That gate is
client-side; the API's RBAC above is the real boundary.

| Route | Roles | Title |
|---|---|---|
| `/` | public |  |
| `/activate` | public |  |
| `/admin/activity` | admin, executive | Programme Activity |
| `/admin/audit` | admin, executive | Activity Log |
| `/admin/dashboard` | admin, executive | Screening Analytics |
| `/admin/data-upload` | admin | Data Uploading |
| `/admin/personnel` | admin | Personnel |
| `/admin/profile` | admin, executive | My Profile |
| `/admin/reports` | admin, executive | PDF Reports |
| `/admin/settings` | admin | Settings |
| `/admin/thresholds` | admin, medical | Cohort Norms |
| `/athlete/dashboard` | athlete | My Dashboard |
| `/athlete/history` | athlete | Screening History |
| `/athlete/profile` | athlete | My Profile |
| `/athlete/squad` | athlete | My Squad |
| `/coach/dashboard` | coach | Squad Readiness |
| `/coach/profile` | coach | My Profile |
| `/coach/reports` | coach | Reports |
| `/forgot-password` | public |  |
| `/medical/cohort-norms` | public |  |
| `/medical/dashboard` | medical | Athlete Dashboard |
| `/medical/data-upload` | medical | Data Uploading |
| `/medical/profile` | medical | My Profile |
| `/reset-password` | public |  |
| `/verify-otp` | public |  |

## 4. Institution settings

| Key | Default |
|---|---|
| `rescreen_due_days` | `180` |
| `rescreen_reminder_enabled` | `true` |
| `rescreen_reminder_day` | `1` |
| `rescreen_reminder_hour` | `8` |
| `rescreen_reminder_last_sent` | `''` |
| `min_cohort_n` | `5` |
| `fallback_enabled` | `true` |
| `pinned_norm_version_id` | `null` |
| `escalation_below_mean` | `true` |
| `escalation_below_mean_z` | `-0.5` |
| `escalation_bottom_k` | `true` |
| `bottom_k` | `3` |
| `escalation_indicator` | `true` |
| `escalation_indicator_high` | `25` |
| `escalation_indicator_z` | `1.5` |
| `norm_auto_overwrite` | `false` |
| `norm_min_total` | `0` |
| `norm_min_rom` | `0` |
| `norm_min_stability` | `0` |
| `alerts_enabled` | `true` |
| `alert_on_band` | `'amber'` |
| `notify_override` | `true` |
| `notify_injury` | `true` |
| `digest_enabled` | `true` |
| `digest_day` | `1` |
| `digest_hour` | `7` |
| `digest_last_sent` | `''` |
| `digest_last_result` | `''` |
| `rescreen_reminder_last_result` | `''` |

## 5. Audited actions

Append-only. Written fire-and-forget, so a lost row is silent.

`athlete.injury` · `athlete.view` · `export.backup` · `mail.send` · `norm.member` · `norm.pin` · `norm.restore` · `norm.unpin` · `report.download` · `screening.import` · `screening.override` · `screening.reinstate` · `settings.update` · `user.create` · `user.invite` · `user.update`

## 6. Shared facts

Generated into both packages from `shared/facts.js` — see DESIGN_DECISIONS §53.

| Fact | Value |
|---|---|
| `INSTITUTION_TZ` | `Asia/Kuala_Lumpur` |
| `BANDS` | `["green","amber","red"]` |
| `BAND_RANK` | `{"green":0,"amber":1,"red":2}` |
| `BAND_LABEL` | `{"green":"No indicators flagged","amber":"Needs attention","red":"Immediate assessment"}` |
| `GENDERS` | `["Male","Female"]` |
| `PROGRAMMES` | `["PODIUM","PELAPIS","OTHERS"]` |
| `AGE_GROUPS` | `[{"label":"Under 18","max":17},{"label":"18-23 (junior)","min":18,"max":23},{"label":"24-29 (senior)","min":24,"max":29},{"label":"30+ (veteran)","min…` |
| `GRAINS` | `["month","quarter","year"]` |
| `RISK_AXIS_MAX` | `40` |
| `EXCLUDED_RISK_KEYS` | `["spinalDiscHerniation"]` |
| `RISK_INDICATORS` | `[{"key":"neckInjuryRisk","region":"Neck","reportLabel":"Neck Pain"},{"key":"shoulderInjuryRisk","region":"Shoulder","reportLabel":"Shoulder Pain"},{"k…` |
| `SMALL_COHORT` | `10` |

## 7. Environment variables the backend reads

`AUDIT_API` · `AUDIT_PW` · `BACKEND_DIR` · `FRONTEND_URL` · `JWT_EXPIRES_IN` · `JWT_SECRET` · `MAILER_DRY_RUN` · `MAIL_SCHEDULER` · `MYSQL_DATABASE` · `MYSQL_HOST` · `MYSQL_PASSWORD` · `MYSQL_POOL_MAX` · `MYSQL_PORT` · `MYSQL_SSL` · `MYSQL_SSL_CA` · `MYSQL_SSL_INSECURE` · `MYSQL_USER` · `PORT` · `SMTP_FROM` · `SMTP_HOST` · `SMTP_PASS` · `SMTP_PORT` · `SMTP_SECURE` · `SMTP_USER` · `SQL_LOG` · `SQL_SYNC` · `TESSERACT_CACHE_PATH` · `VERCEL` · `VISION_API_KEY` · `VISION_BASE_URL` · `VISION_MAX_PAGES` · `VISION_MODEL` · `VISION_PROVIDER` · `VISION_RENDER_SCALE`

## 8. npm scripts

| Where | Script | Command |
|---|---|---|
| root | `dev:backend` | `npm --prefix backend run dev` |
| root | `dev:frontend` | `npm --prefix frontend run dev` |
| root | `dev` | `node scripts/dev.js` |
| root | `install:all` | `npm install && npm --prefix backend install && npm --prefix frontend install` |
| root | `seed` | `npm --prefix backend run seed` |
| root | `sync:shared` | `node shared/generate.js` |
| backend | `start` | `node src/server.js` |
| backend | `dev` | `nodemon src/server.js` |
| backend | `seed` | `node src/utils/seeder.js` |
| backend | `test` | `jest` |
| backend | `verify:vision` | `node scripts/verify-holomotion-extract.js` |
| backend | `mail:tick` | `node src/mailTick.js` |
| backend | `guide:pdf` | `node scripts/guide-to-pdf.js && node scripts/verify-guide-pdf.js` |
| backend | `measure:facts` | `node scripts/measure-facts.js` |
| backend | `migrate:screening-unique` | `node scripts/migrate-screening-unique.js` |
| backend | `audit:access` | `node scripts/audit-access.js` |
| backend | `coverage` | `jest --coverage --coverageReporters=text-summary` |
| backend | `migrate:hosted` | `node scripts/migrate-hosted.js` |
| backend | `map` | `node scripts/system-map.js` |
| frontend | `dev` | `next dev` |
| frontend | `build` | `next build` |
| frontend | `start` | `next start` |
| frontend | `lint` | `next lint` |
| frontend | `test` | `jest` |
| frontend | `e2e` | `node scripts/e2e-smoke.js` |

