/**
 * Jenny — AI Sales Concierge for Gitwix
 * Continuous-listening, conversational saleswoman mode.
 * Handles: auto voice recognition, LLM chat, TTS, virtual cursor,
 * pause detection, email capture, conversation state management.
 */

// === API Configuration ===
// On Vercel, API routes are same-origin at /api/*. Locally, fall back to port 8000.
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : '';  // Same origin — /api/chat, /api/tts etc. served by Vercel serverless functions

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
let conversationActive = false;   // Whether Jenny is in an active conversation
let pauseTimer = null;            // Timer for detecting silence/pauses
let hasGreeted = false;           // Whether Jenny has given her opening line
let userHasSpoken = false;        // Whether the user has said anything yet
let emailCaptured = false;        // Whether we already got the email
let pauseCount = 0;               // How many pause-prompts Jenny has fired

const PAUSE_TIMEOUT = 10000;       // 10s of silence before Jenny prompts
const MAX_PAUSE_PROMPTS = 3;      // Don't annoy — max 3 unprompted questions

// === Website DOM Map (Jenny's knowledge) ===
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

// === Jenny's System Prompt ===
const SYSTEM_PROMPT = `You are Jenny, Gitwix's AI concierge. You are a closer. Your ONLY job is to capture leads.

RULES FOR EVERY SINGLE RESPONSE:
1. MAX 2 sentences. Never more. Be punchy.
2. ALWAYS end with a push toward one of: booking a call, giving their email, or filling the contact form.
3. After the user's FIRST message, EVERY reply must include a lead capture attempt. No exceptions.
4. Sound warm and human. Use contractions. No corporate speak.
5. NEVER use bullet points, lists, emojis, or special characters. This is spoken aloud.
6. NEVER say you are an AI. You are Jenny from Gitwix.

LEAD CAPTURE PHRASES (rotate these naturally):
- "Want me to get someone from the team to call you? Just need your email."
- "I can book you a free consultation right now, no strings attached. Shall I open the form?"
- "Drop me your email and I will have the team send you some relevant examples."
- "The quickest way to get a proper quote is a 15-minute call. Want me to set that up?"
- "If you pop your details in our contact form, someone will get back to you within a few hours."

CONVERSATION PATTERN:
- Reply 1 (greeting): Done automatically, not by you.
- Reply 2 (user's first message): Acknowledge what they said in ONE sentence. Then push to capture: suggest booking, email, or contact form.
- Reply 3+: If they haven't given contact info yet, keep pushing gently with each response. Vary the approach.
- If they ask a question: Answer it briefly, then IMMEDIATELY follow with a lead capture line.
- If they want to see something on the site: Navigation is handled automatically. Just confirm and push for the lead.

GITWIX FACTS (use sparingly, only to build credibility):
- Manchester web dev agency. 87+ projects, 35% avg conversion lift.
- Clients: NovaTech (SaaS, 42% conversion increase), Koda Studio (e-commerce, revenue doubled), Beacon Digital (AI dashboard).
- No templates. Every build is custom.

EMAIL CAPTURE:
When user agrees to share email:
\`\`\`action
{"type": "capture_email"}
\`\`\`

NAVIGATION:
Do NOT include navigation actions. Pages open INSTANTLY before you even respond. If the user asked to see something, it is ALREADY on screen by the time you speak. Never say "let me open that" or "pulling that up" because it is already done. Just reference what they can now see and push for the lead.

EXAMPLE RESPONSES:
User: "I need a new website for my business"
You: "Brilliant, that is exactly what we do. The fastest way to get started is a quick 15-minute call with the team, want me to open the booking form for you?"

User: "How much does a website cost?"
You: "It depends on what you need, but we can scope it out properly on a free call. Want me to grab your email so someone can reach out with a quote?"

User: "What kind of websites do you build?"
You: "Everything from e-commerce to full web apps, we recently doubled revenue for an online store. Want to see our work or shall I book you a call to chat about yours?"

User: "I'm just browsing"
You: "No worries at all! If you drop your email I can send over some examples that might spark some ideas, totally no pressure."`;

