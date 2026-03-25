/**
 * Steve — AI Sales Concierge for Gitwix
 * Continuous-listening, conversational salesman mode.
 * Handles: auto voice recognition, LLM chat, TTS, virtual cursor,
 * pause detection, email capture, conversation state management.
 */

// === API Configuration ===
const API = "__PORT_8000__".startsWith("__") ? "http://localhost:8000" : "__PORT_8000__";

// === DOM References ===
const micBtn = document.getElementById('steve-mic-btn');
const statusEl = document.getElementById('steve-status');
const cursor = document.getElementById('steve-cursor');
const emailOverlay = document.getElementById('steve-email-overlay');
const emailInput = document.getElementById('steve-email-input');
const emailSubmitBtn = document.getElementById('steve-email-submit');

// === State ===
let isListening = false;
let isSpeaking = false;
let isProcessing = false;
let recognition = null;
let audioContext = null;
let analyser = null;
let currentAudio = null;
let conversationHistory = [];
let conversationActive = false;   // Whether Steve is in an active conversation
let pauseTimer = null;            // Timer for detecting silence/pauses
let hasGreeted = false;           // Whether Steve has given his opening line
let userHasSpoken = false;        // Whether the user has said anything yet
let emailCaptured = false;        // Whether we already got the email
let pauseCount = 0;               // How many pause-prompts Steve has fired

const PAUSE_TIMEOUT = 10000;       // 10s of silence before Steve prompts
const MAX_PAUSE_PROMPTS = 3;      // Don't annoy — max 3 unprompted questions

// === Website DOM Map (Steve's knowledge) ===
const DOM_MAP = {
  'home': { selector: '#nav-home', description: 'Home page link' },
  'about': { selector: '#nav-about', description: 'About page link' },
  'portfolio': { selector: '#nav-portfolio', description: 'Portfolio page link' },
  'work': { selector: '#nav-portfolio', description: 'Portfolio page link' },
  'projects': { selector: '#nav-portfolio', description: 'Portfolio page link' },
  'contact': { selector: '#nav-contact', description: 'Contact page link' },
  'booking': { selector: '#nav-contact', description: 'Contact page link' },
  'book': { selector: '#nav-contact', description: 'Contact page link' },
  'view work': { selector: '#btn-view-work', description: 'View our work button' },
  'book consultation': { selector: '#btn-cta-book', description: 'Book a consultation button' },
  'start project': { selector: '#btn-portfolio-contact', description: 'Start a project button' },
  'submit': { selector: '#btn-submit-form', description: 'Submit the contact form' },
  'name field': { selector: '#contact-name', description: 'Name input on contact form' },
  'email field': { selector: '#contact-email', description: 'Email input on contact form' },
  'company field': { selector: '#contact-company', description: 'Company input on contact form' },
  'project field': { selector: '#contact-project', description: 'Project details textarea' },
  'services': { selector: '#section-services', description: 'Services section' },
  'stats': { selector: '#section-stats', description: 'Statistics section' },
  'testimonials': { selector: '#section-testimonials', description: 'Testimonials section' },
};

