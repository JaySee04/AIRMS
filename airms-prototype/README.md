# AIRMS Prototype — Athlete Injury Risk Management System

UI prototype for the FYP project. Designed for ISN (Institut Sukan Negara) demo with Dr. Thung.

## Run it

No build step. Just open `index.html` in a browser, or serve the folder:

```
cd airms-prototype
python -m http.server 8000
# then visit http://localhost:8000
```

> Tip: serving via http.server gives nicer behavior than `file://` (avoids occasional fetch/CORS quirks).

## Demo flow

The login page has a **role picker**. You can sign in as any of the three roles to walk the stakeholder through every dashboard:

| Role           | Default landing page             | Modules visible                                         |
| -------------- | -------------------------------- | ------------------------------------------------------- |
| Athlete        | `athlete/dashboard.html`         | Workload Dashboard, Activity, Injury Reporting, Profile |
| Medical Staff  | `medical/dashboard.html`         | Athlete Dashboard, Injury Logging, Self-Report Review, Data Upload |
| Administrator  | `admin/dashboard.html`           | Injury Analytics, PDF Reports, Data Upload              |

Sign out from any page returns to the login screen so you can switch roles.

## Design language

- Navy (`#0f2c4a`) + gold (`#c89b3c`) — government / ISN tone
- **Light + dark mode** toggle in the topbar (☀/🌙). Persists per browser.
- Inter typography, generous spacing, large hit targets — friendly for non-technical government users
- Charts use a coordinated 6-colour palette that respects the active theme
- Print stylesheet is wired into the PDF preview page so the report can be print-saved as PDF immediately

## Role-Based Access Control

Every protected page declares `data-allowed-roles` on `<body>`. If a user navigates to a page their role doesn't permit, they are redirected to their role's default dashboard. The sidebar is rendered from a per-role nav list — links don't appear at all for roles that shouldn't see them.

## Folder layout

```
airms-prototype/
├── index.html                 # Login + role picker
├── README.md
├── assets/
│   ├── css/main.css           # All styling, light/dark themes
│   └── js/
│       ├── main.js            # RBAC, sidebar, topbar, theme persistence
│       ├── mockdata.js        # Mock data — schema mirrors ISN Excel
│       └── charts.js          # Chart.js theme helpers
├── athlete/
│   ├── dashboard.html         # Workload + risk hero + risk radar
│   ├── activity.html          # Log + history with filters
│   ├── injury-report.html     # Self-report submission + status
│   └── profile.html
├── medical/
│   ├── dashboard.html         # Athlete search + individual profile + sport context
│   ├── injury-log.html        # Log official injuries + recovery status
│   ├── review-reports.html    # Approve/reject athlete self-reports
│   └── data-upload.html       # Excel import with validation
└── admin/
    ├── dashboard.html         # Holistic analytics + filters + temporal trends
    ├── reports.html           # Standard + custom PDF report builder
    └── data-upload.html
```

## Mock data

`assets/js/mockdata.js` carries:
- 60 mock athletes across the 23 sports the demo references
- 220+ injury records spread across 2025–2026
- Anchor athlete `John Doe` (ATH0001) populated with the exact values from the Excel sample you shared
- Self-report submissions in pending / approved / rejected states for the medical review demo
- Import-history log entries

The data is generated with a deterministic PRNG so charts stay stable between reloads and look polished during a live demo.

## What's not in the prototype

- No real backend / persistence — anything you add (activity log, self-report) lives in memory and resets on reload
- No real authentication or password reset
- PDF report download is mocked (use the **Print** button on the preview to save the report as PDF in the browser)
- Excel upload reads the filename only and simulates the validation report (so you can demo the validation UX without an actual parse)

These are deliberate prototype trade-offs — the structure is laid out so each can be wired to a real backend later without changing the UI shell.