// === Pause Prompts (Jenny asks these when user goes quiet) ===
const PAUSE_PROMPTS = [
  "So what kind of website or project are you thinking about? I'd love to help point you in the right direction.",
  "Have you got any questions about how we work at Gitwix? Happy to walk you through it.",
  "Would you like me to connect you with one of the team? I can set that up really easily.",
  "If you'd like, I can grab your email and have someone reach out with some ideas. Totally no pressure.",
  "Want to see some of our recent projects? We've got some really exciting case studies I think you'd like.",
  "Tell me a bit about your business. Helps me figure out exactly how we can help.",
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
    // Jenny confirms
    const msg = "Brilliant, I've got that down for you. Someone from the team will be in touch really soon — you're in great hands.";
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
  stopListening(); // Pause listening while Jenny speaks
  updateStatus('Jenny is speaking...');
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

// === Best Available Voice Selection for Browser TTS ===
// Picks the most natural-sounding female English voice available.
// Priority: Google UK English Female > Google US English Female > Microsoft voices > any English female > any English
let cachedBestVoice = null;

function getBestVoice() {
  if (cachedBestVoice) return cachedBestVoice;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Ranked preferences — best to worst
  const preferences = [
    v => v.name === 'Google UK English Female',
    v => v.name === 'Google US English Female',
    v => v.name.includes('Google') && v.lang.startsWith('en') && v.name.toLowerCase().includes('female'),
    v => v.name.includes('Microsoft') && v.lang.startsWith('en-GB') && (v.name.includes('Sonia') || v.name.includes('Libby')),
    v => v.name.includes('Microsoft') && v.lang.startsWith('en') && (v.name.includes('Jenny') || v.name.includes('Aria')),
    v => v.name.includes('Samantha'),  // macOS/iOS high-quality voice
    v => v.name.includes('Karen'),     // macOS Australian
    v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female'),
    v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'),
    v => v.lang.startsWith('en-GB'),
    v => v.lang.startsWith('en-US'),
    v => v.lang.startsWith('en'),
  ];

  for (const test of preferences) {
    const match = voices.find(test);
    if (match) {
      cachedBestVoice = match;
      console.log('Selected TTS voice:', match.name, match.lang);
      return match;
    }
  }

  cachedBestVoice = voices[0];
  return voices[0];
}

function fallbackSpeak(text) {
  return new Promise(resolve => {
    // Cancel any queued speech first
    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    utter.pitch = 1.05;   // Slightly higher for a warm female voice
    utter.volume = 1.0;
    utter.lang = 'en-GB';

    const voice = getBestVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }

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

    // Safety: if onend never fires (browser bug), resolve after a timeout
    const safetyTimeout = setTimeout(() => {
      if (isSpeaking) {
        isSpeaking = false;
        window.orbVisualizer?.setActive(false);
        updateStatus('');
        if (conversationActive) startContinuousListening();
        resolve();
      }
    }, Math.max(10000, text.length * 100)); // ~100ms per character estimate

    const origOnEnd = utter.onend;
    utter.onend = () => {
      clearTimeout(safetyTimeout);
      origOnEnd();
    };

    speechSynthesis.speak(utter);
  });
}

// === INSTANT KEYWORD TRIGGERS ===
// Intercepts known navigation/action phrases BEFORE hitting the LLM.
// This gives sub-200ms response for common requests.
const INSTANT_TRIGGERS = [
  // Navigation — responses acknowledge what's ALREADY DONE, never what's about to happen
  { patterns: ['contact', 'get in touch', 'reach out', 'message you', 'send a message'],
    action: () => { document.querySelector('#nav-contact')?.click(); },
    response: "There you go, contact form is right there. Pop your details in and someone will get back to you within a few hours." },
  { patterns: ['portfolio', 'your work', 'projects', 'what you built', 'show me', 'examples', 'case stud'],
    action: () => { document.querySelector('#nav-portfolio')?.click(); },
    response: "These are some of our favourites. If anything catches your eye, I can tell you more, or we can jump on a quick call to talk about yours." },
  { patterns: ['about', 'your team', 'who are you', 'tell me about gitwix', 'your company', 'your story'],
    action: () => { document.querySelector('#nav-about')?.click(); },
    response: "So this is us. Small senior team, Manchester based, every project gets our full attention. Want to chat about what you need?" },
  { patterns: ['home', 'go back', 'main page', 'start', 'beginning'],
    action: () => { document.querySelector('#nav-home')?.click(); },
    response: "Here we are. What would you like to explore?" },
  { patterns: ['services', 'what do you do', 'what do you offer', 'how can you help'],
    action: () => { document.querySelector('#nav-home')?.click(); setTimeout(() => document.getElementById('section-services-hscroll')?.scrollIntoView({ behavior: 'smooth' }), 300); },
    response: "So we cover UI design, web development, AI integration, e-commerce, the lot. What kind of project are you working on?" },
  // Lead capture
  { patterns: ['book', 'meeting', 'consultation', 'call', 'schedule', 'appointment', 'chat with someone'],
    action: () => { document.querySelector('#nav-contact')?.click(); },
    response: "The form is right here. Fill in your details and we will get you booked in, completely free, no obligation." },
  { patterns: ['email', 'send my email', 'here\'s my email', 'my email is', 'give you my email'],
    action: () => showEmailCapture(),
    response: "Go ahead and type it in there and we will be in touch really soon." },
  // Scroll — silent, no speech needed
  { patterns: ['scroll down', 'show me more', 'what else', 'keep going'],
    action: () => { window.scrollBy({ top: 500, behavior: 'smooth' }); },
    response: null },
  { patterns: ['scroll up', 'go up', 'back up'],
    action: () => { window.scrollBy({ top: -500, behavior: 'smooth' }); },
    response: null },
  // Pricing
  { patterns: ['price', 'cost', 'how much', 'budget', 'expensive', 'affordable'],
    action: null,
    response: "It depends on scope, but the best way to get a proper figure is a quick free call. Want me to open the booking form?" },
  // Testimonials
  { patterns: ['testimonial', 'reviews', 'what do clients say', 'happy clients'],
    action: () => { document.querySelector('#nav-home')?.click(); setTimeout(() => document.getElementById('section-testimonials')?.scrollIntoView({ behavior: 'smooth' }), 300); },
    response: "Here is what some of our clients have said. If you want the same results, the team can chat through your project anytime." },
];

