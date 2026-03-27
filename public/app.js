// Wake the server as soon as the page loads (prevents free-tier spin-down delay)
fetch('/ping').catch(() => {});

(() => {
  // ── State ──
  let stream = null;
  let mediaRecorder = null;
  let chunks = [];
  let recordingBlob = null;
  let recordingType = 'video'; // 'video' | 'audio'
  let audioCtx = null;
  let animFrame = null;

  // ── DOM refs ──
  const stepInfo    = document.getElementById('step-info');
  const stepRecord  = document.getElementById('step-record');
  const stepSuccess = document.getElementById('step-success');
  const btnNext     = document.getElementById('btn-next');
  const btnVideo    = document.getElementById('btn-video');
  const btnAudio    = document.getElementById('btn-audio');
  const videoWrap   = document.getElementById('video-wrap');
  const audioWrap   = document.getElementById('audio-wrap');
  const preview     = document.getElementById('preview');
  const recBadge    = document.getElementById('rec-badge');
  const recBadgeAudio = document.getElementById('rec-badge-audio');
  const canvas      = document.getElementById('visualizer');
  const btnRecord   = document.getElementById('btn-record');
  const btnStop     = document.getElementById('btn-stop');
  const playback    = document.getElementById('playback');
  const pbVideo     = document.getElementById('playback-video');
  const pbAudio     = document.getElementById('playback-audio');
  const btnRetake   = document.getElementById('btn-retake');
  const btnSubmit   = document.getElementById('btn-submit');
  const overlay     = document.getElementById('overlay');
  const toast       = document.getElementById('toast');

  // ── Step 1 → Step 2 ──
  btnNext.addEventListener('click', () => {
    const name  = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    if (!name || !email) return showToast('Please enter your name and email.');
    if (!isValidEmail(email)) return showToast('Please enter a valid email address.');
    stepInfo.classList.add('hidden');
    stepRecord.classList.remove('hidden');
    startCamera();
  });

  // ── Toggle video / audio ──
  btnVideo.addEventListener('click', () => switchMode('video'));
  btnAudio.addEventListener('click', () => switchMode('audio'));

  async function switchMode(type) {
    if (recordingType === type) return;
    recordingType = type;
    btnVideo.classList.toggle('active', type === 'video');
    btnAudio.classList.toggle('active', type === 'audio');
    videoWrap.classList.toggle('hidden', type === 'audio');
    audioWrap.classList.toggle('hidden', type === 'video');
    resetRecording();
    await stopStream();
    if (type === 'video') startCamera();
    else startAudioPreview();
  }

  // ── Start camera / mic stream ──
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      preview.srcObject = stream;
    } catch (e) {
      showToast('Camera access denied. Please allow camera permissions.');
    }
  }

  async function startAudioPreview() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      drawIdleVisualizer();
    } catch (e) {
      showToast('Microphone access denied. Please allow microphone permissions.');
    }
  }

  // ── Record ──
  btnRecord.addEventListener('click', startRecording);
  btnStop.addEventListener('click', stopRecording);

  function startRecording() {
    if (!stream) return showToast('No media stream available. Please allow permissions.');
    chunks = [];
    recordingBlob = null;

    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start(200);

    btnRecord.classList.add('recording', 'hidden');
    btnRecord.querySelector('span:last-child').textContent = '';
    btnStop.classList.remove('hidden');

    if (recordingType === 'video') {
      recBadge.classList.remove('hidden');
    } else {
      recBadgeAudio.classList.remove('hidden');
      startVisualizer();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    btnStop.classList.add('hidden');
    recBadge.classList.add('hidden');
    recBadgeAudio.classList.add('hidden');
    btnRecord.classList.remove('recording');
    btnRecord.classList.add('hidden');
  }

  function handleRecordingStop() {
    recordingBlob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
    const url = URL.createObjectURL(recordingBlob);

    if (recordingType === 'video') {
      pbVideo.src = url;
      pbVideo.classList.remove('hidden');
      pbAudio.classList.add('hidden');
    } else {
      pbAudio.src = url;
      pbAudio.classList.remove('hidden');
      pbVideo.classList.add('hidden');
      stopVisualizer();
      drawIdleVisualizer();
    }
    playback.classList.remove('hidden');
  }

  // ── Retake ──
  btnRetake.addEventListener('click', () => {
    resetRecording();
    if (recordingType === 'video') startCamera();
    else startAudioPreview();
  });

  function resetRecording() {
    chunks = [];
    recordingBlob = null;
    pbVideo.src = '';
    pbAudio.src = '';
    playback.classList.add('hidden');
    btnRecord.classList.remove('hidden', 'recording');
    btnRecord.querySelector('span:last-child').textContent = ' Start Recording';
    btnStop.classList.add('hidden');
    recBadge.classList.add('hidden');
    recBadgeAudio.classList.add('hidden');
  }

  // ── Submit ──
  btnSubmit.addEventListener('click', async () => {
    if (!recordingBlob) return showToast('No recording found.');
    const name  = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const text  = document.getElementById('textFeedback').value.trim();

    overlay.classList.remove('hidden');

    const formData = new FormData();
    formData.append('recording', recordingBlob, `testimonial.webm`);
    formData.append('name', name);
    formData.append('email', email);
    formData.append('textFeedback', text);
    formData.append('recordingType', recordingType);

    try {
      const res = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      overlay.classList.add('hidden');
      stopStream();
      stepRecord.classList.add('hidden');
      stepSuccess.classList.remove('hidden');
    } catch (err) {
      overlay.classList.add('hidden');
      showToast(err.message || 'Something went wrong. Please try again.');
    }
  });

  // ── Audio visualizer ──
  function startVisualizer() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const ctx2d = canvas.getContext('2d');

    function draw() {
      animFrame = requestAnimationFrame(draw);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      analyser.getByteFrequencyData(dataArray);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.2;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;
        const alpha = 0.4 + (dataArray[i] / 255) * 0.6;
        ctx2d.fillStyle = `rgba(201, 163, 90, ${alpha})`;
        ctx2d.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    }
    draw();
  }

  function stopVisualizer() {
    if (animFrame) cancelAnimationFrame(animFrame);
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
  }

  function drawIdleVisualizer() {
    const ctx2d = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 40;
    const barW = canvas.width / bars - 2;
    for (let i = 0; i < bars; i++) {
      const h = 4 + Math.random() * 8;
      ctx2d.fillStyle = 'rgba(201,163,90,0.2)';
      ctx2d.fillRect(i * (barW + 2), canvas.height - h, barW, h);
    }
  }

  // ── Helpers ──
  async function stopStream() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (preview.srcObject) {
      preview.srcObject = null;
    }
  }

  function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (const t of types) { if (MediaRecorder.isTypeSupported(t)) return t; }
    return '';
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
  }
})();
