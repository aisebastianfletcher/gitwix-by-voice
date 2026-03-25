/**
 * Steve — AI Concierge for Gitwix
 * Handles: voice recognition, LLM responses, TTS playback,
 * virtual cursor animation, DOM navigation, and form filling.
 */

// === API Configuration ===
const API = "__PORT_8000__".startsWith("__") ? "http://localhost:8000" : "__PORT_8000__";

// === DOM References ===
const micBtn = document.getElementById('steve-mic-btn');
const bubble = document.getElementById('steve-bubble');
const bubbleText = document.getElementById('steve-bubble-text');
const statusEl = document.getElementById('steve-status');
const cursor = document.getElementById('steve-cursor');

// === State ===
let isListening = false;
let isSpeaking = false;
let recognition = null;
let audioContext = null;
let analyser = null;
let currentAudio = null;
let conversationHistory = [];

// === Website DOM Map (Steve's knowledge) ===
const DOM_MAP = {
  // Navigation
  'home': { selector: '#nav-home', description: 'Home page link in the navigation' },
  'about': { selector: '#nav-about', description: 'About page link in the navigation' },
  'portfolio': { selector: '#nav-portfolio', description: 'Portfolio page link in the navigation' },
  'work': { selector: '#nav-portfolio', description: 'Portfolio page link in the navigation' },
  'projects': { selector: '#nav-portfolio', description: 'Portfolio page link in the navigation' },
  'contact': { selector: '#nav-contact', description: 'Contact page link in the navigation' },
  'booking': { selector: '#nav-contact', description: 'Contact page link in the navigation' },
  'book': { selector: '#nav-contact', description: 'Contact page link in the navigation' },

  // Buttons
  'view work': { selector: '#btn-view-work', description: 'View our work button on the home page' },
  'book consultation': { selector: '#btn-cta-book', description: 'Book a consultation button' },
  'start project': { selector: '#btn-portfolio-contact', description: 'Start a project button on portfolio page' },
  'submit': { selector: '#btn-submit-form', description: 'Submit the contact form' },

  // Form fields
  'name field': { selector: '#contact-name', description: 'Name input field on the contact form' },
  'email field': { selector: '#contact-email', description: 'Email input field on the contact form' },
  'company field': { selector: '#contact-company', description: 'Company input field on the contact form' },
  'project field': { selector: '#contact-project', description: 'Project details textarea on the contact form' },

  // Sections
  'services': { selector: '#section-services', description: 'Services section on the home page' },
  'stats': { selector: '#section-stats', description: 'Statistics section on the home page' },
  'testimonials': { selector: '#section-testimonials', description: 'Testimonials section on the home page' },
};