function handleInstantAction(userMessage) {
  const lower = userMessage.toLowerCase();

  for (const trigger of INSTANT_TRIGGERS) {
    for (const pattern of trigger.patterns) {
      if (lower.includes(pattern)) {
        // Execute the action immediately (if there is one)
        if (trigger.action) trigger.action();

        // Track in conversation history
        conversationHistory.push({ role: 'user', content: userMessage });

        if (trigger.response) {
          conversationHistory.push({ role: 'assistant', content: trigger.response });
          // Speak the canned response (way faster than LLM round-trip)
          speakText(trigger.response);
        } else {
          // No speech needed, resume listening
          resetPauseTimer();
        }

        return true; // Handled — don't send to LLM
      }
    }
  }

  return false; // Not handled — send to LLM
}

// === LLM Chat ===
async function chatWithSteve(userMessage) {
  if (isProcessing) return;
  isProcessing = true;
  clearPauseTimer();

  conversationHistory.push({ role: 'user', content: userMessage });
  updateStatus('Jenny is thinking...');

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
      // Wait a moment for the user to finish their thought
      silenceTimer = setTimeout(() => {
        if (finalTranscript.trim()) {
          const msg = finalTranscript.trim();
          finalTranscript = '';

          // === INSTANT KEYWORD TRIGGERS ===
          // Check for navigation keywords BEFORE sending to LLM.
          // This makes page switches instant — no thinking delay.
          const handled = handleInstantAction(msg);
          if (!handled) {
            stopListening();
            chatWithSteve(msg);
          }
        }
      }, 1000); // 1s — faster response than before
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

// === Request Mic Permission (non-blocking — doesn't prevent Steve from speaking) ===
async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    console.log('Mic permission granted');
    return true;
  } catch (err) {
    console.warn('Mic permission issue:', err.name, err.message);
    // Show helpful status but DON'T block Steve
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      updateStatus('Mic blocked — click the lock icon in your address bar to allow');
    } else if (err.name === 'NotFoundError') {
      updateStatus('No microphone found — Jenny can still talk to you');
    } else {
      updateStatus('Mic not available — Jenny can still talk to you');
    }
    micBtn.classList.add('steve-mic-btn--error');
    setTimeout(() => micBtn.classList.remove('steve-mic-btn--error'), 3000);
    return false;
  }
}

