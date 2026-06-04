# FYP I Viva Presentation Script

Aligned to **FYP I VIVA SLIDES (Draft).pdf** (updated post-panel feedback; Literature Review 4 is a recent two-paper Session Load Quantification cluster — Inoue 2022 and Yang 2024 — both of which build on and revalidate the established sRPE method).

---

## Slide 1 — Title

Good day to my academic project panel. My name is Lim Jian Chuen, and I will be presenting my final year project titled *Interactive Student Sports Portal with Health Dashboard*, under the supervision of Dr. Hoo Wai Lam.

---

## Slide 2 — Table of Contents

Here is an overview of my presentation contents. I will cover the Introduction, Problem Statement, Objectives, Literature Review, Methodology, Requirements, Analysis and Design, Technical Implementation, the Stakeholder Collaboration Initiative, and References.

---

## Slide 3 — Introduction

This project is developed in close collaboration with Institut Sukan Negara, or ISN, to build the Athlete Injury Risk Management System, known as AIRMS. AIRMS is a platform aimed at transforming how sports institutions monitor athlete health, manage injury data, and support medical decision-making.

The system addresses injury analysis by providing a centralised platform with Role Based Access Control. A key feature is its dual-dashboard approach — a holistic administrative view for policy-level decision-making, and an individual-focused medical staff view for clinical decision support.

---

## Slide 4 — Problem Statement

The first problem is the absence of a dedicated injury tracking and risk management system. Sports institutions like ISN currently rely on fragmented records and manual processes to monitor athlete health, making it difficult to identify injury patterns, flag at-risk athletes, or maintain consistent longitudinal records — a gap also highlighted in the scoping review by Costello et al. in 2024.

The second problem is the lack of workload monitoring for athlete injury risk assessment. Without a system that computes and displays the Acute to Chronic Workload Ratio, or ACWR, athletes and medical staff have no data-driven basis for identifying dangerous workload patterns before injuries occur — a gap reinforced by the recent systematic review and meta-analysis by Qin et al. in 2025.

The third problem is the absence of a centralised platform for administrative injury analytics. Without structured, consistent data and filtering capabilities, producing summaries for management and policy-level stakeholders is unreliable and time-consuming, limiting the institution's ability to respond proactively to injury trends — which is precisely the standardisation case extended by Sprouse et al. in 2024, building on the IOC consensus lineage established by Bahr et al.

---

## Slide 5 — Objectives

My first objective is to identify the requirements for an athlete injury risk management system through stakeholder collaboration with ISN. This ensures the system is grounded in the actual operational needs of the institution, rather than assumptions.

My second objective is to develop a centralised platform that integrates athlete activity tracking, injury logging, and role-specific dashboards for injury risk management. This directly addresses all three problems identified — consolidating records, enabling workload monitoring, and providing analytics capabilities under one system.

My third and final objective is to evaluate the effectiveness and usability of the system in supporting injury risk monitoring and data-driven decision-making at ISN. This ensures the developed system is not only functional, but genuinely useful and accessible to its intended users.

---

## Slide 6 — Literature Review (title)

Moving on to the Literature Review. I have four reviews grounding the design of AIRMS, with the fourth covering a two-paper cluster on session load quantification.

---

## Slide 7 — Literature Review 1: Qin et al. (2025)

My first review is *Acute to Chronic Workload Ratio (ACWR) for Predicting Sports Injury Risk: A Systematic Review and Meta-Analysis*.

This systematic review and meta-analysis pools 22 cohort studies to quantify how ACWR predicts time-loss injury risk across team sports. The key findings confirm that ACWR is meaningfully associated with injury risk, with the lowest injury incidence — 56 percent — occurring when athletes' ACWR remains within the 0.8 to 1.3 band. This provides direct empirical support for threshold-based risk categorisation and identifies workload spikes outside the baseline band as the strongest predictor of elevated injury risk.

---