// === Steve's System Prompt ===
const SYSTEM_PROMPT = `You are Steve — Gitwix's AI sales concierge. You're a sharp, witty web developer from Manchester who's also an excellent salesman. Think: your smartest mate who happens to build brilliant websites and knows exactly how to close a deal — without being sleazy about it.

VOICE RULES (CRITICAL — you are being spoken aloud via TTS):
- MAX 2 sentences per reply. Punchy. Conversational. No waffling.
- Sound like a real person talking — contractions, natural flow, energy.
- British humour — dry, quick wit. Throw in a dev joke or cheeky comment when natural.
- NEVER sound corporate or robotic. You're chatting, not presenting.
- Always end with a question or a hook that keeps the conversation going.

SALES APPROACH:
- You're warm, curious, and genuinely interested in the visitor.
- Ask smart discovery questions — what they need, what their business does, what their timeline is.
- Listen for buying signals and gently guide toward booking a consultation or sharing their email.
- Don't be pushy. Be helpful. The sale comes from trust.
- If they seem interested, casually suggest connecting them with the team.
- If there's a natural moment, offer to take their email so someone can follow up.

CONVERSATION FLOW (follow this loosely, adapt to context):
1. GREET — Warm, short intro. Ask what brings them here.
2. DISCOVER — What kind of website/project? What does their business do?
3. QUALIFY — Timeline? Budget range? Any specific tech needs?
4. ENGAGE — Share relevant Gitwix facts/projects that match their needs.
5. CLOSE — Suggest booking a consultation OR offer to take their email for follow-up.

GITWIX FACTS (weave in naturally, never list):
- Bespoke web dev agency, Manchester. 87+ projects, 35+ clients, 100 Lighthouse scores, 35% avg conversion lift.
- Services: UI/UX, Web Dev, AI Integration, E-Commerce, SEO, Ongoing Support.
- Stack: React, Next.js, TypeScript, Three.js, Tailwind, Python, FastAPI, OpenAI, LiveKit.
- Notable clients: NovaTech (SaaS), Ridgeline Ventures (investment portal), Kōda Studio (e-commerce), Beacon Digital (AI dashboard), Evergreen Health (healthcare PWA), Lyric Music (streaming platform).

EMAIL CAPTURE:
When the user agrees to share their email, include this action:
\`\`\`action
{"type": "capture_email"}
\`\`\`
This shows an email input field. Don't ask them to type it in chat — the UI handles it.

PAGE ACTIONS — When user asks to navigate/scroll/see something:
\`\`\`action
{"type": "navigate", "target": "portfolio"}
\`\`\`
Types: navigate (home/about/portfolio/contact), scroll (target section), click (CSS selector), fill_form (fields object).
Only trigger actions when clearly asked. Narrate casually: "On it, pulling up the portfolio now..."

PAGES: Home (hero/services/stats/testimonials), About (story/values/tech), Portfolio (6 projects), Contact (booking form).`;

// === Pause Prompts (Steve asks these when user goes quiet) ===
const PAUSE_PROMPTS = [
  "So what kind of website are you looking for? Brochure site, web app, e-commerce — what's the vibe?",
  "Got any questions about Gitwix or how we work? Happy to fill you in.",
  "Would you like to speak with a member of the team? I can sort that out for you.",
  "If you'd like, I can grab your email and have someone reach out — no pressure at all.",
  "Want me to show you some of our recent projects? We've done some cracking work lately.",
  "What does your business do, if you don't mind me asking? Helps me point you in the right direction.",
];

// === Audio Analysis for Orb ===
let audioSourceNode = null;

function setupOrbAudioAnalysis(audio) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.8;

  if (!audio._sourceCreated) {
    audioSourceNode = audioContext.createMediaElementSource(audio);
    audioSourceNode.connect(analyser);
    analyser.connect(audioContext.destination);
    audio._sourceCreated = true;
  }

  const dataArray = new Float32Array(analyser.frequencyBinCount);

  function updateOrb() {
    if (!isSpeaking) {
      window.orbVisualizer?.setActive(false);
      return;
    }
    analyser.getFloatFrequencyData(dataArray);
    const normalized = new Float32Array(32);
    let rms = 0;
    for (let i = 0; i < Math.min(dataArray.length, 32); i++) {
      const val = (dataArray[i] + 100) / 100;
      normalized[i] = Math.max(0, Math.min(1, val));
      rms += normalized[i] * normalized[i];
    }
    rms = Math.sqrt(rms / 32);
    window.orbVisualizer?.setAudioLevel(rms);
    window.orbVisualizer?.setFrequencyData(normalized);
    requestAnimationFrame(updateOrb);
  }

  window.orbVisualizer?.setActive(true);
  updateOrb();
}

// === Virtual Cursor Animation ===
async function moveCursorTo(targetSelector) {
  const target = document.querySelector(targetSelector);
  if (!target) return;
  cursor.classList.add('visible');

  const rect = target.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  return new Promise(resolve => {
    const startX = parseFloat(cursor.style.left) || window.innerWidth / 2;
    const startY = parseFloat(cursor.style.top) || window.innerHeight / 2;
    const duration = 800;
    const startTime = performance.now();

    function animate(time) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      cursor.style.left = (startX + (x - startX) * ease) + 'px';
      cursor.style.top = (startY + (y - startY) * ease) + 'px';

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        const ripple = document.createElement('div');
        ripple.className = 'steve-click-ripple';
        ripple.style.left = (x - 20) + 'px';
        ripple.style.top = (y - 20) + 'px';
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
        setTimeout(() => {
          cursor.classList.remove('visible');
          resolve();
        }, 300);
      }
    }
    requestAnimationFrame(animate);
  });
}