// === Activate Steve — Start the Conversation ===
async function activateSteve() {
  if (conversationActive) return;
  conversationActive = true;

  // Resume audio context (required for autoplay policy)
  if (audioContext && audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  // Steve greets FIRST (don't wait for mic permission)
  if (!hasGreeted) {
    hasGreeted = true;
    const greeting = "Hey there, welcome to Gitwix! I'm Jenny, your personal concierge. What can I help you with today?";
    conversationHistory.push({ role: 'assistant', content: greeting });
    await speakText(greeting);
  }

  // THEN request mic permission (non-blocking)
  const micGranted = await requestMicPermission();
  if (micGranted) {
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

// Mic button: toggle conversation on/off, or re-request mic if already active but mic denied
micBtn.addEventListener('click', () => {
  if (conversationActive) {
    // If already active but not listening (mic was denied), retry mic permission
    if (!isListening && !isSpeaking && !isProcessing) {
      requestMicPermission().then(granted => {
        if (granted) startContinuousListening();
      });
    } else {
      deactivateSteve();
    }
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

// Load and cache voices for browser TTS
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => {
    speechSynthesis.getVoices();
    cachedBestVoice = null; // Reset cache so getBestVoice picks from the full list
    getBestVoice(); // Pre-warm the voice selection
  };
}

// === INTRO PAGE INTEGRATION ===
// The intro splash page pre-fetches Jenny's greeting audio.
// When the user clicks "Enter Gitwix", we:
//   1. Request mic permission (the click unlocks browser audio + mic)
//   2. Play the pre-loaded greeting INSTANTLY (zero delay)
//   3. Fade out the intro to reveal the site
//   4. Start continuous listening after greeting finishes

const GREETING_TEXT = "Hey there, welcome to Gitwix! I'm Jenny, your personal concierge. What can I help you with today?";
let preloadedGreetingAudio = null;
let preloadedGreetingUrl = null;

// Pre-fetch greeting TTS while user sees the intro page
async function preloadGreeting() {
  const statusEl = document.getElementById('intro-preload-status');
  try {
    if (statusEl) statusEl.textContent = '';
    const res = await fetch(`${API}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: GREETING_TEXT }),
    });
    if (res.ok) {
      const blob = await res.blob();
      preloadedGreetingUrl = URL.createObjectURL(blob);
      preloadedGreetingAudio = new Audio(preloadedGreetingUrl);
      // Pre-decode the audio so it plays instantly
      preloadedGreetingAudio.preload = 'auto';
      if (statusEl) statusEl.textContent = '';
      console.log('Jenny greeting pre-loaded and ready');
    }
  } catch (err) {
    console.warn('Greeting pre-load failed, will use browser TTS:', err);
  }
}

// Called when user clicks "Enter Gitwix" on the intro page
async function enterSite() {
  const splash = document.getElementById('intro-splash');
  const mainSite = document.getElementById('main-site');
  const enterBtn = document.getElementById('intro-enter-btn');

  if (enterBtn) enterBtn.disabled = true;

  // 1. Request mic permission (the button click is the user gesture that unlocks everything)
  const micGranted = await requestMicPermission();

  // 2. Init audio context (unlocked by user gesture)
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  // 3. Show the main site, fade out intro
  if (mainSite) mainSite.style.display = '';
  if (splash) {
    splash.classList.add('intro-splash--exiting');
    setTimeout(() => splash.remove(), 700);
  }

  // 4. Init icons and refresh scroll
  setTimeout(() => {
    if (window.lucide) lucide.createIcons();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }, 100);

  // 5. Play greeting INSTANTLY from pre-loaded audio
  hasGreeted = true;
  conversationActive = true;
  conversationHistory.push({ role: 'assistant', content: GREETING_TEXT });

  if (preloadedGreetingAudio) {
    try {
      isSpeaking = true;
      updateStatus('Jenny is speaking...');
      currentAudio = preloadedGreetingAudio;

      setupOrbAudioAnalysis(preloadedGreetingAudio);
      await preloadedGreetingAudio.play();

      await new Promise(resolve => {
        preloadedGreetingAudio.onended = () => {
          isSpeaking = false;
          window.orbVisualizer?.setActive(false);
          if (preloadedGreetingUrl) URL.revokeObjectURL(preloadedGreetingUrl);
          currentAudio = null;
          updateStatus('');
          resolve();
        };
      });
    } catch (err) {
      console.warn('Pre-loaded audio failed, trying browser TTS:', err);
      isSpeaking = false;
      await fallbackSpeak(GREETING_TEXT);
    }
  } else {
    // Fallback if pre-load failed
    await fallbackSpeak(GREETING_TEXT);
  }

  // 6. Start listening
  if (micGranted) {
    startContinuousListening();
  }
  micBtn.classList.add('steve-mic-btn--active');
  resetPauseTimer();
}

// Wire up the intro button
const introBtn = document.getElementById('intro-enter-btn');
if (introBtn) {
  introBtn.addEventListener('click', enterSite);
}

// Start pre-loading the greeting audio immediately
preloadGreeting();

// === Export for orb.js ===
export { };