## Slide 8 — Literature Review 2: Costello et al. (2024)

My second review is *Sports Injury Surveillance Systems: A Scoping Review of Practice and Methodologies*.

This scoping review surveys sports injury surveillance systems in current practice. The key findings highlight that the most effective surveillance systems support multiple reporting pathways — athletes submit their own observations while medical staff review, verify, and formalise submissions. This multi-stakeholder architecture improves both the volume and quality of captured data. The separation of report states, such as Pending, Approved, and Rejected, ensures clinical accountability is maintained throughout the process.

---

## Slide 9 — Literature Review 3: Sprouse et al. (2024)

My third review is *Injury and Illness Surveillance Monitoring in Team Sports: A Framework for All*.

This framework paper extends the IOC and STROBE-SIIS standardisation lineage established by Bahr et al. into guidance applicable across all standards of sporting participation, not only elite contexts. The key findings reaffirm the essential data variables every credible injury surveillance system should capture — injury type, affected body part, severity, mechanism, and time of occurrence — and add implementation-oriented guidance for non-elite settings. It also establishes that consistent data structure enables cross-cohort comparison and population-level trend analysis across sport, gender, and age group.

---

## Slide 10 — Literature Review 4: Session Load Quantification (Inoue 2022, Yang 2024)

My fourth review is a cluster of two recent works covering session load quantification — the foundational metric on which ACWR-based workload monitoring is built. Both papers build on and revalidate the established session-RPE (sRPE) method, in which Session Load equals Duration in minutes multiplied by RPE on a one-to-ten scale, producing a value in Arbitrary Units. AIRMS uses 1-to-10 rather than 0-to-10 to avoid zero-load entries that would zero out ACWR.

Inoue et al. (2022) is a systematic review and meta-analysis of 27 studies which found no significant difference between athlete-perceived sRPE and coach-prescribed loads for overall RPE — confirming the CR-10 rating is interpreted reliably by athletes across diverse sports and competitive levels. Yang et al. (2024) reviews sRPE applications in elite endurance athletes and reports strong, consistent correlation with HR-based TRIMP across varying training intensities, re-establishing the perceptual-to-physiological correspondence in present-day high-performance contexts.

A common limitation across the two works is that self-reported RPE varies by individual perception, so absolute load values are not directly comparable across athletes. This limitation is mitigated within the ACWR framework, which compares each athlete against their own historical baseline rather than across the cohort — making within-individual consistency more important than inter-athlete comparability.

---

## Slide 11 — Literature Review Summary

Taken together, these works form a connected evidence base that directly informs the design of AIRMS. The Session Load Quantification cluster — Inoue (2022) and Yang (2024) — provides recent, peer-reviewed evidence that the sRPE method remains valid and reliable for institutional use along the two axes that matter: scale reliability (Inoue) and physiological correspondence (Yang); this feeds directly into the Activity Tracking Module. Qin (2025) then validates why this load data matters — confirming through meta-analysis that ACWR is a meaningful predictor of injury risk and that the 0.8–1.3 band carries the lowest incidence — with Michailidis (2024) further supporting the case for *personalised* rather than universal thresholds, both of which are reflected in the Dashboard and Workload Module. Costello informs the architecture of the Injury and Recovery Logging Module, specifically the multi-stakeholder reporting pathway and the review workflow between athletes and medical staff. Finally, Sprouse (2024) provides the data standards that underpin the Admin Injury Analytics Dashboard, ensuring the injury variables captured align with the IOC/STROBE-SIIS lineage of internationally recognised epidemiological frameworks, with Waldén et al. (2023) evidencing that this lineage is actively maintained and sport-extensible.

Each cluster maps directly to a problem statement and a module, giving the system a strong academic grounding.

---

## Slides 12 to 15 — Existing Systems Comparison (individual)

Now we will look at the existing system comparisons. I have reviewed four commercial systems.

