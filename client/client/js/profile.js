/* ===========================================================
   Profile page logic — edit own details & change password
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('profile')) { throw new Error('redirecting'); }
renderShell('profile');
setPageTitle('My Profile');

let userProfileData = null;

async function loadProfile() {
  try {
    userProfileData = await Api.profile.get();
    renderProfile(userProfileData);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderProfile(user) {
  // Avatar & Header
  const avatarLarge = document.getElementById('profile-avatar-large');
  if (avatarLarge) {
    avatarLarge.outerHTML = UI.avatar(user.full_name || user.username, user.photo_url, 'width:56px; height:56px; font-size:22px; id="profile-avatar-large"');
  }
  document.getElementById('profile-header-name').textContent = user.full_name || user.username;
  document.getElementById('profile-header-username').textContent = `@${user.username}`;
  
  const rolesHtml = (user.roles || []).map(r => 
    `<span class="badge badge-primary">${UI.escapeHtml(r.display_name || r.name || r)}</span>`
  ).join('');
  document.getElementById('profile-header-roles').innerHTML = rolesHtml || '<span class="badge badge-neutral">No role</span>';
  document.getElementById('prof-roles-display').innerHTML = rolesHtml || '<span class="badge badge-neutral">No role assigned</span>';

  // Form fields
  document.getElementById('prof-username').value = user.username || '';
  document.getElementById('prof-fullname').value = user.full_name || '';

  const photoContainer = document.getElementById('prof-photo-container');
  if (photoContainer && typeof CameraWidget !== 'undefined') {
    photoContainer.innerHTML = CameraWidget.renderPickerHtml({
      hiddenInputId: 'prof-photo-url',
      previewImgId: 'prof-photo-preview',
      initialUrl: user.photo_url || '',
    });
    CameraWidget.bindEvents({
      hiddenInputId: 'prof-photo-url',
      previewImgId: 'prof-photo-preview',
    });
  }
}

// Handle Profile Info Update
document.getElementById('profile-info-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('prof-username').value.trim();
  const full_name = document.getElementById('prof-fullname').value.trim();

  if (!username) {
    UI.toast('Username is required.', 'danger');
    return;
  }

  const photoInput = document.getElementById('prof-photo-url');
  const photo_url = photoInput ? photoInput.value : null;

  const btn = document.getElementById('prof-info-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const updated = await Api.profile.update({ username, full_name, photo_url });
    userProfileData = updated;
    Auth.updateUser({ username: updated.username, full_name: updated.full_name, photo_url: updated.photo_url });
    renderProfile(updated);
    UI.toast('Profile updated successfully!');
    
    // Update topbar display dynamically
    const nameEl = document.querySelector('.topbar-user .name');
    if (nameEl) nameEl.textContent = updated.full_name || updated.username;

    const userWrap = document.querySelector('.topbar-user');
    if (userWrap) {
      const oldAvatar = userWrap.querySelector('.avatar');
      if (oldAvatar) {
        oldAvatar.outerHTML = UI.avatar(updated.full_name || updated.username, updated.photo_url, 'width:32px; height:32px; font-size:12px;');
      }
    }
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Profile Changes';
  }
});

// Handle Password Change
document.getElementById('profile-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current_password = document.getElementById('prof-curr-pass').value;
  const new_password = document.getElementById('prof-new-pass').value;
  const confirm_password = document.getElementById('prof-conf-pass').value;

  if (!current_password) {
    UI.toast('Please enter your current password.', 'danger');
    return;
  }
  if (new_password.length < 6) {
    UI.toast('New password must be at least 6 characters.', 'danger');
    return;
  }
  if (new_password !== confirm_password) {
    UI.toast('New passwords do not match.', 'danger');
    return;
  }

  const btn = document.getElementById('prof-pass-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Updating…';

  try {
    await Api.profile.update({ current_password, new_password });
    UI.toast('Password changed successfully!');
    document.getElementById('profile-password-form').reset();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Password';
  }
});

loadProfile();
