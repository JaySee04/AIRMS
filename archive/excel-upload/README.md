# Archived: Excel screening upload (Module 4, original ingestion path)

Removed from the active codebase on **2026-07-12** after the HoloMotion PDF
path (batch import + athlete-name autocomplete) made it redundant — the PDF
is ISN's real screening artefact; the Excel roster format was the interim
stand-in.

Preserved here verbatim:

| File | Was |
|---|---|
| `ScreeningUpload.tsx` | `frontend/src/components/upload/ScreeningUpload.tsx` — drag-drop Excel uploader with row-by-row preview |
| `excel-upload-routes.js.txt` | The Excel multer config, `normaliseRow`/`validateRow` parsers, and the `POST /api/upload/screening/preview` + `POST /api/upload/screening` routes from `backend/src/routes/upload.js` |

**Not removed:** the admin **Excel backup export** (`DataBackupCard` →
`GET /api/export/backup.xlsx`) — exporting the dataset is unrelated to the
retired import path and remains live.

To restore: copy the component back, splice the route section back into
`upload.js` (it needs the `XLSX` import and the Excel `multer` instance at
the top of that file), and re-add the component to the two data-upload
pages. The removing commit also serves as the canonical diff.