**Kitman Labs** offers automated ACWR monitoring driven by wearable data, but its risk display is targeted at coaching staff and is not athlete-facing, and it lacks direct Excel upload capabilities.

**Teamworks** provides configurable injury recording and reporting, but heavily relies on manual setup and significant configuration by the organisation, and its CSV import has no built-in field validation workflow.

**Catapult Sports** is strong in hardware-driven workload monitoring, but it has no medical staff injury recording, no athlete self-report pathway, and no bulk data import.

**The Athletic Trainer System** offers purpose-built injury tracking with full clinical fields, but it has no workload monitoring, no risk display, and limited analytics with import restricted to a proprietary format.

---

## Slide 16 — Existing Systems Comparison (full table)

Summarising the comparison, AIRMS will have the most comprehensive functional coverage across the six features assessed — workload and ACWR monitoring, athlete-facing risk display, medical staff injury recording, athlete self-reported injury with a review workflow, a filterable admin injury analytics dashboard, and Excel file upload with validation. The only area where AIRMS does not compete is hardware integration, since that requires users to own specific devices, which is intentionally outside the scope of an institution-accessible web platform.

---

## Slide 17 — Methodology

For my methodology, I have chosen the Agile methodology, as it prioritises stakeholder collaboration and adaptability through an iterative and incremental approach. This was particularly appropriate given that ISN's dataset was still being cleaned when development began, and requirements were expected to evolve through ongoing consultations. The methodology is structured into six phases, with three broad sprints aligned to the academic calendar.

---

## Slide 18 — Agile Phases

In the **Planning** phase, stakeholder interviews were conducted with ISN to gather functional and non-functional requirements and define the product backlog.

In the **Design** phase, the ERD, Use Case Diagrams, Activity Diagrams, and Figma UI and UX wireframes were produced for all six modules.

The **Development** phase follows an iterative sprint-based approach — Sprint 1 covers Semester 1, Sprint 2 covers the Semester Break, and Sprint 3 covers Semester 2.

In the **Testing** phase, unit testing, integration testing, user acceptance testing with ISN personnel, and API testing via Postman will be conducted.

The **Deployment** phase involves pre-production deployment, a system demonstration with ISN, followed by production deployment according to ISN's security requirements.

Finally, the **Review** phase encompasses codebase and architecture evaluation, UAT feedback analysis, and the preparation of handover documentation.

---

## Slide 19 — Requirements (title)

Now, my project requirements.

---

## Slide 20 — Functional Requirements: General Module

The General Module covers three use cases. UC-1 *Login Account* allows all three roles — Athlete, Medical Staff, and Administrator — to log in with authenticated session management. UC-2 *Reset Password* is the documented password recovery use case for Medical Staff and Administrator roles, planned for full email-driven implementation as part of the deployment phase. UC-3 *Role-Based Access Control* restricts access to features and pages based on the assigned user role, and is the security backbone of the system.

---

## Slide 21 — Functional Requirements: Activity Tracking & Logging Module

For the Activity Tracking and Logging Module, UC-4 lets athletes log activities with details such as type, duration, intensity, and date. UC-5 lets them view their activity history, filterable by type and date range. UC-6 and UC-7 cover editing and deleting previously logged entries. And UC-8 is a system use case — the application automatically computes the total weekly activity load from logged entries, which feeds the Dashboard module.

---

## Slide 22 — Functional Requirements: Athlete Dashboard / Workload Module

For the Athlete Dashboard and Workload Module, UC-9 computes the acute one-week and chronic four-week rolling average load to derive the ACWR. UC-10 displays the workload data to the athlete through charts. UC-11 applies rule-based thresholds to the ACWR value to classify current injury risk as Low, Moderate, or High — and as a system-level extension, AIRMS personalises these thresholds per athlete using their screening data, and escalates the risk band when active injuries or muscle flags are present. This composite layer integrates workload, biomechanical profile, and injury history into a single classification, which is the main system contribution of this project. UC-12 displays the risk level to the athlete with a clear visual indicator and brief explanation. UC-13 generates a prominent alert on the dashboard when the athlete's risk level is Moderate or High.

