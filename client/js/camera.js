/* ===========================================================
   Camera & Photo Picker Widget — TPPF Clinic
   -----------------------------------------------------------
   Provides dual-mode photo attachment (File Upload & WebRTC
   Webcam Capture) with live preview and base64 data conversion.
   =========================================================== */

const CameraWidget = (() => {
  let activeStream = null;

  function renderPickerHtml(opts = {}) {
    const hiddenInputId = opts.hiddenInputId || 'photo-url-input';
    const previewImgId = opts.previewImgId || 'photo-preview-img';
    const initialUrl = opts.initialUrl || '';

    const hasPhoto = Boolean(initialUrl);

    return `
      <div class="photo-picker-container" style="display:flex; align-items:center; gap:16px; margin-bottom:14px;">
        <div class="photo-preview-box" style="position:relative; width:72px; height:72px; border-radius:50%; overflow:hidden; background:var(--color-bg-muted, #f3f5f4); border:2px solid var(--color-border, #d1d9d7); display:flex; align-items:center; justify-content:center;">
          <img id="${previewImgId}" src="${initialUrl}" style="width:100%; height:100%; object-fit:cover; display:${hasPhoto ? 'block' : 'none'};" alt="Photo Preview" />
          <div id="${previewImgId}-placeholder" style="display:${hasPhoto ? 'none' : 'flex'}; align-items:center; justify-content:center; color:var(--color-text-muted, #647572);">
            ${Icons.render('patients', { class: 'w-6 h-6' })}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <label class="btn btn-secondary btn-sm" style="margin:0; cursor:pointer;">
              ${Icons.render('download')} Upload Photo
              <input type="file" accept="image/*" id="${hiddenInputId}-file" style="display:none;" />
            </label>
            <button type="button" class="btn btn-secondary btn-sm" id="${hiddenInputId}-webcam-btn">
              ${Icons.render('stethoscope')} Take Picture
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="${hiddenInputId}-remove-btn" style="display:${hasPhoto ? 'inline-flex' : 'none'}; color:#c0483c;">
              Remove
            </button>
          </div>
          <span style="font-size:11.5px; color:var(--color-text-muted, #768784);">JPEG, PNG or WebP max 2MB. Camera supported on HTTPS/localhost.</span>
        </div>
        <input type="hidden" id="${hiddenInputId}" value="${UI.escapeHtml(initialUrl)}" />
      </div>
    `;
  }

  function bindEvents(opts = {}) {
    const hiddenInputId = opts.hiddenInputId || 'photo-url-input';
    const previewImgId = opts.previewImgId || 'photo-preview-img';

    const hiddenInput = document.getElementById(hiddenInputId);
    const fileInput = document.getElementById(`${hiddenInputId}-file`);
    const webcamBtn = document.getElementById(`${hiddenInputId}-webcam-btn`);
    const removeBtn = document.getElementById(`${hiddenInputId}-remove-btn`);
    const previewImg = document.getElementById(previewImgId);
    const placeholder = document.getElementById(`${previewImgId}-placeholder`);

    function setPhotoUrl(url) {
      if (hiddenInput) hiddenInput.value = url || '';
      if (previewImg) {
        previewImg.src = url || '';
        previewImg.style.display = url ? 'block' : 'none';
      }
      if (placeholder) {
        placeholder.style.display = url ? 'none' : 'flex';
      }
      if (removeBtn) {
        removeBtn.style.display = url ? 'inline-flex' : 'none';
      }
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          UI.toast('Image file size must be under 5MB.', 'danger');
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          setPhotoUrl(evt.target.result);
        };
        reader.readAsDataURL(file);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        setPhotoUrl('');
        if (fileInput) fileInput.value = '';
      });
    }

    if (webcamBtn) {
      webcamBtn.addEventListener('click', () => {
        openWebcamModal((capturedDataUrl) => {
          setPhotoUrl(capturedDataUrl);
        });
      });
    }

    return { setPhotoUrl };
  }

  function openWebcamModal(onCapture) {
    let modalEl = document.getElementById('camera-webcam-modal');
    if (modalEl) modalEl.remove();

    modalEl = document.createElement('div');
    modalEl.id = 'camera-webcam-modal';
    modalEl.className = 'modal-backdrop visible';
    modalEl.innerHTML = `
      <div class="modal-dialog" style="max-width:440px; text-align:center;">
        <div class="modal-header">
          <h3>Take Picture</h3>
          <button type="button" class="icon-btn" id="camera-modal-close">${Icons.render('close')}</button>
        </div>
        <div class="modal-body" style="padding:16px;">
          <div style="position:relative; width:320px; height:240px; margin:0 auto; background:#000; border-radius:8px; overflow:hidden;">
            <video id="camera-video-stream" autoplay playsinline style="width:100%; height:100%; object-fit:cover;"></video>
            <canvas id="camera-snapshot-canvas" width="320" height="240" style="display:none; width:100%; height:100%; object-fit:cover;"></canvas>
          </div>
          <p id="camera-status-msg" style="font-size:12.5px; margin:10px 0 0 0; color:var(--color-text-muted);">Requesting camera permissions…</p>
        </div>
        <div class="modal-footer" style="justify-content:center; gap:10px;">
          <button type="button" class="btn btn-secondary" id="camera-snap-btn" disabled>
            ${Icons.render('stethoscope')} Snap Photo
          </button>
          <button type="button" class="btn btn-secondary" id="camera-retake-btn" style="display:none;">
            Retake
          </button>
          <button type="button" class="btn btn-primary" id="camera-use-btn" style="display:none;">
            Use Photo
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    const videoEl = modalEl.querySelector('#camera-video-stream');
    const canvasEl = modalEl.querySelector('#camera-snapshot-canvas');
    const statusMsg = modalEl.querySelector('#camera-status-msg');
    const snapBtn = modalEl.querySelector('#camera-snap-btn');
    const retakeBtn = modalEl.querySelector('#camera-retake-btn');
    const useBtn = modalEl.querySelector('#camera-use-btn');
    const closeBtn = modalEl.querySelector('#camera-modal-close');

    let currentCapturedUrl = null;

    function stopCamera() {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        activeStream = null;
      }
    }

    function closeModal() {
      stopCamera();
      if (modalEl) modalEl.remove();
    }

    closeBtn.addEventListener('click', closeModal);

    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } })
      .then((stream) => {
        activeStream = stream;
        videoEl.srcObject = stream;
        statusMsg.textContent = 'Position subject in frame and click Snap Photo.';
        snapBtn.disabled = false;
      })
      .catch((err) => {
        console.warn('Camera access error:', err);
        statusMsg.textContent = 'Camera not accessible or permission denied. Please use File Upload instead.';
        statusMsg.style.color = '#c0483c';
      });

    snapBtn.addEventListener('click', () => {
      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      currentCapturedUrl = canvasEl.toDataURL('image/jpeg', 0.85);

      videoEl.style.display = 'none';
      canvasEl.style.display = 'block';

      snapBtn.style.display = 'none';
      retakeBtn.style.display = 'inline-flex';
      useBtn.style.display = 'inline-flex';
      statusMsg.textContent = 'Photo captured! Click "Use Photo" to accept.';
    });

    retakeBtn.addEventListener('click', () => {
      videoEl.style.display = 'block';
      canvasEl.style.display = 'none';

      snapBtn.style.display = 'inline-flex';
      retakeBtn.style.display = 'none';
      useBtn.style.display = 'none';
      statusMsg.textContent = 'Position subject in frame and click Snap Photo.';
    });

    useBtn.addEventListener('click', () => {
      if (currentCapturedUrl && onCapture) {
        onCapture(currentCapturedUrl);
      }
      closeModal();
    });
  }

  return { renderPickerHtml, bindEvents, openWebcamModal };
})();