// === Steve's System Prompt ===
const SYSTEM_PROMPT = `You are Steve, a full-time web developer and AI concierge at Gitwix, a bespoke web development agency based in Manchester, UK.

PERSONALITY:
- Highly intelligent, extremely helpful, warm, and distinctly humorous
- Professional but conversational — you're a mate who happens to be brilliant at web dev
- Love a good developer joke but never let humor block efficiency
- British wit, not American slapstick

KNOWLEDGE:
- Gitwix builds bespoke, high-performance websites and web apps
- Services: UI/UX Design, Web Development, AI Integration, E-Commerce, SEO & Performance, Ongoing Support
- Stats: 87+ projects delivered, 35+ happy clients, 100 Lighthouse scores, 35% avg conversion lift
- Stack: React, Next.js, TypeScript, Three.js, Tailwind, Node.js, Python, FastAPI, PostgreSQL, Redis, OpenAI, LiveKit
- Founded in Manchester by a developer who was tired of cookie-cutter websites
- Notable clients: NovaTech Solutions, Ridgeline Ventures, Kōda Studio, Beacon Digital, Evergreen Health, Lyric Music

WEBSITE PAGES:
- HOME: Hero, services grid, stats, testimonials, CTA
- ABOUT: Agency story, values (Craftsmanship, Performance, Innovation, Honesty), tech stack
- PORTFOLIO: 6 project cards (NovaTech, Ridgeline, Kōda, Beacon, Evergreen, Lyric)
- CONTACT: Booking form (name, email, company, project details)

CAPABILITIES — You can control the website. When you want to perform an action, include a JSON command block in your response wrapped in triple backticks with "action" prefix. Examples:

\`\`\`action
{"type": "navigate", "target": "portfolio"}
\`\`\`

\`\`\`action
{"type": "scroll", "target": "services"}
\`\`\`

\`\`\`action
{"type": "fill_form", "fields": {"contact-name": "Jane Smith", "contact-email": "jane@example.com"}}
\`\`\`

\`\`\`action
{"type": "click", "target": "#btn-submit-form"}
\`\`\`

INTERACTION RULES:
- When navigating, narrate naturally: "Sure thing, let me pull up our portfolio for you..."
- When a user shows interest, casually offer to book a meeting
- For form filling, guide conversationally — ask for name, email, project details
- Keep responses concise — 2-3 sentences max unless explaining something complex
- Always wait for the user to finish before responding
- If someone asks you to scroll, say you're doing it and include the scroll action

IMPORTANT: Only include action blocks when the user explicitly asks you to navigate, click, scroll, or fill something. Don't navigate just because you mention a page.`;