// === Action Execution ===
async function executeAction(action) {
  switch (action.type) {
    case 'navigate': {
      const mapEntry = DOM_MAP[action.target];
      if (mapEntry) {
        await moveCursorTo(mapEntry.selector);
        const el = document.querySelector(mapEntry.selector);
        if (el) el.click();
      }
      break;
    }
    case 'scroll': {
      const mapEntry = DOM_MAP[action.target];
      if (mapEntry) {
        const el = document.querySelector(mapEntry.selector);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (action.direction === 'up') {
        window.scrollBy({ top: -400, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: 400, behavior: 'smooth' });
      }
      break;
    }
    case 'click': {
      await moveCursorTo(action.target);
      const el = document.querySelector(action.target);
      if (el) el.click();
      break;
    }
    case 'fill_form': {
      if (action.fields) {
        const contactLink = document.querySelector('#nav-contact');
        if (contactLink) contactLink.click();
        await new Promise(r => setTimeout(r, 400));
        for (const [fieldId, value] of Object.entries(action.fields)) {
          const field = document.getElementById(fieldId);
          if (field) {
            await moveCursorTo('#' + fieldId);
            await new Promise(r => setTimeout(r, 200));
            field.focus();
            field.value = '';
            for (let i = 0; i < value.length; i++) {
              field.value += value[i];
              field.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise(r => setTimeout(r, 30 + Math.random() * 40));
            }
          }
        }
      }
      break;
    }
    case 'capture_email': {
      showEmailCapture();
      break;
    }
  }
}

// === Parse Actions from Response ===
function parseActions(text) {
  const actions = [];
  const regex = /```action\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      actions.push(JSON.parse(match[1]));
    } catch (e) {
      console.warn('Failed to parse action:', match[1]);
    }
  }
  const cleanText = text.replace(/```action\s*\n[\s\S]*?\n```/g, '').trim();
  return { actions, cleanText };
}

// === Email Capture UI ===
function showEmailCapture() {
  if (emailOverlay) {
    emailOverlay.classList.add('visible');
    emailInput.focus();
  }
}

function hideEmailCapture() {
  if (emailOverlay) {
    emailOverlay.classList.remove('visible');
  }
}

async function submitEmail() {
  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) {
    emailInput.classList.add('shake');
    setTimeout(() => emailInput.classList.remove('shake'), 500);
    return;
  }

  try {
    await fetch(`${API}/api/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, conversation: conversationHistory }),
    });
    emailCaptured = true;
    hideEmailCapture();
    // Steve confirms
    const msg = "Brilliant, got that down. Someone from the team will be in touch — you're in good hands.";
    conversationHistory.push({ role: 'assistant', content: msg });
    await speakText(msg);
    resetPauseTimer();
  } catch (err) {
    console.error('Email submit error:', err);
  }
}

if (emailSubmitBtn) {
  emailSubmitBtn.addEventListener('click', submitEmail);
}
if (emailInput) {
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitEmail();
  });
}

