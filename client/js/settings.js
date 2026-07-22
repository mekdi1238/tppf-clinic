/* ===========================================================
   Settings page logic
   -----------------------------------------------------------
   Clinic profile is mock-only (see BACKEND_HANDOFF.md).
   Password change calls the same mock users store used by
   Users & Roles, keyed off the current session's user id.
   =========================================================== */

Auth.requireAuth();
renderShell('settings');
setPageTitle('Settings');

const session = Auth.getSession();
const restrictedRole = RoleGuard.restrictedRole();

document.getElementById('acct-username').textContent = session.user.username;
document.getElementById('acct-fullname').textContent = session.user.full_name;
document.getElementById('acct-roles').textContent = session.user.roles.join(', ') || '—';

if (restrictedRole) {
  // Clinic Profile is system configuration — not something a Lab
  // Technician or Pharmacist should see or edit, only manage their
  // own account below.
  document.getElementById('clinic-profile-panel').style.display = 'none';
}

async function loadClinicProfile() {
  if (restrictedRole) return;
  try {
    const settings = await Api.settings.get();
    document.getElementById('cf-name').value = settings.clinic_name || '';
    document.getElementById('cf-tagline').value = settings.clinic_tagline || '';
    document.getElementById('cf-address').value = settings.clinic_address || '';
    document.getElementById('cf-phone').value = settings.clinic_phone || '';
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

document.getElementById('clinic-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (restrictedRole) return;
  const btn = document.getElementById('clinic-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.settings.update({
      clinic_name: document.getElementById('cf-name').value.trim(),
      clinic_tagline: document.getElementById('cf-tagline').value.trim(),
      clinic_address: document.getElementById('cf-address').value.trim(),
      clinic_phone: document.getElementById('cf-phone').value.trim(),
    });
    UI.toast('Clinic profile saved.');
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Clinic Profile';
  }
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = document.getElementById('pf-current').value;
  const next = document.getElementById('pf-new').value;
  const confirm = document.getElementById('pf-confirm').value;

  if (next !== confirm) { UI.toast('New password and confirmation do not match.', 'danger'); return; }
  if (next.length < 6) { UI.toast('New password must be at least 6 characters.', 'danger'); return; }

  const btn = document.getElementById('password-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.users.changePassword(session.user.id, current, next);
    UI.toast('Password changed.');
    document.getElementById('password-form').reset();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Change Password';
  }
});

loadClinicProfile();