// === Audio Analysis for Orb ===
function setupAudioAnalysis(audioElement) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.8;

  const source = audioContext.createMediaElementSource(audioElement);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  const dataArray = new Float32Array(analyser.frequencyBinCount);

  function updateOrb() {
    if (!isSpeaking) {
      window.orbVisualizer?.setActive(false);
      return;
    }

    analyser.getFloatFrequencyData(dataArray);

    // Normalize frequency data to 0-1 range
    const normalized = new Float32Array(32);
    let rms = 0;
    for (let i = 0; i < Math.min(dataArray.length, 32); i++) {
      const val = (dataArray[i] + 100) / 100; // Normalize from dB to 0-1
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

  // Animate cursor to target
  return new Promise(resolve => {
    const startX = parseFloat(cursor.style.left) || window.innerWidth / 2;
    const startY = parseFloat(cursor.style.top) || window.innerHeight / 2;
    const duration = 800;
    const startTime = performance.now();

    function animate(time) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      cursor.style.left = (startX + (x - startX) * ease) + 'px';
      cursor.style.top = (startY + (y - startY) * ease) + 'px';

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Click ripple
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
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
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
        // Navigate to contact page first
        const contactLink = document.querySelector('#nav-contact');
        if (contactLink) contactLink.click();
        await new Promise(r => setTimeout(r, 400));

        for (const [fieldId, value] of Object.entries(action.fields)) {
          const field = document.getElementById(fieldId);
          if (field) {
            await moveCursorTo('#' + fieldId);
            await new Promise(r => setTimeout(r, 200));
            // Type effect
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
  }
}

// === Parse and Execute Actions from Response ===
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
  // Strip action blocks from display text
  const cleanText = text.replace(/```action\s*\n[\s\S]*?\n```/g, '').trim();
  return { actions, cleanText };
}

// === TTS Playback ===
let audioSourceNode = null;

async function speakText(text) {
  if (!text) return;
  isSpeaking = true;
  updateStatus('Steve is speaking...');

  try {
    const res = await fetch(`${API}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      // Fallback to browser TTS
      return fallbackSpeak(text);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    currentAudio = audio;

    // Set up audio analysis for orb
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Can only create one MediaElementSource per element
    if (!audio._sourceCreated) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
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
}

function fallbackSpeak(text) {
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 0.95;
    utter.lang = 'en-GB';

    // Try to pick a UK male voice
    const voices = speechSynthesis.getVoices();
    const ukMale = voices.find(v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('male'));
    const uk = voices.find(v => v.lang.startsWith('en-GB'));
    if (ukMale) utter.voice = ukMale;
    else if (uk) utter.voice = uk;

    utter.onstart = () => {
      isSpeaking = true;
      window.orbVisualizer?.setActive(true);
      // Simple pulse for browser TTS (no frequency data)
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
      resolve();
    };

    speechSynthesis.speak(utter);
  });
}

// === LLM Chat ===
async function chatWithSteve(userMessage) {
  conversationHistory.push({ role: 'user', content: userMessage });

  // Show thinking state
  showBubble('Hmm, let me think...');
  updateStatus('Steve is thinking...');

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: conversationHistory,
        system: SYSTEM_PROMPT,
      }),
    });

    if (!res.ok) throw new Error('Chat API failed');

    const data = await res.json();
    const fullResponse = data.response || "Sorry, I'm having a bit of a moment. Try again?";

    // Parse actions
    const { actions, cleanText } = parseActions(fullResponse);

    conversationHistory.push({ role: 'assistant', content: cleanText });

    // Show the text
    showBubble(cleanText);

    // Execute actions
    for (const action of actions) {
      await executeAction(action);
    }

    // Speak the clean text
    await speakText(cleanText);

    updateStatus('');
  } catch (err) {
    console.error('Chat error:', err);
    const fallbackMsg = "Ah, looks like my wires got crossed. Give me a sec and try again — I promise I'm usually more reliable than a Monday morning deploy.";
    showBubble(fallbackMsg);
    await speakText(fallbackMsg);
    updateStatus('');
  }
}

// === Speech Recognition ===
function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported');
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = 'en-GB';

  rec.onstart = () => {
    isListening = true;
    micBtn.classList.add('steve-mic-btn--listening');
    updateStatus('Listening...');
    showBubble('I\'m all ears...');
  };

  rec.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    if (event.results[event.results.length - 1].isFinal) {
      stopListening();
      if (transcript.trim()) {
        chatWithSteve(transcript.trim());
      }
    } else {
      // Show interim results
      showBubble(`"${transcript}"`);
    }
  };

  rec.onerror = (event) => {
    console.warn('Recognition error:', event.error);
    stopListening();
    if (event.error === 'no-speech') {
      showBubble("I didn't catch that. Give the mic another tap when you're ready.");
    }
  };

  rec.onend = () => {
    stopListening();
  };

  return rec;
}

function startListening() {
  if (isSpeaking) {
    // Stop Steve from speaking
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    speechSynthesis.cancel();
    isSpeaking = false;
    window.orbVisualizer?.setActive(false);
  }

  if (!recognition) {
    recognition = initRecognition();
  }

  if (recognition && !isListening) {
    // Resume audio context if suspended
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    recognition.start();
  }
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('steve-mic-btn--listening');
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }
}

// === UI Helpers ===
function showBubble(text) {
  bubbleText.textContent = text;
  bubble.classList.add('steve-bubble--visible');
}

function hideBubble() {
  bubble.classList.remove('steve-bubble--visible');
}

function updateStatus(text) {
  statusEl.textContent = text;
}

// === Event Listeners ===
micBtn.addEventListener('click', () => {
  if (isListening) {
    stopListening();
  } else {
    startListening();
  }
});

// Activate Steve from nav buttons
document.querySelectorAll('[data-action="activate-steve"]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    showBubble("Hey there! I'm Steve, your AI concierge at Gitwix. Click the mic and tell me what you're looking for — I can navigate the site, explain our services, or even book you a consultation. What can I do for you?");
    speakText("Hey there! I'm Steve, your AI concierge at Gitwix. Click the mic and tell me what you're looking for.");
  });
});

// Load voices for browser TTS fallback
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// Initial greeting bubble (delayed)
setTimeout(() => {
  showBubble("Hey there! I'm Steve, your AI concierge. Click the mic to chat with me.");
}, 2000);

// Hide bubble after 8 seconds if no interaction
setTimeout(() => {
  if (!isListening && !isSpeaking) {
    hideBubble();
  }
}, 10000);
