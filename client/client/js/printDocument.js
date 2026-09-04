/* ===========================================================
   Print Document Engine — Official Templates with Controlled Headers/Footers
   - Prescription (OF/TPPF-HRAD/105)
   - Referral Form (OF/TPPF-HRAD/106)
   - Employee Medical Sick Leave (OF/TPPF-HRAD/107)
   =========================================================== */

const PrintDoc = (() => {

  /**
   * Calculates age from Date of Birth string.
   */
  function calculateAge(dobStr) {
    if (!dobStr) return "—";
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) return dobStr;
    const diffMs = Date.now() - dob.getTime();
    const ageDt = new Date(diffMs);
    const age = Math.abs(ageDt.getUTCFullYear() - 1970);
    return isNaN(age) ? "—" : `${age}`;
  }

  function formatDate(dStr) {
    if (!dStr) return "—";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatDateTime(dStr) {
    if (!dStr) return "—";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * Builds the official header table matching the company standard.
   */
  function buildOfficialHeader({ docTitleEn, docTitleAm, docNo, issueDate = "13/04/2026", issueNo = "2", page = "1 of 1" }) {
    return `
      <div class="official-doc-header-box">
        <table class="doc-header-table">
          <tr>
            <td class="cell-logo" rowspan="2" style="width: 105px; text-align: center; vertical-align: middle; padding: 6px; border-right: 1px solid #000;">
              <img src="assets/company-logo.png" alt="Company Logo" style="max-width: 90px; max-height: 52px; object-fit: contain;" onerror="this.style.display='none'" />
            </td>
            <td class="cell-company" style="vertical-align: middle; padding: 6px 10px;">
              <div style="font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Company Name :-</div>
              <div style="font-size: 13.5px; font-weight: 800; color: #0f172a; line-height: 1.2;">ETHIO AGRI-CEFT PLC</div>
              <div style="font-size: 11px; font-weight: 700; color: #1e293b;">TEA PROCESSING AND PACKING FACTORY</div>
            </td>
            <td class="cell-meta" style="width: 145px; padding: 6px 8px; border-left: 1px solid #000; font-size: 11px; vertical-align: middle;">
              <div><strong>Issue Date:</strong> ${issueDate}</div>
              <div style="margin-top: 4px;"><strong>Doc. No.:</strong> <span style="font-family:monospace; font-weight:700;">${docNo}</span></div>
            </td>
          </tr>
          <tr style="border-top: 1px solid #000;">
            <td class="cell-title" style="padding: 6px 10px; vertical-align: middle;">
              <div style="font-size: 10px; color: #475569;">Document Title:-</div>
              <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${docTitleEn}</div>
              ${docTitleAm ? `<div style="font-size: 12px; font-weight: 700; font-family:'Nyala','Abyssinica SIL',sans-serif; color:#1e293b;">${docTitleAm}</div>` : ""}
            </td>
            <td class="cell-meta" style="padding: 6px 8px; border-left: 1px solid #000; font-size: 11px; vertical-align: middle;">
              <div><strong>Issue No.:</strong> ${issueNo}</div>
              <div style="margin-top: 4px;"><strong>Page:</strong> ${page}</div>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  /**
   * System verification footer & Approval line on bottom of printout.
   */
  function buildApprovalAndSystemFooter(docNo) {
    const session = typeof Auth !== "undefined" && Auth.getSession ? Auth.getSession() : null;
    const printedBy = session?.user?.full_name || session?.user?.username || "System User";
    const nowStr = formatDateTime(new Date());

    return `
      <div style="margin-top: 24px; page-break-inside: avoid;">
        <!-- Official Approval Line from docx template -->
        <div style="border-top: 1px solid #000; padding-top: 8px; margin-bottom: 12px; font-size: 11px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span><strong>Approval:-</strong> _________________________ (Name)</span>
            <span>________________________ (Signature)</span>
            <span>______________ (Date)</span>
          </div>
        </div>

        <!-- Audit system footer -->
        <div class="official-print-audit-footer">
          <div style="display:flex; justify-content:space-between; font-size:9.5px; color:#64748b; border-top:1px dashed #cbd5e1; padding-top:4px;">
            <span>TPPF Clinic Management System · Controlled Document (${docNo})</span>
            <span>Printed by: <strong>${printedBy}</strong> on ${nowStr}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 1. PRESCRIPTION FORM (OF/TPPF-HRAD/105)
   */
  function generatePrescriptionHtml(rx) {
    const patientName = rx.patient_name || rx.patient?.full_name || "—";
    const patientCode = rx.patient_code || rx.patient?.patient_code || "—";
    const gender = rx.patient_gender || rx.patient?.gender || "—";
    const dob = rx.patient_dob || rx.patient?.date_of_birth;
    const age = calculateAge(dob);
    const phone = rx.patient_phone || rx.patient?.phone || "—";
    const location = rx.patient_location || rx.patient?.location || "Addis Ababa";
    const address = rx.patient_address || rx.patient?.address || "—";
    const department = rx.patient_department || rx.patient?.department || "—";
    const position = rx.patient_position || rx.patient?.position || "—";
    const diagnosis = rx.diagnosis_note || rx.visit_diagnosis || rx.diagnosis || "Routine Medical Consultation";
    const doctorName = rx.physician_name || rx.physician?.full_name || "Attending Medical Doctor";
    const qualification = rx.physician_qualification || rx.physician?.qualification || "General Practitioner, MD";
    const licenseNo = rx.physician_license_no || rx.physician?.license_no || "—";
    const rxDate = formatDate(rx.prescribed_date || rx.created_at || new Date());

    const items = rx.items || [];

    const headerHtml = buildOfficialHeader({
      docTitleEn: "Prescription Form",
      docTitleAm: "የመዳህኒት ማዘዣ",
      docNo: "OF/TPPF-HRAD/105",
      issueDate: "13/04/2026",
      issueNo: "2",
    });

    let itemsRows = "";
    if (items.length > 0) {
      items.forEach((it, idx) => {
        const drugName = it.drug ? `${it.drug.name} (${it.drug.unit || ''})` : (it.drug_name || `Medication #${idx + 1}`);
        itemsRows += `
          <tr>
            <td style="text-align:center; font-weight:700; width:35px;">${idx + 1}</td>
            <td style="font-weight:700; color:#0f172a;">${drugName}</td>
            <td>${it.dosage || '—'}</td>
            <td>${it.frequency || '—'}</td>
            <td>${it.duration || '—'}</td>
            <td style="text-align:center; font-weight:700;">${it.quantity_prescribed || '—'}</td>
            <td>${it.instructions || 'As directed'}</td>
          </tr>
        `;
      });
    } else {
      itemsRows = `<tr><td colspan="7" style="text-align:center; padding:16px; color:#64748b;">No prescription items specified</td></tr>`;
    }

    return `
      <div class="printable-document prescription-document">
        ${headerHtml}

        <div style="text-align: center; margin: 8px 0 12px 0;">
          <div style="font-size: 12.5px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">Organization Primary Clinic</div>
          <div style="font-size: 15px; font-weight: 800; color: #0f172a; text-decoration: underline; letter-spacing: 1px;">PRESCRIPTION</div>
        </div>

        <!-- Demographics Box -->
        <table class="doc-form-table" style="width:100%; margin-bottom:10px; border-collapse:collapse;">
          <tr>
            <td style="width:25%;"><strong>Card No.:</strong> <span class="doc-underlined">${patientCode}</span></td>
            <td style="width:45%;"><strong>Client Full Name:</strong> <span class="doc-underlined" style="font-weight:700;">${patientName}</span></td>
            <td style="width:30%;"><strong>Tel. No.:</strong> <span class="doc-underlined">${phone}</span></td>
          </tr>
          <tr>
            <td><strong>Sex:</strong> <span class="doc-underlined">${gender}</span></td>
            <td><strong>Age:</strong> <span class="doc-underlined">${age}</span> &nbsp;&nbsp; <strong>Weight:</strong> <span class="doc-underlined">_____ kg</span></td>
            <td><strong>Dept/Pos:</strong> <span class="doc-underlined">${department} / ${position}</span></td>
          </tr>
          <tr>
            <td colspan="2"><strong>Region/Location:</strong> <span class="doc-underlined">${location}</span> &nbsp;&nbsp; <strong>Address:</strong> <span class="doc-underlined">${address}</span></td>
            <td><strong>Date:</strong> <span class="doc-underlined">${rxDate}</span></td>
          </tr>
          <tr>
            <td colspan="3"><strong>Diagnosis:</strong> <span class="doc-underlined" style="font-weight:600;">${diagnosis}</span></td>
          </tr>
        </table>

        <!-- Rx Medication Section -->
        <div style="margin: 8px 0 4px 0; font-size: 16px; font-weight: 900; color: #0f172a; font-family: serif;">℞.</div>
        
        <table class="doc-grid-table" style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="width: 35px; text-align: center;">#</th>
              <th>Drug Name / Item</th>
              <th>Dosage</th>
              <th>Frequency</th>
              <th>Duration</th>
              <th style="width: 70px; text-align: center;">Quantity</th>
              <th>Instructions</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <!-- Prescriber Signature Footer -->
        <div class="doc-signature-block" style="margin-top: 18px; page-break-inside: avoid;">
          <table style="width: 100%; border: none;">
            <tr>
              <td style="width: 60%; vertical-align: top; font-size: 11.5px; line-height: 1.8;">
                <div><strong>Prescriber's Full Name:</strong> <span class="doc-underlined" style="font-weight:700;">${doctorName}</span></div>
                <div><strong>Qualification:</strong> <span class="doc-underlined">${qualification}</span></div>
                <div><strong>Registration / Lic. No:</strong> <span class="doc-underlined">${licenseNo}</span></div>
              </td>
              <td style="width: 40%; vertical-align: bottom; text-align: right; font-size: 11.5px;">
                <div style="margin-bottom: 24px;">
                  <span style="display:inline-block; border-bottom: 1px solid #000; width: 160px;"></span>
                  <div style="font-weight:700; margin-top:4px;">Sign &amp; Stamp</div>
                </div>
                <div><strong>Date:</strong> <span class="doc-underlined">${rxDate}</span></div>
              </td>
            </tr>
          </table>
        </div>

        ${buildApprovalAndSystemFooter("OF/TPPF-HRAD/105")}
      </div>
    `;
  }

  /**
   * 2. REFERRAL FORM (OF/TPPF-HRAD/106)
   */
  function generateReferralHtml(ref) {
    const patientName = ref.patient_name || ref.patient?.full_name || "—";
    const patientCode = ref.patient_code || ref.patient?.patient_code || "—";
    const gender = ref.patient_gender || ref.patient?.gender || "—";
    const dob = ref.patient_dob || ref.patient?.date_of_birth;
    const age = calculateAge(dob);
    const department = ref.patient_department || ref.patient?.department || "—";
    const position = ref.patient_position || ref.patient?.position || "—";
    const referredTo = ref.referred_to || "Employees Medium Clinic / መካከለኛ የሰራተኞች ክሊኒክ";
    const diagnosis = ref.diagnosis || ref.visit_diagnosis || "—";
    const reason = ref.reason || "Further specialized investigation and medical management";
    const rxGiven = ref.visit_treatment || "First aid / Initial medical assessment provided";
    const note = ref.note || "";
    const doctorName = ref.physician_name || ref.physician?.full_name || "Attending Medical Doctor";
    const refDate = formatDate(ref.referral_date || ref.created_at || new Date());
    const refNo = `OF/TPPF-HRAD/106-${ref.id || 'NEW'}`;

    const headerHtml = buildOfficialHeader({
      docTitleEn: "Refarral form",
      docTitleAm: "ሪፈር ፎርም",
      docNo: "OF/TPPF-HRAD/106",
      issueDate: "13/04/2026",
      issueNo: "2",
    });

    return `
      <div class="printable-document referral-document">
        ${headerHtml}

        <div style="display:flex; justify-content:space-between; margin:10px 0 8px 0; font-size:12px;">
          <div><strong>Ref:-</strong> <span class="doc-underlined" style="font-family:monospace; font-weight:700;">${refNo}</span></div>
          <div><strong>Date:-</strong> <span class="doc-underlined">${refDate}</span></div>
        </div>

        <div style="font-size: 12.5px; line-height: 1.6; margin-bottom: 10px;">
          <div><strong>To:</strong> <span class="doc-underlined" style="font-weight:700; font-size:13.5px;">${referredTo}</span></div>
          <div style="color: #475569; font-size: 11px;">Employees Medium clinic / መካከለኛ የሰራተኞች ክሊኒክ · Addis Ababa</div>
        </div>

        <div style="font-size: 12px; margin-bottom: 10px; line-height: 1.5;">
          <strong>Dear Sirs, / Medium:-</strong><br />
          Please kindly give the necessary medical treatment to the bearer of this letter.
        </div>

        <!-- Patient Info Table (Bilingual) -->
        <table class="doc-form-table" style="width:100%; margin-bottom:12px; border-collapse:collapse;">
          <tr>
            <td style="width:50%;">
              <strong>Pt’s Name (የበሽተኛው ስም):</strong> <span class="doc-underlined" style="font-weight:700;">${patientName}</span>
            </td>
            <td style="width:25%;">
              <strong>Card No / I.D. No:</strong> <span class="doc-underlined" style="font-weight:700;">${patientCode}</span>
            </td>
            <td style="width:25%;">
              <strong>Age (ዕድሜ) / Sex (ፆታ):</strong> <span class="doc-underlined">${age} / ${gender}</span>
            </td>
          </tr>
          <tr>
            <td colspan="2"><strong>Department &amp; Position:</strong> <span class="doc-underlined">${department} — ${position}</span></td>
            <td><strong>From:</strong> <span class="doc-underlined">TPPF Primary Clinic</span></td>
          </tr>
          <tr>
            <td colspan="3"><strong>To:</strong> <span class="doc-underlined" style="font-weight:600;">${referredTo}</span></td>
          </tr>
          <tr>
            <td colspan="3"><strong>Diagnosis (ምርመራ):</strong> <span class="doc-underlined" style="font-weight:600;">${diagnosis}</span></td>
          </tr>
          <tr>
            <td colspan="3"><strong>Rx given (የተሰጠ ህክምና):</strong> <span class="doc-underlined">${rxGiven}</span></td>
          </tr>
          <tr>
            <td colspan="3"><strong>Reason For referral / Cause (የሪፈር ምክንያት):</strong> <span class="doc-underlined" style="font-weight:600;">${reason}</span></td>
          </tr>
          ${note ? `<tr><td colspan="3"><strong>Additional Clinical Notes:</strong> <span class="doc-underlined">${note}</span></td></tr>` : ""}
        </table>

        <div style="font-size: 11.5px; line-height: 1.5; margin-bottom: 14px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;">
          <em>We shall settle your bill up on receipt as per the agreement. Thank you for you your cooperation and assistance.</em>
          <div style="margin-top: 4px; font-weight: 600;">Sincerely Yours / ከሠላምታ ጋር,</div>
        </div>

        <!-- Signature Block -->
        <div class="doc-signature-block" style="margin-top: 16px; page-break-inside: avoid;">
          <table style="width: 100%; border: none;">
            <tr>
              <td style="width: 55%; vertical-align: top; font-size: 11.5px; line-height: 1.8;">
                <div><strong>Referred By (የመረመረው ባለሞያ ስም):</strong> <span class="doc-underlined" style="font-weight:700;">${doctorName}</span></div>
                <div><strong>Facility:</strong> <span class="doc-underlined">TPPF Primary Clinic / ETHIO AGRI-CEFT PLC</span></div>
              </td>
              <td style="width: 45%; vertical-align: bottom; text-align: right; font-size: 11.5px;">
                <div style="margin-bottom: 24px;">
                  <span style="display:inline-block; border-bottom: 1px solid #000; width: 160px;"></span>
                  <div style="font-weight:700; margin-top:4px;">Sig (ፊርማ) &amp; Clinic Stamp</div>
                </div>
                <div><strong>Date (ቀን):</strong> <span class="doc-underlined">${refDate}</span></div>
              </td>
            </tr>
          </table>
        </div>

        ${buildApprovalAndSystemFooter("OF/TPPF-HRAD/106")}
      </div>
    `;
  }

  /**
   * 3. EMPLOYEE MEDICAL SICK LEAVE (OF/TPPF-HRAD/107)
   */
  function generateSickLeaveHtml(sl) {
    const patientName = sl.patient_name || sl.patient?.full_name || "—";
    const patientCode = sl.patient_code || sl.patient?.patient_code || "—";
    const gender = sl.patient_gender || sl.patient?.gender || "—";
    const dob = sl.patient_dob || sl.patient?.date_of_birth;
    const age = calculateAge(dob);
    const department = sl.department || sl.patient_department || sl.patient?.department || "—";
    const position = sl.position || sl.patient_position || sl.patient?.position || "—";
    const diagnosis = sl.diagnosis || "Medical Illness / Clinical Rest";
    const recommendation = sl.examination_notes || sl.visit_exam_notes || "Complete medical rest is recommended for clinical recovery.";
    const examDate = formatDate(sl.exam_date || sl.created_at || new Date());
    const leaveStart = formatDate(sl.leave_start);
    const leaveEnd = formatDate(sl.leave_end);
    const days = sl.days || 1;
    const doctorName = sl.physician_name || sl.physician?.full_name || "Attending Medical Doctor";

    const headerHtml = buildOfficialHeader({
      docTitleEn: "Employee medical sick leave",
      docTitleAm: "የህመም ፍቃድ",
      docNo: "OF/TPPF-HRAD/107",
      issueDate: "13/04/2026",
      issueNo: "2",
    });

    return `
      <div class="printable-document sickleave-document">
        ${headerHtml}

        <div style="display:flex; justify-content:space-between; margin:10px 0 8px 0; font-size:12px;">
          <div><strong>Card No:-</strong> <span class="doc-underlined" style="font-family:monospace; font-weight:700;">${patientCode}</span></div>
          <div><strong>Date:- / ቀን ፡-</strong> <span class="doc-underlined">${examDate}</span></div>
        </div>

        <!-- Form Fields Grid matching 107 docx exactly -->
        <table class="doc-form-table" style="width:100%; margin-bottom:14px; border-collapse:collapse;">
          <tr>
            <td style="width:50%;"><strong>Name (ስም):</strong> <span class="doc-underlined" style="font-weight:700;">${patientName}</span></td>
            <td style="width:25%;"><strong>Age (ዕድሜ):</strong> <span class="doc-underlined">${age}</span></td>
            <td style="width:25%;"><strong>Sex (ፆታ):</strong> <span class="doc-underlined">${gender}</span></td>
          </tr>
          <tr>
            <td colspan="3"><strong>Department &amp; Position (የሥራ ክፍል/የሥራ መደብ):</strong> <span class="doc-underlined">${department} — ${position}</span></td>
          </tr>
          <tr>
            <td colspan="3" style="padding-top:8px;">
              <strong>Diagnosis or Injury (የበሽታው ዓይነት ወይም የደረሰበት ጉዳት ልክ):</strong><br />
              <div class="doc-text-block" style="min-height:32px; padding:4px 0; border-bottom:1px solid #000; font-weight:600;">
                ${diagnosis}
              </div>
            </td>
          </tr>
          <tr>
            <td colspan="3" style="padding-top:8px;">
              <strong>Dr's Recommendation (የሐኪም አስተያየት ፡-):</strong><br />
              <div class="doc-text-block" style="min-height:32px; padding:4px 0; border-bottom:1px solid #000;">
                ${recommendation}
              </div>
            </td>
          </tr>
          <tr>
            <td colspan="3" style="padding-top:8px;">
              <strong>Date of Examination (የተመረመረበት ቀን):</strong> <span class="doc-underlined">${examDate}</span>
            </td>
          </tr>
          <tr>
            <td colspan="3" style="padding-top:8px; background:#f1f5f9; padding:10px; border-radius:4px; border:1px solid #cbd5e1;">
              <strong style="font-size:13px; color:#0f172a;">Rest Required (የሚያስፈልገው የህመም ዕረፍት):</strong>
              <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:12.5px;">
                <span><strong>From (ከ):</strong> <span class="doc-underlined" style="font-weight:700;">${leaveStart}</span></span>
                <span><strong>To (እስከ):</strong> <span class="doc-underlined" style="font-weight:700;">${leaveEnd}</span></span>
                <span><strong>Total Duration:</strong> <span class="doc-underlined" style="font-weight:800; color:#b91c1c;">${days} Day(s)</span></span>
              </div>
            </td>
          </tr>
        </table>

        <!-- Doctor Signature and Stamp Block -->
        <div class="doc-signature-block" style="margin-top: 20px; page-break-inside: avoid;">
          <table style="width: 100%; border: none;">
            <tr>
              <td style="width: 55%; vertical-align: top; font-size: 11.5px; line-height: 1.8;">
                <div><strong>Doctor’s Name (የመረመረው ባለሞያ ስም):</strong> <span class="doc-underlined" style="font-weight:700;">${doctorName}</span></div>
                <div style="margin-top: 18px;">
                  <span style="display:inline-block; border-bottom: 1px solid #000; width: 170px;"></span>
                  <div style="font-weight:700; margin-top:4px;">Sign (ፊርማ)</div>
                </div>
              </td>
              <td style="width: 45%; vertical-align: middle; text-align: center;">
                <div style="border: 2px dashed #94a3b8; border-radius: 8px; width: 140px; height: 85px; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 11px; font-weight: 600;">
                  Official Clinic Stamp<br />(ማህተም)
                </div>
              </td>
            </tr>
          </table>
        </div>

        ${buildApprovalAndSystemFooter("OF/TPPF-HRAD/107")}
      </div>
    `;
  }

  /**
   * Opens the full-screen / printable modal preview and triggers printing.
   */
  function showPrintPreview(htmlContent, docTitle = "Document") {
    let container = document.getElementById("official-print-modal-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "official-print-modal-container";
      document.body.appendChild(container);
    }

    container.innerHTML = `
      <div class="print-preview-backdrop active" id="print-preview-backdrop">
        <div class="print-preview-dialog">
          <div class="print-preview-header">
            <div>
              <h3 style="margin:0; font-size:16px;">Print Preview: ${docTitle}</h3>
              <div style="font-size:12px; color:var(--text-muted,#64748b);">Verify official document layout before printing</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-primary" id="btn-trigger-print" style="display:inline-flex; align-items:center; gap:6px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print Document
              </button>
              <button class="btn btn-secondary" id="btn-close-print-preview">Close</button>
            </div>
          </div>
          <div class="print-preview-body" id="print-preview-render-area">
            ${htmlContent}
          </div>
        </div>
      </div>
    `;

    document.getElementById("btn-trigger-print").addEventListener("click", () => {
      window.print();
    });

    document.getElementById("btn-close-print-preview").addEventListener("click", () => {
      container.innerHTML = "";
    });

    document.getElementById("print-preview-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "print-preview-backdrop") {
        container.innerHTML = "";
      }
    });
  }

  return {
    prescription: (rxData) => showPrintPreview(generatePrescriptionHtml(rxData), "Prescription Form (OF/TPPF-HRAD/105)"),
    referral: (refData) => showPrintPreview(generateReferralHtml(refData), "Referral Form (OF/TPPF-HRAD/106)"),
    sickLeave: (slData) => showPrintPreview(generateSickLeaveHtml(slData), "Sick Leave Certificate (OF/TPPF-HRAD/107)"),
  };
})();

if (typeof window !== "undefined") {
  window.PrintDoc = PrintDoc;
}