// === TTS Playback ===
async function speakText(text) {
  if (!text) return;
  isSpeaking = true;
  stopListening(); // Pause listening while Steve speaks
  updateStatus('Steve is speaking...');
  clearPauseTimer();

  try {
    const res = await fetch(`${API}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) return fallbackSpeak(text);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    setupOrbAudioAnalysis(audio);

    await audio.play();
    await new Promise(resolve => {
      audio.onended = () => {
        isSpeaking = false;
        window.orbVisualizer?.setActive(false);
        URL.revokeObjectURL(url);
        currentAudio = null;
        resolve();
      };
    });
  } catch (err) {
    console.warn('TTS API failed, using browser fallback:', err);
    return fallbackSpeak(text);
  }

  updateStatus('');
  // Resume listening after Steve finishes speaking
  if (conversationActive) {
    startContinuousListening();
  }
}

function fallbackSpeak(text) {
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 0.95;
    utter.lang = 'en-GB';

    const voices = speechSynthesis.getVoices();
    const ukMale = voices.find(v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('male'));
    const uk = voices.find(v => v.lang.startsWith('en-GB'));
    if (ukMale) utter.voice = ukMale;
    else if (uk) utter.voice = uk;

    utter.onstart = () => {
      isSpeaking = true;
      window.orbVisualizer?.setActive(true);
      function pulse() {
        if (!isSpeaking) { window.orbVisualizer?.setActive(false); return; }
        const level = 0.3 + Math.sin(performance.now() * 0.005) * 0.2;
        window.orbVisualizer?.setAudioLevel(level);
        requestAnimationFrame(pulse);
      }
      pulse();
    };

    utter.onend = () => {
      isSpeaking = false;
      window.orbVisualizer?.setActive(false);
      updateStatus('');
      if (conversationActive) startContinuousListening();
      resolve();
    };

    speechSynthesis.speak(utter);
  });
}

// === LLM Chat ===
async function chatWithSteve(userMessage) {
  if (isProcessing) return;
  isProcessing = true;
  clearPauseTimer();

  conversationHistory.push({ role: 'user', content: userMessage });
  updateStatus('Steve is thinking...');

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: conversationHistory,
        system: SYSTEM_PROMPT,
        context: {
          emailCaptured,
          currentPage: document.querySelector('.page--active')?.id || 'page-home',
          pauseCount,
        },
      }),
    });

    if (!res.ok) throw new Error('Chat API failed');

    const data = await res.json();
    const fullResponse = data.response || "Sorry, I'm having a moment. Try again?";
    const { actions, cleanText } = parseActions(fullResponse);

    conversationHistory.push({ role: 'assistant', content: cleanText });

    // Execute actions
    for (const action of actions) {
      await executeAction(action);
    }

    // Speak the response
    await speakText(cleanText);

    // Start pause timer after Steve speaks
    resetPauseTimer();

  } catch (err) {
    console.error('Chat error:', err);
    const fallbackMsg = "Whoops, brain fart. Give that another go for me?";
    await speakText(fallbackMsg);
  }

  isProcessing = false;
}

// === Pause Detection — Steve asks questions when user goes quiet ===
function resetPauseTimer() {
  clearPauseTimer();
  if (!conversationActive || pauseCount >= MAX_PAUSE_PROMPTS || emailCaptured) return;

  pauseTimer = setTimeout(() => {
    if (!isSpeaking && !isProcessing && conversationActive) {
      pauseCount++;
      // Pick a contextual pause prompt
      const prompt = getNextPausePrompt();
      conversationHistory.push({ role: 'assistant', content: prompt });
      speakText(prompt);
    }
  }, PAUSE_TIMEOUT);
}

function clearPauseTimer() {
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
}

function getNextPausePrompt() {
  // Smart prompt selection based on conversation state
  const msgCount = conversationHistory.filter(m => m.role === 'user').length;

  if (msgCount === 0) {
    return PAUSE_PROMPTS[0]; // Ask what they're looking for
  } else if (msgCount <= 2 && !emailCaptured) {
    // Still early — discovery questions
    return PAUSE_PROMPTS[Math.min(pauseCount, 1)];
  } else if (!emailCaptured) {
    // Later in convo — try to capture email or offer team connect
    return pauseCount % 2 === 0 ? PAUSE_PROMPTS[3] : PAUSE_PROMPTS[2];
  }
  return PAUSE_PROMPTS[4]; // Fallback: show portfolio
}

// === Speech Recognition — Continuous Mode ===
function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported');
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-GB';

  let finalTranscript = '';
  let silenceTimer = null;

  rec.onstart = () => {
    isListening = true;
    micBtn.classList.add('steve-mic-btn--listening');
    updateStatus('Listening...');
  };

  rec.onresult = (event) => {
    finalTranscript = '';
    let interimTranscript = '';

    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    // User is actively speaking — clear any silence/pause timers
    clearPauseTimer();
    if (silenceTimer) clearTimeout(silenceTimer);

    if (finalTranscript.trim()) {
      userHasSpoken = true;
      // Wait a moment for the user to finish their thought (multi-sentence)
      silenceTimer = setTimeout(() => {
        if (finalTranscript.trim()) {
          const msg = finalTranscript.trim();
          finalTranscript = '';
          stopListening();
          chatWithSteve(msg);
        }
      }, 1500); // 1.5s after last final result = user is done talking
    }
  };

  rec.onerror = (event) => {
    console.warn('Recognition error:', event.error);
    if (event.error === 'not-allowed') {
      updateStatus('Mic access denied — click the mic to allow');
      conversationActive = false;
      return;
    }
    if (event.error === 'aborted') return; // Intentional stop
    // Auto-restart on transient errors
    if (conversationActive && !isSpeaking && !isProcessing) {
      setTimeout(() => startContinuousListening(), 500);
    }
  };

  rec.onend = () => {
    isListening = false;
    micBtn.classList.remove('steve-mic-btn--listening');
    // Auto-restart if conversation is active and Steve isn't speaking
    if (conversationActive && !isSpeaking && !isProcessing) {
      setTimeout(() => startContinuousListening(), 300);
    }
  };

  return rec;
}

function startContinuousListening() {
  if (isSpeaking || isProcessing) return;

  if (!recognition) {
    recognition = initRecognition();
  }

  if (recognition && !isListening) {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    try {
      recognition.start();
    } catch (e) {
      // Already started — ignore
    }
  }
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('steve-mic-btn--listening');
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }
}

// === Activate Steve — Start the Conversation ===
async function activateSteve() {
  if (conversationActive) return;

  // Request microphone permission explicitly before starting
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Permission granted — stop the stream immediately (we use SpeechRecognition, not raw audio)
    stream.getTracks().forEach(t => t.stop());
  } catch (err) {
    console.warn('Mic permission denied:', err);
    updateStatus('Please allow microphone access to talk to Steve');
    // Show a helpful message based on the error
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      updateStatus('Mic blocked — click the lock icon in your address bar to allow');
    } else if (err.name === 'NotFoundError') {
      updateStatus('No microphone found — please connect one and try again');
    } else {
      updateStatus('Mic unavailable — check your browser settings');
    }
    // Pulse the status briefly so the user sees it
    micBtn.classList.add('steve-mic-btn--error');
    setTimeout(() => micBtn.classList.remove('steve-mic-btn--error'), 3000);
    return; // Don't activate without mic
  }

  conversationActive = true;

  // Resume audio context (required for autoplay policy)
  if (audioContext && audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  // Steve greets
  if (!hasGreeted) {
    hasGreeted = true;
    const greeting = "Hey there! I'm Steve from Gitwix. What brings you to our corner of the internet today?";
    conversationHistory.push({ role: 'assistant', content: greeting });
    await speakText(greeting);
    // Listening auto-starts after speakText finishes
  } else {
    startContinuousListening();
  }

  // Update mic button to show active state
  micBtn.classList.add('steve-mic-btn--active');
  resetPauseTimer();
}

function deactivateSteve() {
  conversationActive = false;
  clearPauseTimer();
  stopListening();
  micBtn.classList.remove('steve-mic-btn--active');
  micBtn.classList.remove('steve-mic-btn--listening');
  updateStatus('');

  if (isSpeaking) {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    speechSynthesis.cancel();
    isSpeaking = false;
    window.orbVisualizer?.setActive(false);
  }
}

// === UI Helpers ===
function updateStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// === Event Listeners ===

// Mic button: toggle conversation on/off
micBtn.addEventListener('click', () => {
  if (conversationActive) {
    deactivateSteve();
  } else {
    activateSteve();
  }
});

// "Talk to Steve" buttons throughout the site
document.querySelectorAll('[data-action="activate-steve"]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    activateSteve();
  });
});

// Close email overlay on outside click
if (emailOverlay) {
  emailOverlay.addEventListener('click', (e) => {
    if (e.target === emailOverlay) hideEmailCapture();
  });
}

// Load voices for browser TTS fallback
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// === Export for orb.js ===
export { };
