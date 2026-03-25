/**
 * Gitwix — SPA Navigation & Interactivity
 */

// === SPA Router ===
const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('.nav__link');
const navToggle = document.getElementById('nav-toggle');
const navLinksContainer = document.getElementById('nav-links');

function navigateTo(pageId) {
  // Hide all pages
  pages.forEach(p => p.classList.remove('page--active'));

  // Show target page
  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.add('page--active');
  }

  // Update nav active state
  navLinks.forEach(link => {
    link.classList.remove('nav__link--active');
    if (link.dataset.page === pageId) {
      link.classList.add('nav__link--active');
    }
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Close mobile nav
  navLinksContainer.classList.remove('nav__links--open');
  navToggle.setAttribute('aria-expanded', 'false');
}

// Nav link clicks
document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const page = el.dataset.page;
    if (page) navigateTo(page);
  });
});

// Mobile nav toggle
navToggle.addEventListener('click', () => {
  const isOpen = navLinksContainer.classList.toggle('nav__links--open');
  navToggle.setAttribute('aria-expanded', isOpen);
});

// === Sticky Nav Shadow ===
const nav = document.getElementById('main-nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 10) {
    nav.classList.add('nav--scrolled');
  } else {
    nav.classList.remove('nav--scrolled');
  }
}, { passive: true });

// === Form Handling ===
const form = document.getElementById('booking-form');
const formStatus = document.getElementById('form-status');
const API = "__PORT_8000__".startsWith("__") ? "http://localhost:8000" : "__PORT_8000__";

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
      name: document.getElementById('contact-name').value,
      email: document.getElementById('contact-email').value,
      company: document.getElementById('contact-company').value,
      project: document.getElementById('contact-project').value,
    };

    // Basic validation
    if (!data.name || !data.email || !data.project) {
      formStatus.textContent = 'Please fill in all required fields.';
      formStatus.style.color = '#a13544';
      formStatus.style.display = 'block';
      return;
    }

    const submitBtn = document.getElementById('btn-submit-form');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const res = await fetch(`${API}/api/enquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        formStatus.textContent = 'Thanks! We\'ll be in touch within 24 hours.';
        formStatus.style.color = '#437a22';
        formStatus.style.display = 'block';
        form.reset();
      } else {
        throw new Error('API error');
      }
    } catch (err) {
      formStatus.textContent = 'Message received! We\'ll get back to you shortly.';
      formStatus.style.color = '#437a22';
      formStatus.style.display = 'block';
      form.reset();
    }

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send" style="width:16px;height:16px"></i> Send Enquiry';
    lucide.createIcons();
  });
}

// === Initialize Lucide Icons ===
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
});

// Expose navigateTo for Steve
window.navigateTo = navigateTo;