---

## Slide 23 — Functional Requirements: Injury & Recovery Logging Module

For the Injury and Recovery Logging Module, UC-14 lets medical staff log official injuries against an athlete, including body part, side, injury type, severity, and date. UC-15 covers updating the recovery status of a logged injury. UC-16 lets medical staff and administrators view all official injury records associated with a specific athlete, and UC-17 covers deletion of records.

UC-18 lets athletes submit a self-reported injury, which enters a Pending state awaiting medical staff review. UC-19 is the review action — medical staff review the pending report and either approve it into the official record or reject it with a note. UC-20 lets athletes view the status of their submitted reports — Pending, Approved, or Rejected — along with any reviewer notes attached.

---

## Slide 24 — Functional Requirements: Data Management Module

For the Data Management Module, UC-21 lets medical staff and administrators upload an Excel file containing screening data, with column validation before committing to the database. UC-22 is the system validation step — checking the uploaded file for missing fields, incorrect formats, and duplicate records before commitment. UC-23 provides administrators with a log of past data imports, and UC-24 lets them remove a previously imported dataset from the system when needed.

---

## Slide 25 — Functional Requirements: Admin Injury Analytics Dashboard Module

For the Admin Injury Analytics Dashboard Module, UC-25 displays a holistic summary of all injury records, including total cases, injury type distribution, and body part breakdown. UC-26 lets administrators filter the injury overview by sport, gender, age group, body part, injury type, and date range. UC-27 displays injury trends over time at monthly, quarterly, and yearly intervals to identify peak risk periods. UC-28 generates a downloadable PDF report based on currently applied filters and displayed data.

---

## Slide 26 — Functional Requirements: Medical Staff Dashboard Module

For the Medical Staff Dashboard Module, UC-29 lets medical staff search for a specific athlete by name or ID. UC-30 displays the athlete's profile summary — personal details, sport, age, gender, and physical information in a single view. UC-31 displays the full chronological injury history of the selected athlete. UC-32 shows how the athlete's injury patterns have developed over time. UC-33 contextualises the athlete against their sport's general patterns, so medical staff can interpret the individual against their cohort. UC-34 displays the logged activity and ACWR trend of the athlete from the medical staff's perspective, mirroring the athlete's own dashboard so the clinician sees the same composite-risk picture the athlete sees.

---

## Slide 27 — Non-Functional Requirements

My non-functional requirements cover **Security**, through Role-Based Access Control restricting user actions based on predefined roles — each role has access only to specific modules and functionalities relevant to their responsibility. And **Usability**, ensuring the interface is clean, intuitive, and consistent in layout across modules — designed so users can operate the system with minimal guidance and no steep learning curve.

---

## Slide 28 — Analysis and Design (title)

Moving on to System Analysis and Design.

---

## Slide 29 — Functional Decomposition Diagram

This is my Functional Decomposition Diagram. The root system decomposes into six modules — Activity Tracking and Logging, Athlete Dashboard and Workload, Injury and Recovery Logging, Data Management, Admin Injury Analytics Dashboard, and Medical Staff Dashboard — each broken down further into their respective use cases.

---

## Slides 30 to 36 — Use Case Diagrams

I have one Use Case Diagram per module, giving seven UC diagrams in total covering the General Module, Activity Tracking, Dashboard and Workload, Injury and Recovery Logging, Data Management, Admin Injury Analytics Dashboard, and Medical Staff Dashboard.

---

## Slide 37 — Entity Relationship Diagram

Here is my Entity Relationship Diagram. The core entities are User, Athlete, Medical Staff, Administrator, Activity Log, Injury Record, Self-Report Submission, and Import Record. The User entity links the three role-specific tables. Activity Log and Self-Report Submission both reference Athlete; Injury Record links Athlete and Medical Staff. Self-Report Submission links to Injury Record on approval, capturing the promotion flow from self-report to official record.

