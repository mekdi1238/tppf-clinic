# TPPF Clinic Management System — Comprehensive User & Administration Guide

---

## Table of Contents

1. [System Architecture & Quick Start](#1-system-architecture--quick-start)
   - 1.1 Overview & Core Architecture
   - 1.2 Accessing the System & Network Setup
   - 1.3 Windows Service Deployment & Maintenance Scripts
   - 1.4 Database Management & Migrations
2. [Identity, Roles & Fine-Tuned Permissions Engine](#2-identity-roles--fine-tuned-permissions-engine)
   - 2.1 Predefined System Roles
   - 2.2 Two-Tier Permission Resolution Order
   - 2.3 Fine-Tuning Permissions Matrix (Checkbox System)
   - 2.4 Predefined Role Defaults Customization
   - 2.5 User Account Creation, Editing & Deactivation
3. [Departments & Positions Management](#3-departments--positions-management)
   - 3.1 Overview & Cascading Synchronization
   - 3.2 Adding a Department (with Bulk Initial Positions)
   - 3.3 Editing & Renaming Departments (Automatic System Sync)
   - 3.4 Safe Department Deletion & Record Reassignment
   - 3.5 Managing Job Positions (Add, Edit, Delete)
4. [Clinical Operations & Daily Care Workflow](#4-clinical-operations--daily-care-workflow)
   - 4.1 Adaptive Role-Based Dashboard & 1-Week Renewal Banner
   - 4.2 Patient Registration & Management
   - 4.3 Integrated Camera & Photo Upload Widget
   - 4.4 Clinical Visits Lifecycle (Open &rarr; Examined &rarr; Diagnosed &rarr; Closed)
   - 4.5 Vitals Recording & History
   - 4.6 Clinical Consultation, Treatment & Workplace HR Notes
   - 4.7 Inpatient Ward Admissions & Bed Management
5. [Occupational Health, Workforce & Compliance](#5-occupational-health-workforce--compliance)
   - 5.1 Periodic 6-Month Medical Check-ups & Card Renewals
   - 5.2 Editing Historical Exam Dates (Backdating & Auto-Recalculation)
   - 5.3 Department HR Portal (Staff Dispatch, Renewals & Sick Leaves)
   - 5.4 Pre-Employment Candidate Registrations & Intake
   - 5.5 "Accept as Staff" Automatic Patient Promotion
   - 5.6 Medical Fitness Certifications & Official Certificates
6. [Clinical Ancillary Services: Laboratory & Pharmacy](#6-clinical-ancillary-services-laboratory--pharmacy)
   - 6.1 Laboratory Information System (LIS)
   - 6.2 Multi-Panel Lab Catalog (Hematology, Parasitology, Chemistry, etc.)
   - 6.3 Ordering Tests, Entering Results & Technician Notes
   - 6.4 Pharmacy & Formulary Management
   - 6.5 Prescription Writing & Queue
   - 6.6 Medication Dispensing & Real-time Stock Deduction
   - 6.7 Drug Inventory Control, Expiry Alerts & Restocking
7. [Referrals, Sick Leaves & Document Generation](#7-referrals-sick-leaves--document-generation)
   - 7.1 External Medical Referrals
   - 7.2 Sick Leave Certificates & Duration Tracking
   - 7.3 Standardized Printing Engine (Certificates, Rx, Leaves, Reports)
8. [Data Tools, Security & System Administration](#8-data-tools-security--system-administration)
   - 8.1 Universal Data Export Engine (CSV & Excel)
   - 8.2 Universal Data Import Engine (Patients, Candidates, Drugs)
   - 8.3 Activity & Audit Logging with JSON Diff Inspection
   - 8.4 Archive & Soft-Deletion Recovery
   - 8.5 Automated Database Backups & Recovery Scheduler
   - 8.6 Clinic Profile & Personal Security Settings
9. [Appendix: Master Permission Key Reference](#9-appendix-master-permission-key-reference)

---

## 1. System Architecture & Quick Start

### 1.1 Overview & Core Architecture
The **TPPF Clinic Management System** is an enterprise-grade occupational health and clinical management platform designed to replace legacy Microsoft Access workflows with a modern, secure, and relational architecture. It combines day-to-day outpatient and inpatient clinical workflows with company workforce management, periodic health surveillance, pre-employment screening, laboratory diagnostics, and pharmaceutical inventory control.

The system is engineered as a monolithic web application:
- **Backend**: Node.js and Express RESTful API (`/server`).
- **Database**: PostgreSQL with transactional schema migrations (`/db/migrations`).
- **Frontend**: High-performance, reactive Vanilla HTML5/CSS3/JavaScript (`/client`) served directly by the Express server. There is no separate frontend node server or complex build pipeline required.
- **Port**: Unified single port (default: `http://localhost:3000`).

### 1.2 Accessing the System & Network Setup
1. **Local Access**: Open any modern web browser (Google Chrome, Microsoft Edge, Firefox) and navigate to:
   ```
   http://localhost:3000
   ```
2. **Local Area Network (LAN) Access**: The clinic server can be accessed across the internal network (e.g. from nurse stations, doctor offices, pharmacy counters, laboratory desks, and HR offices) by navigating to the host server's local IP address:
   ```
   http://192.168.x.x:3000
   ```
3. **Default System Administrator Credentials** (seeded during installation):
   - **Username**: `admin`
   - **Password**: `admin123`
   *(Immediately change this password upon initial setup via the Settings / Profile menu).*

### 1.3 Windows Service Deployment & Maintenance Scripts
The application is pre-packaged with a Windows Service wrapper (`WinSW` / `ClinicDeployService.exe`) located in the root directory `D:\tppf-clinic`, allowing the system to run 24/7 in the background and boot automatically when the host computer starts:

- **`install_service.bat`**: Registers the Node.js server as a native Windows Service (`TPPFClinicDeployService`).
- **`service_status.bat`**: Queries the service state (`RUNNING`, `STOPPED`, `START_PENDING`).
- **`uninstall_service.bat`**: Safely stops and de-registers the Windows Service.
- **`deploy.bat`**: Production deployment script that stops the service, runs pending database migrations, refreshes assets, and restarts the service.
- **`setup.bat`**: Quick-start setup script to initialize environment variables, install npm dependencies, and run database migrations.

### 1.4 Database Management & Migrations
All database structural changes are controlled through numbered, atomic SQL migration files in `db/migrations/`:
- **Check Migration Status**:
  ```powershell
  npm run migrate:status
  ```
- **Apply Pending Migrations**:
  ```powershell
  npm run migrate:up
  ```
- **Rollback Last Migration**:
  ```powershell
  npm run migrate:down
  ```
- **Seed Baseline Data** (Roles, initial admin user, standard lab test catalog):
  ```powershell
  npm run seed
  ```

---

## 2. Identity, Roles & Fine-Tuned Permissions Engine

The system features a dual-layer security model combining high-level **Predefined System Roles** with a granular **Per-User Fine-Tuning Permission Matrix**.

```
                           +-------------------------------------+
                           |      User Attempts An Action        |
                           +-------------------------------------+
                                              |
                                              v
                         +-----------------------------------------+
                         | Does user have an explicit custom       |
                         | override in user_permissions?           |
                         +-----------------------------------------+
                                         /          \
                                  YES   /            \  NO
                                       v              v
               +-----------------------------+  +--------------------------------+
               | Override = TRUE  --> ALLOW  |  | Check merged role defaults     |
               | Override = FALSE --> DENY   |  | from assigned roles:           |
               +-----------------------------+  | Permitted in role --> ALLOW    |
                                                | Not in role       --> DENY     |
                                                +--------------------------------+
```

### 2.1 Predefined System Roles
Every staff member is assigned one or more predefined roles:
1. **System Administrator (`system_administrator`)**: Unrestricted master access across all modules, configuration, database backups, audit logs, and user management.
2. **Physician (`physician`)**: Clinical consultation, examination notes, diagnostic confirmation, inpatient admissions, laboratory ordering, prescription writing, external referrals, sick leaves, and medical fitness certifications.
3. **Receptionist (`receptionist`)**: Front-desk operations, patient registration, walk-in intake, creating visits, and initial candidate onboarding.
4. **Lab Technician (`lab_technician`)**: Laboratory queue access, conducting tests, recording qualitative/quantitative result values, reference range evaluations, and entering technical notes.
5. **Pharmacist (`pharmacist`)**: Medication dispensing against active prescriptions, drug inventory stock control, batch/lot tracking, expiry monitoring, and restock adjustments.
6. **HR / Admin (`hr_admin`)**: Workforce operations, candidate registrations, medical certifications, employee hiring, checkup dispatching, departmental reporting, and user account creation.
7. **Department HR (`department_hr`)**: Scoped departmental portal allowing supervisors to monitor their department staff, dispatch workers to the clinic, monitor 6-month checkup renewals, and review issued sick leave certificates.
8. **HR Reporting (`hr_reporting`)**: Read-only reporting and business intelligence access to export custom analytical reports and audit logs.

### 2.2 Two-Tier Permission Resolution Order
When a user attempts to view a page or perform an action (Create, Edit, Delete, or Special):
1. **Tier 1 (Explicit User Override - Highest Priority)**: The system checks the `user_permissions` table for this specific user:
   - If the permission is set to `TRUE`, access is **granted**, even if none of the user's roles have it.
   - If the permission is set to `FALSE`, access is **denied**, even if their assigned role normally permits it.
2. **Tier 2 (Predefined Role Defaults - Baseline)**: If no explicit override exists for that specific permission key, the system checks the baseline `default_permissions` of all roles assigned to the user. If any assigned role includes the permission, access is granted.

### 2.3 Fine-Tuning Permissions Matrix (Checkbox System)
Located in **Administration &rarr; Users & Roles &rarr; Create / Edit User Modal**:

#### Visual Interface & Indicators
Under the user details form, the **Fine-Tune Permissions Matrix** displays an interactive grid of every system module broken down by CRUD actions (**View**, **Create**, **Edit / Update**, **Delete**) plus **Special Actions**:
- **Role Default (Neutral / Checked)**: A standard checkbox representing permissions automatically granted by the assigned role(s).
- **Explicitly Added (Green Highlight / Bold Text)**: Checked box highlighted in green (`background: rgba(18, 129, 122, 0.15)`). This indicates the user has been granted a capability above and beyond their normal role.
- **Explicitly Revoked (Red Highlight / Strikethrough Text)**: Unchecked box highlighted in red with strikethrough text. This indicates an action that has been explicitly denied for this user, disabling it despite their role.

#### Matrix Features & Controls
1. **Dynamic Checkbox Adjustment**: Simply checking or unchecking any individual cell toggles an explicit override. The UI immediately applies green/red visual badges indicating the override state.
2. **Row "Toggle All" Button**: Located beside each module name (e.g. *Patients*, *Visits*, *Laboratory*). Clicking **Toggle All** simultaneously toggles all actions in that row on or off.
3. **"Reset to Role Defaults" Button**: Located at the bottom right of the matrix. Clicking this instantly discards all custom overrides and restores every checkbox to match the baseline defaults of the selected roles.
4. **Automatic Role Sync**: When selecting or deselecting roles in the checkboxes above the matrix, the baseline defaults dynamically re-calculate in real time while preserving any manual overrides already made.

### 2.4 Predefined Role Defaults Customization
System Administrators can customize the baseline permissions for any role:
1. Navigate to **Administration &rarr; Users & Roles**.
2. Click the **Predefined System Roles** tab.
3. Locate the role and click **Edit Role Defaults**.
4. Use the interactive matrix to check or uncheck which modules and actions should be granted by default to anyone assigned that role.
5. Click **Save Role Defaults**. All users who rely on that role's baseline defaults immediately reflect the updated permissions.

### 2.5 User Account Creation, Editing & Deactivation
- **Create User**: Click **New User**, enter Username, Password (&ge; 6 characters), Full Name, optional linked Physician profile (required for doctors to sign medical orders), select assigned roles, optional Department (if Department HR), and customize granular permissions in the matrix.
- **Edit User**: Click the Edit icon on any user row. Update credentials, reset password (leave blank to keep existing password), modify roles, or fine-tune individual permission checkboxes.
- **Deactivate / Activate**: Toggle account status without deleting clinical records associated with the user.
- **Delete User (Hard Delete)**: Permitted only if the account has no mandatory database dependencies, or cascades non-vital records according to migration rules.

---

## 3. Departments & Positions Management

The **Departments & Positions** module (`/client/departments.html`) is a core administrative feature that governs organizational structure across the clinic, workforce registrations, and departmental HR access.

### 3.1 Overview & Cascading Synchronization
In occupational healthcare, tracking employee placement across company divisions (e.g. *Production*, *Technic*, *Quality Control*, *Finance*) is essential. The TPPF Clinic Management System provides full CRUD operations for departments and job titles, backed by an **Automatic System Sync Engine**.

### 3.2 Adding a Department (with Bulk Initial Positions)
To register a new company department:
1. Navigate to **Administration &rarr; Departments & Positions**.
2. Click **Add Department** (`#new-dept-btn`).
3. Fill in the modal fields:
   - **Department Name (\*)**: Official title (e.g. `Quality Assurance`, `Packaging Line`). Names must be unique.
   - **Display Order**: Integer value (e.g. `1`, `2`, `10`). Lower numbers appear first in dropdown menus across all forms in the system.
   - **Initial Positions (Optional Textarea)**: Allows rapid bulk onboarding of positions. Enter job titles **one per line**, for example:
     ```
     QA Manager
     Senior Quality Inspector
     Line Tester
     Junior Sample Collector
     ```
4. Click **Create Department**. The department and all entered positions are created atomically in a single database transaction.

### 3.3 Editing & Renaming Departments (Automatic System Sync)
To modify an existing department:
1. In the Departments list, click the **Edit** button on any department card.
2. Update the **Department Name** or **Display Order**.
3. Click **Save Changes**.

> [!IMPORTANT]
> **Automatic System Sync Engine**:
> When a department is renamed, the backend automatically performs a cascading update across all existing tables in a transactional batch:
> - All registered **Patients** (`patients.department`)
> - All **Pre-Employment Registrations** (`employee_registrations.department`)
> - All **User Accounts** assigned to Department HR (`users.department`)
> This ensures that historical and active records stay synchronized without creating broken references, duplicates, or orphaned profiles.

### 3.4 Safe Department Deletion & Record Reassignment
If a department is no longer operational, the system enforces strict referential integrity to prevent data loss:
1. Click the **Delete** button on the department card.
2. **If NO patients or candidate registrations exist**: The system prompts for standard confirmation and safely deletes the department and its linked positions.
3. **If patients or candidates ARE currently assigned to this department**:
   - The deletion modal detects active records and displays a warning: e.g. *"This department contains 14 patient(s) and 3 candidate registration(s)."*
   - Direct deletion is blocked. The modal displays a mandatory **"Reassign existing records to:"** dropdown.
   - Select a target destination department (e.g. `General` or `Production`).
   - Click **Delete Department**. The system reassigns every patient and candidate record to the selected target department first, and then safely deletes the original department.

### 3.5 Managing Job Positions (Add, Edit, Delete)
Each department displays its assigned job positions directly inside its card:
- **Add Position**: Click the **+ Add Position** button on the department card. Enter the **Position Title** (e.g. `Forklift Operator`) and optional **Display Order**.
- **Edit Position**: Click the pencil icon beside any position tag. Renaming a position triggers an automatic cascade that updates all patient and candidate records holding that job title in that department.
- **Delete Position**: Click the delete icon beside a position tag. Confirms and removes the position from future dropdown selections.

---

## 4. Clinical Operations & Daily Care Workflow

### 4.1 Adaptive Role-Based Dashboard & 1-Week Renewal Banner
When users log in, the dashboard (`dashboard.html`) automatically adapts its widgets and statistical metrics to their professional role:
- **Physician View**: Focuses on clinical queues &mdash; *Awaiting Exam*, *Examined / Awaiting Diagnosis*, *Diagnosed / Awaiting Close*, and the *My Open Visits* queue.
- **Receptionist View**: Focuses on patient flow &mdash; *Patients Registered Today*, *Visits Checked In Today*, *Candidates Registered Today*, and the *Recent Check-ins* queue.
- **Lab Technician View**: Focuses on diagnostic workflow &mdash; *Pending Orders*, *In Progress*, *Completed Today*, and the *Laboratory Queue* with 1-click test entry links.
- **Pharmacist View**: Focuses on formulary and dispensing &mdash; *Active Prescriptions*, *Drugs Below Reorder Threshold*, and the *Prescriptions to Dispense* queue.
- **Administrator / HR View**: High-level operational metrics &mdash; *Active Patients*, *Visits Today*, *Open Visits*, *7-Day Visit Volume SVG Line Chart*, and *Visit Status Donut Breakdown*.

#### Proactive 1-Week Check-up Renewal Alert Banner
If any company employee has a 6-month medical fitness card expiring within 7 days or overdue, an alert banner automatically displays across the top of the dashboard:
> **1-Week Medical Check-up Renewal Alert**: *X active employee(s) have 6-month medical fit cards expiring within 7 days or overdue.*
> [ **View Due Check-ups & Dispatch (X)** ] &mdash; Links directly to the checkup dispatch engine.

### 4.2 Patient Registration & Management
Located in **Clinical Overview &rarr; Patients** (`patients.html`):
- **Search & Filter**: Real-time search across patient full name, unique patient code (e.g. `P-00142`), and phone number. Filter by active/inactive status and company department.
- **Creating a Walk-in Patient**: Click **New Patient**:
  - Full Name, Date of Birth, Gender.
  - **Department Dropdown**: Populated dynamically from the Departments module.
  - **Position Dropdown**: Dynamically filters to show only the job titles valid for the selected department.
  - Contact Details: Phone number, residential location, woreda/kebele address.
- **Patient Detail Dossier**: Clicking any patient row opens their complete medical record:
  - Demographics and profile photo.
  - Longitudinal chronological history: all clinical visits, recorded vitals readings, ward admissions, lab results, dispensed prescriptions, referrals, fitness certificates, and sick leaves.
  - Quick action buttons: **Start New Visit**, **Record Certificate**, **Edit Patient**, **Archive Patient**, or **Hard Delete** (super-admin only).

### 4.3 Integrated Camera & Photo Upload Widget
The system includes an integrated camera widget (`camera.js`) for patient identification and candidate verification:
1. On patient or candidate forms, click **Capture Photo**.
2. Grants access to the computer's connected webcam.
3. Displays a live camera feed with an alignment oval.
4. Click **Take Snapshot** to capture and preview the photo.
5. Alternatively, click **Upload File** to select an existing JPG, PNG, or WebP image from the local disk.
6. The image is compressed and stored as a data URI / photo record, appearing on patient dossiers, medical fit cards, and registration lists.

### 4.4 Clinical Visits Lifecycle
Located in **Clinical Overview &rarr; Visits** (`visits.html`):

```
+-----------------------------------------------------------------------------------+
|                            CLINICAL VISIT LIFECYCLE                               |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|   1. OPEN             Patient arrives, Receptionist/Nurse creates visit,          |
|                       selects attending physician, records chief complaint.       |
|          |                                                                        |
|          v                                                                        |
|   2. EXAMINED         Nurse/Doctor records vitals (BP, pulse, temp, weight).      |
|                       Doctor conducts physical examination and records findings.  |
|          |                                                                        |
|          v                                                                        |
|   3. DIAGNOSED        Doctor confirms formal diagnosis and management plan.       |
|                       Orders lab tests, writes prescriptions, or referrals.       |
|          |                                                                        |
|          v                                                                        |
|   4. CLOSED           Doctor selects disposition (Discharged / Admitted /         |
|                       Referred), enters HR advice, and confirms closure.          |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

1. **Step 1: Open Visit**:
   - Receptionist or nurse clicks **New Visit**.
   - Select patient via the searchable dropdown (search by name, code, or phone).
   - Select the attending physician.
   - Enter the patient's **Chief Complaint** (e.g. `Severe headache and fever for 2 days`).
   - Click **Open Visit**. Status is initialized to `open`.
2. **Step 2: Examination & Vitals**:
   - The attending physician or nurse opens the visit dossier.
   - Record vitals (see section 4.5).
   - Enter detailed **Examination Notes** describing physical findings.
   - Click **Mark as Examined**. Status advances to `examined`.
3. **Step 3: Diagnosis & Treatment**:
   - Physician enters the formal **Diagnosis** (e.g. `Acute Bacterial Tonsillitis`).
   - Enter the **Treatment Plan** (e.g. `Hydration, oral antibiotics, 2 days rest`).
   - Ancillary orders can be launched directly from within the visit window:
     * Click **Order Lab Tests** (opens laboratory order composer).
     * Click **Write Prescription** (opens multi-item pharmacy composer).
     * Click **Issue Sick Leave** (opens certificate generator).
   - Click **Confirm Diagnosis**. Status advances to `diagnosed`.
4. **Step 4: Disposition & Close**:
   - Physician enters optional **Note to HR / Physician Advice** (e.g. *Fit for light duty only, avoid heavy lifting for 3 days*).
   - Select **Disposition**:
     * `Discharged`: Standard outpatient resolution.
     * `Admitted`: Patient requires inpatient ward care (enables *Create Admission Record*).
     * `Referred`: Patient transferred to external specialist hospital (enables *Create Referral Letter*).
   - Click **Close Visit**. Status advances to `closed`. Closed visits cannot be edited by non-administrators, ensuring audit security.

### 4.5 Vitals Recording & History
Within the visit window, staff can record multiple sequential vitals readings (e.g. pre-treatment and post-treatment monitoring):
- **Temperature (°C)**: e.g. `37.2`
- **Blood Pressure (Systolic / Diastolic)**: e.g. `120 / 80 mmHg`
- **Pulse Rate**: Beats per minute (e.g. `72 /min`)
- **Respiratory Rate**: Breaths per minute (e.g. `18 /min`)
- **Weight (kg)** & **Height (cm)**
Each reading is stamped with the exact date, time, and user, displayed as chronological vitals cards.

### 4.6 Clinical Consultation, Treatment & Workplace HR Notes
The visit screen provides designated fields for occupational health documentation:
- **Treatment Field**: Details procedural care administered in the clinic (e.g. wound dressing, IV fluids, nebulization).
- **Note to HR / Workplace Advice**: Specifically isolated from confidential clinical notes so it can be safely communicated to factory managers and HR supervisors regarding work restrictions, ergonomic adjustments, or return-to-work fitness.

### 4.7 Inpatient Ward Admissions & Bed Management
Located in **Clinical Overview &rarr; Admissions** (`admissions.html`):
- **Eligibility**: Any visit with disposition set to `Admitted` is automatically listed as eligible for ward admission.
- **Admit Patient**: Click **New Admission**, select the eligible visit, admitting physician, admission date/time, admitting diagnosis/reason, and assign a **Bed / Room Number**.
- **Ward Round Notes**: During inpatient hospitalization, physicians and nurses can log ongoing clinical notes stamped with date and time.
- **Discharge Workflow**: When inpatient treatment is complete, click **Discharge Patient**. Record the discharge date/time, discharge notes/condition (e.g. `Recovered`, `Referred to tertiary hospital`), and confirm. The bed is freed and status changes to `discharged`.

---

## 5. Occupational Health, Workforce & Compliance

### 5.1 Periodic 6-Month Medical Check-ups & Card Renewals
Under national and industrial occupational health regulations, manufacturing and food-handling employees must undergo routine periodic medical examinations every 6 months.

Located in **Clinical Overview &rarr; Periodic Check-ups** (`checkups.html`):
- **Automated Expiry Tracking**: The system tracks the date of every employee's last medical fitness examination and calculates the exact 6-month expiration date (`last_exam_date + 6 months`).
- **Live Status Badges**:
  - `Active Fit` (Green): Card is valid with more than 7 days remaining.
  - `Notice: Renewal Due Soon` (Yellow): Card expires within 7 days.
  - `Expired (Overdue)` (Red): Card has passed the 6-month validity threshold. Shows overdue days (e.g. *Overdue 12d*).
  - `No Certificate Recorded` (Orange): Newly hired or registered employee who has not yet undergone their initial fitness exam.
  - `Renewal Visit Created` (Blue): A renewal visit has already been dispatched and is currently in progress.
- **Dispatch Renewal Action**: Clicking **Dispatch Renewal** or **Start Exam Visit** automatically creates a clinical visit specifically tagged for periodic renewal, pre-populating the chief complaint and opening the consultation window.

### 5.2 Editing Historical Exam Dates (Backdating & Auto-Recalculation)
Clinics migrating historical paper fit cards or correcting backlogged records can adjust examination dates directly:
1. In the Periodic Check-ups table, click the **Edit Date** button beside any employee record.
2. In the **Edit Fitness Exam Date** modal, select the actual historical date when the exam took place.
3. Click **Save Exam Date**.
4. The system updates the record and **automatically recalculates** the 6-month card expiration date and days remaining from that new base date.

### 5.3 Department HR Portal
Located in **Workforce &rarr; Dept HR Portal** (`dept-hr.html`):
Specifically restricted to users with the `Department HR` role (or administrative managers), automatically scoped exclusively to their own department staff.

It contains three distinct tabs:
1. **Dispatch to Clinic**:
   - Displays all active workers in their department.
   - When an employee reports sick or is injured on the factory floor, the supervisor clicks **Dispatch to Clinic**.
   - Enter the reason for referral (e.g. *Eye irritation from chemical splash*, *Severe cough*, *Routine checkup*).
   - Creates a pending arrival record at the clinic reception.
2. **Check-up Renewals**:
   - Department supervisors can view the exact compliance percentage and upcoming checkup renewals for their department's workforce.
   - Displays days remaining until fitness card expiration for each worker.
   - Supervisor can dispatch staff members for their periodic medical exam directly from this tab.
3. **Sick Leaves & Certificates**:
   - Displays all medical sick leave certificates issued by clinic physicians to workers in their department.
   - Shows employee code, name, leave start date, leave end date, **Total Duration** (e.g. *3 Days*), and the physician's official workplace advice.
   - Supervisor can view and click **Print Sick Leave Certificate** to retain physical verification for factory payroll and timekeeping.

### 5.4 Pre-Employment Candidate Registrations & Intake
Located in **Workforce &rarr; Employee Registrations** (`registrations.html`):
- **Candidate Onboarding**: Used to register job applicants before they are formally hired.
- Click **New Registration**: Record candidate name, DOB, gender, target department, position applied for, education level, marital status, emergency contact, and photo.
- **Workflow Status**: Initial state is `pending`. Candidate undergoes pre-employment physical examination and laboratory testing.
- **Certify Candidate**: Once exams are complete, doctor records a fitness certificate marking the candidate as `certified_fit` or `certified_unfit`.

### 5.5 "Accept as Staff" Automatic Patient Promotion
When an applicant is successfully hired:
1. On the Candidate Registration dossier, click **Accept as Staff** (or **Hire Candidate**).
2. The system triggers an atomic database promotion:
   - Sets registration status to `accepted_as_staff`.
   - **Automatically creates a permanent Patient Record** in the clinic register, transferring their demographics, department, job position, photo, and linking their source registration code.
   - All pre-employment certifications and medical history are immediately linked to their new active employee patient dossier.

### 5.6 Medical Fitness Certifications & Official Certificates
Located in **Workforce &rarr; Certifications** (`certifications.html`):
- Can be issued for **Job Candidates** (Pre-employment fit exam) or **Existing Employees / Patients** (Periodic 6-month fit renewal).
- Comprehensive physical exam checklist:
  - Overall Physical Examination
  - Personal Hygiene
  - Skin Disease Screening
  - Stool Direct Examination
  - Serological Screening (Syphilis / VDRL, etc.)
  - General Clinical Findings & Remarks
- **Result Evaluation**: Mark as `Fit`, `Unfit`, or `Fit with Restrictions`.
- **Print Certificate**: Formatted printout complete with clinic letterhead, employee photo, examination breakdown, doctor signature line, and official clinic seal block.

---

## 6. Clinical Ancillary Services: Laboratory & Pharmacy

### 6.1 Laboratory Information System (LIS)
Located in **Clinical Services &rarr; Laboratory** (`laboratory.html`):
The clinic operates a multi-panel laboratory diagnostic system supporting outpatient consultations, inpatient monitoring, and pre-employment health screening.

### 6.2 Multi-Panel Lab Catalog
The test catalog is divided into specialized tabs and sub-panels:
1. **Hematology**:
   - *Cell Counts & Leukocyte Differentials*: WBC, Differential (DIFF), Complete Blood Count (CBC), Erythrocyte Sedimentation Rate (ESR), Hemoglobin (HGB), Hematocrit (HCT), Lymphocytes (LYMPH), Monocytes/Mid (MID), Granulocytes (GRAN).
   - *Erythrocyte & Thrombocyte Indices*: RBC, MCV, MCH, MCHC, RDW-CV, RDW-SD, Platelet Count (PLT), MPV, PDW, PCT.
   - *Serology & Rapid Tests*: Blood Film for Malaria (BF), C-Reactive Protein (CRP), Hepatitis C Antibody (HCVAb), Hepatitis B Surface Antigen (HBsAg), H. pylori Antibody (HPAb), RPR / VDRL (Syphilis).
   - *Weil-Felix & Widal (WWF)*: Salmonella O (SO), Salmonella H (SH), Proteus Ox19.
2. **Parasitology & Urinalysis**:
   - *Stool Examination*: Direct Stool Exam (STOOL), Stool Color, Stool Consistency, Microscopic Examination (STOOL-ME).
   - *Parasitology & Antigens*: Concentration Technique, H. pylori Stool Antigen (HPAg), Stool Occult Blood (FOBT).
   - *Urinalysis*: Complete physical, chemical, and microscopic urine sediment evaluation.
3. **Sed | Bacteriology | Other**:
   - Urine Sediment Microscopy, Gram Staining, Acid-Fast Bacilli (AFB), Body Fluid Analysis.
4. **Clinical Chemistry**:
   - Fasting Blood Sugar (FBS), Random Blood Sugar (RBS), Glycated Hemoglobin (HbA1c), Serum Creatinine, Blood Urea Nitrogen (BUN), Uric Acid, AST/SGOT, ALT/SGPT, Alkaline Phosphatase (ALP), Total Bilirubin, Direct Bilirubin, Lipid Profile (Cholesterol, Triglycerides, HDL, LDL).

### 6.3 Ordering Tests, Entering Results & Technician Notes
1. **Ordering Tests**:
   - Doctor or nurse clicks **New Lab Order** (or opens order from within a visit).
   - Select the patient/visit and attending physician.
   - Check off desired tests across the tabbed panels.
   - Enter optional **Physician Clinical Notes** (e.g. *Suspected typhoid vs malaria, please expedite*).
   - Click **Create Order**. Status is `pending`.
2. **Conducting Tests & Recording Results**:
   - Lab Technician opens the order from their dashboard or the Laboratory page.
   - Order status moves to `in_progress`.
   - Enter numerical values or qualitative findings (e.g. `Positive`, `Negative`, `13.5 g/dL`, `Normal`) for each test item.
   - The system displays standard reference ranges alongside input fields.
   - Enter **Technician Technical Notes** (e.g. *Slightly hemolyzed sample, confirmed on repeat*).
   - Technician name is recorded.
   - Click **Complete Order**. Status updates to `completed`.
3. **Printing Official Lab Reports**:
   - Click the **Print** icon on any completed lab order to generate an official laboratory investigation report.

### 6.4 Pharmacy & Formulary Management
Located in **Clinical Services &rarr; Pharmacy** (`pharmacy.html`):
Contains two integrated workspaces: **Prescriptions Queue** and **Drug Stock Inventory**.

### 6.5 Prescription Writing & Queue
1. **Prescription Writing**:
   - From the visit consultation screen or Pharmacy page, click **New Prescription**.
   - Select patient/visit and prescribing physician.
   - Add one or multiple medication lines using **+ Add Drug**:
     * Select drug from formulary.
     * Dosage (e.g. `500 mg`).
     * Frequency (e.g. `TID (Three times daily)`).
     * Duration (e.g. `5 days`).
     * Quantity prescribed (e.g. `15 tablets`).
     * Specific patient instructions (e.g. `Take after meals with plenty of water`).
   - Click **Submit Prescription**. Status is `active`.

### 6.6 Medication Dispensing & Real-time Stock Deduction
1. Pharmacist opens the active prescription from their queue.
2. Review prescribed items, dosage, and stock availability.
3. Click **Dispense Prescription**.
4. In the dispensing modal:
   - Confirm quantity dispensed for each drug item.
   - Select or enter batch/lot number and expiry date.
   - Pharmacist adds optional counseling notes.
5. Click **Confirm Dispense**:
   - Prescription status advances to `dispensed`.
   - The system **automatically deducts the dispensed quantity from the live drug inventory** in real time.
   - Generates a printable **Pharmacy Dispensing Slip / Receipt** for the patient.

### 6.7 Drug Inventory Control, Expiry Alerts & Restocking
Under the **Drug Stock** tab:
- **Formulary Catalog**: View all registered drugs, unit packaging (tablets, vials, bottles, ampoules), current quantity on hand, reorder threshold, maximum threshold, unit cost, batch number, and expiration date.
- **Automated Color Warnings**:
  - **Red Alert**: Stock quantity is at or below the reorder threshold (Low Stock) OR medication has passed its expiration date.
  - **Yellow Alert**: Medication is expiring within 30 days.
  - **Green Badge**: Healthy stock level.
- **Add New Drug**: Click **+ Add Drug** to register a new chemical entity or brand name in the clinic formulary.
- **Restock / Adjust Stock**: Click **Restock** on any drug item to log new supplier deliveries, adjust inventory counts after audits, and update batch numbers and expiration dates.
- **Export / Import Stock**: Bulk export formulary to Excel/CSV or import drug stock from supplier manifests.

---

## 7. Referrals, Sick Leaves & Document Generation

### 7.1 External Medical Referrals
Located in **Clinical Services &rarr; Referrals & Certificates &rarr; Referrals Tab** (`referrals.html`):
- Used when a patient requires specialized tertiary hospital care, advanced imaging, or emergency surgical consultation.
- Click **New Referral**:
  - Link to open clinical visit.
  - Target Healthcare Facility / Specialist Hospital (e.g. `Tikur Anbessa Hospital`).
  - Receiving Doctor / Department.
  - Urgency level: `Routine`, `Urgent`, or `Emergency`.
  - Clinical Summary, Provisional Diagnosis, and Detailed Reason for Referral.
- Click **Print Referral**: Produces an official external medical referral letter with clinic contact information and doctor signature blocks.

### 7.2 Sick Leave Certificates & Duration Tracking
Located in **Clinical Services &rarr; Referrals & Certificates &rarr; Sick Leaves Tab** (`referrals.html`):
- Legally binding medical rest certificates for company workers.
- Click **New Sick Leave**:
  - Select active visit.
  - **Leave Start Date** & **Leave End Date**.
  - **Automatic Duration Calculation**: The system automatically computes the total inclusive calendar days (e.g. `Leave Start: 2026-09-04, End: 2026-09-06 = 3 Days`).
  - Medical Reason / Clinical Diagnosis.
  - Workplace Limitations / Duty Restrictions (e.g. `Complete bed rest`, `Return to light desk work only`).
- Click **Issue Sick Leave**: Stored permanently in both patient history and the Department HR Portal.

### 7.3 Standardized Printing Engine
All clinical documents run through a centralized print controller (`printDocument.js`) formatted specifically for standard A4 and thermal receipt printers:
- Removes web navigation headers, sidebars, and buttons during printing.
- Embeds official clinic logo, header branding, and contact details.
- Includes timestamp, unique document reference numbers, barcode-ready identifiers, and official signature/stamp lines.
- **Printable Document Library**:
  1. *Medical Fitness Examination Certificate* (Pre-employment and 6-month fit cards)
  2. *Prescription Form & Dispensing Receipt*
  3. *Official Medical Referral Letter*
  4. *Certified Sick Leave Certificate*
  5. *Complete Outpatient Consultation & Visit Summary*
  6. *Laboratory Investigation Diagnostic Report*

---

## 8. Data Tools, Security & System Administration

### 8.1 Universal Data Export Engine (CSV & Excel)
The system includes a universal export module (`exportModal.js`):
- Accessible from page toolbars across: **Patients**, **Employee Registrations**, **Visits**, **Certifications**, **Laboratory**, **Pharmacy**, **Admissions**, **Referrals**, **Sick Leaves**, and **Audit Logs**.
- Click the **Export** button to launch the configuration modal:
  1. **Column Selector**: Check or uncheck specific fields to export only relevant data.
  2. **Filtering Options**: Filter dataset by date range, department, gender, status, or limit maximum rows.
  3. **File Format Selection**: Export as standard Comma Separated Values (`.csv`) or native Microsoft Excel (`.xlsx`).
  4. Instant download generated directly in the browser.

### 8.2 Universal Data Import Engine
The import module (`importModal.js`) enables bulk data onboarding:
- Supported datasets: **Patients Register**, **Candidate Registrations**, and **Drug Formulary Inventory**.
- **Download Template**: Download pre-formatted sample CSV templates with correct column headers.
- **Interactive File Upload**: Drag and drop CSV or Excel spreadsheet files.
- **Live Preview & Validation Table**: Inspect rows before committing them to the database; detects invalid dates, missing required fields, or format mismatches.
- **Conflict Handling**: Choose whether duplicate patient codes or drug names should be **skipped** or **updated**.
- Click **Confirm Import** to execute the bulk import in a safe transactional batch.

### 8.3 Activity & Audit Logging with JSON Diff Inspection
Located in **Administration &rarr; Activity Logs** (`audit-logs.html`):
- Regulatory-compliant, immutable audit trail of every modification across the clinic system.
- Logs: Exact Timestamp, User Full Name, Client IP Address, Module, Action Type (`CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `DISPENSE`, `IMPORT`), Target Record ID, and Human-readable Description.
- **Side-by-Side JSON Diff Inspection**:
  - Clicking any log entry opens the **Audit Detail Modal**.
  - Displays a color-coded **Before vs After** state comparison:
    * Red highlighting shows data values prior to modification.
    * Green highlighting shows data values after modification.
  - Ensures complete visibility into unauthorized edits, record deletions, or prescription alterations.

### 8.4 Archive & Soft-Deletion Recovery
Located in **Administration &rarr; Archive** (`archive.html`):
- When patients are deactivated or candidate applications are withdrawn, they are moved to the system archive rather than permanently deleted.
- Users with `archive.restore` permissions can browse archived records and click **Restore** to return the patient or candidate to active status with all historical records intact.
- Super Administrators can execute **Permanent Hard Delete** from this screen when regulatory retention periods expire.

### 8.5 Automated Database Backups & Recovery Scheduler
Located in **Administration &rarr; Database Backup** (`backup.html`):
- **On-Demand Manual Backup**: Click **Create Backup Now** to trigger an immediate full PostgreSQL database dump (`.sql` / compressed archive).
- **Automated Backup Scheduler**:
  - **Enable / Disable Toggle**: Turn automated background backups on or off.
  - **Frequency**: Choose `Hourly`, `Daily`, or `Weekly`.
  - **Time of Day**: Select execution time (e.g. `02:00 AM` during low clinic activity).
  - **Day of Week**: For weekly schedules, select execution day (e.g. `Sunday`).
  - **Retention Policy**: Set the number of historical backup files to keep (e.g. `14 backups`). Older backup archives are automatically purged to conserve disk space.
  - **Next Run Indicator**: Displays the exact calculated date and time of the next scheduled automated backup.
- **Download & Offsite Archival**: Click **Download** on any backup file to copy it to an external USB drive or secure offsite cloud storage.
- **Restore from Backup**: Administrators can restore the entire clinic database from any selected backup file in the event of hardware failure.

### 8.6 Clinic Profile & Personal Security Settings
Located in **Administration &rarr; Settings** (`settings.html`) and **Account Profile** (`profile.html`):
- **Clinic Branding Profile**: Configure Clinic Official Name, Tagline, Physical Address, and Telephone. These values automatically populate all printed certificates, referral forms, and receipts.
- **Password Security**: Every staff member can update their personal login password at any time (requires current password and new password of at least 6 characters).

---

## 9. Appendix: Master Permission Key Reference

| Permission Key | Human-Readable Action Label | Functional Module | Typical Assigned Roles |
|:---|:---|:---|:---|
| `nav.dashboard` | View Dashboard | Navigation | Administrator, Physician, Receptionist, Lab Tech, Pharmacist, HR Admin |
| `nav.patients` | View Patients Register | Navigation | Administrator, Physician, Receptionist, HR Admin |
| `nav.visits` | View Clinical Visits | Navigation | Administrator, Physician, Receptionist, HR Admin |
| `nav.admissions` | View Inpatient Admissions | Navigation | Administrator, Physician, HR Admin |
| `nav.checkups` | View Periodic Check-ups | Navigation | Administrator, Physician, Receptionist, HR Admin, Dept HR |
| `nav.registrations` | View Employee Registrations | Navigation | Administrator, Receptionist, HR Admin |
| `nav.certifications` | View Medical Certifications | Navigation | Administrator, Physician, HR Admin |
| `nav.dept_hr` | View Department HR Portal | Navigation | Department HR, Administrator |
| `nav.laboratory` | View Laboratory | Navigation | Administrator, Physician, Lab Tech |
| `nav.pharmacy` | View Pharmacy & Formulary | Navigation | Administrator, Physician, Pharmacist |
| `nav.referrals` | View Referrals & Sick Leaves | Navigation | Administrator, Physician, HR Admin |
| `nav.reports` | View Reports & Analytics | Navigation | Administrator, HR Admin, HR Reporting, Dept HR |
| `nav.departments` | View Departments & Positions | Navigation | Administrator |
| `nav.audit_logs` | View Activity Audit Logs | Navigation | Administrator, HR Admin |
| `nav.archive` | View Archive Records | Navigation | Administrator |
| `nav.users` | View Users & Roles | Navigation | Administrator, HR Admin |
| `nav.backup` | View Database Backup | Navigation | Administrator |
| `nav.settings` | View System Settings | Navigation | Administrator |
| `nav.profile` | View Personal Profile | Navigation | All Users |
| `patients.create` | Create Walk-in Patients & Import | Patients | Administrator, Receptionist, Physician, HR Admin |
| `patients.edit` | Edit Patient Details & Photos | Patients | Administrator, Receptionist, Physician, HR Admin |
| `patients.delete` | Delete / Archive Patient Records | Patients | Administrator |
| `patients.view_history` | View Full Longitudinal Dossier | Patients | Administrator, Physician, HR Admin |
| `visits.create` | Open Visits & Check In Patients | Visits | Administrator, Receptionist, Physician, HR Admin |
| `visits.edit` | Record Examination & Confirmed Diagnosis | Visits | Administrator, Physician |
| `visits.delete` | Delete Visit Record | Visits | Administrator, Physician |
| `vitals.create` | Record Patient Vitals Readings | Visits | Administrator, Physician, Receptionist, HR Admin |
| `admissions.create` | Admit Patient to Ward | Admissions | Administrator, Physician |
| `admissions.edit` | Log Ward Notes & Update Bed Number | Admissions | Administrator, Physician |
| `admissions.discharge` | Discharge Inpatient from Ward | Admissions | Administrator, Physician |
| `checkups.dispatch` | Dispatch Checkup Renewal Visit | Check-ups | Administrator, Physician, Receptionist, HR Admin, Dept HR |
| `checkups.edit_date` | Edit Historical Fit Exam Date | Check-ups | Administrator, Physician, HR Admin |
| `checkups.approve` | Approve Renewal / Cert Status | Check-ups | Administrator, HR Admin, Dept HR |
| `registrations.create` | Register Candidates & Import | Registrations | Administrator, Receptionist, HR Admin |
| `registrations.edit` | Edit Candidate Record & Photos | Registrations | Administrator, Receptionist, HR Admin |
| `registrations.delete` | Delete / Withdraw Candidate Record | Registrations | Administrator, HR Admin |
| `registrations.accept` | Accept Candidate as Staff (Promote to Patient) | Registrations | Administrator, HR Admin |
| `certs.create` | Issue Medical Fitness Certificate | Certifications | Administrator, Physician, HR Admin |
| `certs.edit` | Edit Fitness Exam Findings | Certifications | Administrator, Physician, HR Admin |
| `certs.delete` | Delete Medical Certificate | Certifications | Administrator |
| `lab.create_order` | Order Diagnostic Lab Tests | Laboratory | Administrator, Physician, HR Admin |
| `lab.record_result` | Record Lab Results & Tech Notes | Laboratory | Administrator, Lab Tech, HR Admin |
| `lab.delete` | Cancel / Delete Lab Order | Laboratory | Administrator |
| `pharmacy.dispense` | Dispense Prescriptions & Deduct Stock | Pharmacy | Administrator, Pharmacist, HR Admin |
| `pharmacy.manage_stock` | Add Drugs, Restock & Adjust Inventory | Pharmacy | Administrator, Pharmacist, HR Admin |
| `pharmacy.delete` | Delete Formulary Drugs & Prescriptions | Pharmacy | Administrator |
| `referrals.create` | Create External Hospital Referral | Referrals | Administrator, Physician, HR Admin |
| `referrals.edit` | Edit Referral Record | Referrals | Administrator, Physician, HR Admin |
| `referrals.delete` | Delete Referral or Sick Leave | Referrals | Administrator |
| `sick_leaves.create` | Issue Medical Sick Leave Certificate | Referrals | Administrator, Physician, HR Admin |
| `reports.export` | Export Custom Reports (CSV/Excel) | Reports | Administrator, HR Admin, HR Reporting, Dept HR |
| `departments.manage` | Add, Edit, Delete Departments & Positions | Departments | Administrator |
| `audit_logs.view` | View Activity Audit Trails | Administration | Administrator, HR Admin |
| `audit_logs.export` | Export Audit Logs (CSV/Excel) | Administration | Administrator, HR Admin |
| `archive.restore` | Restore Records from Archive | Administration | Administrator |
| `users.create` | Create Staff User Accounts | Users | Administrator, HR Admin |
| `users.edit` | Edit Users, Roles & Fine-Tune Matrix Perms | Users | Administrator, HR Admin |
| `users.delete` | Delete User Accounts | Users | Administrator |
| `backup.create` | Trigger Manual Database Backup | Backup | Administrator |
| `backup.restore` | Restore Database from Archive | Backup | Administrator |
| `backup.delete` | Delete Backup Files | Backup | Administrator |
| `settings.edit` | Configure Clinic Branding & Schedules | Settings | Administrator |
| `dept_hr.dispatch` | Dispatch Department Workers to Clinic | Dept HR | Department HR, Administrator |
| `profile.edit` | Update Password & Personal Details | Account | All Users |