---

## Slide 38 — Activity Diagram: Data Import Workflow

This activity diagram covers UC-21 to UC-22, the Data Import Workflow. The user uploads the Excel file; the system reads the structure, checks for required column headers, validates each row for missing values and duplicate records, and either returns an error report with affected rows or commits all records and saves an import log.

---

## Slide 39 — Activity Diagram: Admin Injury Analytics Dashboard

This activity diagram covers UC-25 to UC-28. The administrator navigates to the dashboard, the system retrieves and aggregates all injury records, renders the overview, and re-renders on filter or temporal-view change. PDF generation is an extension flow that compiles the displayed data into a downloadable file.

---

## Slide 40 — Activity Diagram: Self-Reported Injury Workflow

This activity diagram covers UC-18 to UC-20, the Self-Reported Injury Workflow. The athlete submits a report which the system validates and saves with status Pending. Medical staff navigates to the submissions list, reads the submission, and decides — approval creates an official Injury Record and links the submission to it, while rejection saves a rejection note. The athlete can then view the final status.

---

## Slides 41 to 47 — User Interface Design

Here are my user interface designs.

The **Login Page** with role selection and the split branded card.

The **Athlete Dashboard Page** showing the composite risk hero, weekly load tiles, the workload trend chart with ACWR overlay, the risk indicator radar, and the muscle assessment body map. Alongside it is the **Athlete Activity Page** with the log form, live load preview, and history table.

The **Athlete Injury Report Page** with the self-report form and submission history showing review states, and the **Athlete Profile Page**.

The **Medical Dashboard Page** with athlete search and filter, the per-athlete profile summary, the latest screening scores, the risk indicators radar, the workload trend, and the muscle assessment map — essentially the athlete's own dashboard viewed by a clinician, with a deep-linked Log Injury affordance.

The **Medical Report Review Page** with tabbed Pending, Approved, and Rejected submissions, and the **Medical Injury Logging Page** for recording official injury records.

The **Admin Dashboard Page** with the filter strip, KPI cards, body part and injury type distribution charts, and the temporal trend, alongside the **Admin Report Page** with the report builder and live preview.

And the shared **Data Upload Page** with drag-drop, file validation, and recent imports list, along with the shared **Profile Page** used by all three roles.

---

## Slide 48 — Technical Implementation

This is the technical stack I am using. **Next.js** for the frontend, **Node.js with Express** for the backend, and **MongoDB** for the database. The frontend communicates with the backend through a REST API protected by authenticated session management.

---

## Slide 49 — System Demonstration

I will now briefly demonstrate the system, walking through the three role flows — athlete, medical staff, and administrator — using the seeded demo credentials.

---

## Slide 50 — First Stakeholder Meeting

To demonstrate my stakeholder collaboration initiative, here is an image of my first stakeholder meeting with my collaborator Dr. Thung Jin Seng from Institut Sukan Negara, and my supervisor Dr. Hoo Wai Lam, present.

---

## Slide 51 — Signed Collaboration Letter

Here is the collaboration letter signed by Professor Dr. Nor Liyana Mohd Shuib, the Deputy Dean Undergraduate of the Faculty of Computer Science and Information Technology; Dr. Hoo Wai Lam, my project supervisor; and Dr. Thung Jin Seng, my collaborator from ISN.

---

## Slide 52 — References

Here are my references for the project development — the five primary papers covered earlier (Qin 2025, Costello 2024, Sprouse 2024, Inoue 2022, and Yang 2024), and the four commercial systems used in the comparison.

---

## Slides 53 to 54 — Project Logbook

And here is my current project logbook progress, with seven entries spanning six general meetings with my supervisor and one stakeholder meeting with my collaborator.

---

## Slide 55 — Thank You

Thank you very much.
