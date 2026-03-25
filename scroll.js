/**
 * Gitwix — Premium Scroll Dynamics
 * GSAP ScrollTrigger + Lenis smooth scroll + text reveals + parallax
 */

// Wait for DOM + GSAP to be ready
function initScrollDynamics() {
  gsap.registerPlugin(ScrollTrigger);

  // === Lenis Smooth Scroll ===
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // === STEVE ORB SCROLL COMPANION v2 (desktop only) ===
  // v2 key insight: content sections use asymmetric split layouts.
  // When orb is on the right (left:55%), content is on the left ~55% of viewport.
  // When orb is on the left (left:0%), content is on the right ~55% of viewport.
  // The content "scrolls past" the orb because it genuinely occupies the other side.
  const orbWrapper = document.getElementById('orb-viewport-wrapper');
  const isDesktopOrb = window.innerWidth > 768;

  if (orbWrapper && isDesktopOrb) {
    // Set initial position: orb on right side
    gsap.set(orbWrapper, { left: '55%', right: 'auto', width: '45vw' });

    // Position map — each section has content on one side, orb on the other
    //   left: 55%  → orb RIGHT column (content is LEFT via split-layout--left)
    //   left: 0%   → orb LEFT column  (content is RIGHT via split-layout--right)
    const sections = [
      // Hero: text left → orb right (big, full presence)
      { trigger: '#section-hero', leftPct: '55%', scale: 1, opacity: 1 },

      // Services h-scroll: header left → orb drifts right, shrinks
      { trigger: '#section-services-hscroll', leftPct: '55%', scale: 0.65, opacity: 0.4 },

      // Stats: content RIGHT → orb LEFT, grows from services small size
      { trigger: '#section-stats', leftPct: '0%', scale: 0.75, opacity: 0.6 },

      // Testimonials: content RIGHT → orb LEFT, stays same side, slightly smaller
      { trigger: '#section-testimonials', leftPct: '0%', scale: 0.7, opacity: 0.55 },

      // CTA: content LEFT → orb RIGHT, big dramatic switch back
      { trigger: '#section-cta', leftPct: '55%', scale: 0.85, opacity: 0.65 },
    ];

    // Helper to animate orb to a position with smooth transition
    function moveOrb(leftPct, opacity, scale) {
      gsap.to(orbWrapper, {
        left: leftPct,
        opacity: opacity,
        duration: 1,
        ease: 'power2.inOut',
        onUpdate: () => window.orbResize?.(),
      });
      // Smooth scale via the Three.js API
      window.orbVisualizer?.setScale(scale);
    }

    sections.forEach(({ trigger, leftPct, scale, opacity }) => {
      const el = document.querySelector(trigger);
      if (!el) return;

      ScrollTrigger.create({
        trigger: el,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => moveOrb(leftPct, opacity, scale),
        onEnterBack: () => moveOrb(leftPct, opacity, scale),
      });
    });

    // Fade orb out gracefully near footer
    const footer = document.getElementById('main-footer');
    if (footer) {
      ScrollTrigger.create({
        trigger: footer,
        start: 'top 90%',
        end: 'top 50%',
        scrub: true,
        onUpdate: (self) => {
          gsap.set(orbWrapper, { opacity: 0.65 * (1 - self.progress) });
        },
      });
    }
  }

  // === Text Split & Reveal Utility ===
  function splitTextIntoLines(el) {
    const text = el.innerHTML;
    const words = text.split(/\s+/);
    el.innerHTML = '';
    el.style.overflow = 'hidden';

    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'word-reveal';
      span.innerHTML = word + (i < words.length - 1 ? '&nbsp;' : '');
      span.style.display = 'inline-block';
      span.style.transform = 'translateY(100%)';
      span.style.opacity = '0';
      el.appendChild(span);
    });

    return el.querySelectorAll('.word-reveal');
  }

  // === Section Label Clip Reveal ===
  document.querySelectorAll('.section__label').forEach(label => {
    gsap.fromTo(label,
      { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
      {
        clipPath: 'inset(0 0% 0 0)', opacity: 1,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: label,
          start: 'top 85%',
          toggleActions: 'play none none none',
        }
      }
    );
  });

  // === Section Titles — Word-by-word Reveal (only plain-text titles) ===
  document.querySelectorAll('.section__title, .hero__title').forEach(title => {
    if (title.closest('.section--hero')) return; // Hero handled separately
    if (title.closest('#section-services-hscroll')) return; // Handled by pin
    // Skip titles with rich HTML (em, span, br, etc.) — use simpler reveal instead
    if (title.querySelector('em, span, strong, a, br')) {
      gsap.fromTo(title,
        { opacity: 0, y: 30, filter: 'blur(4px)' },
        {
          opacity: 1, y: 0, filter: 'blur(0px)',
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: title,
            start: 'top 80%',
            toggleActions: 'play none none none',
          }
        }
      );
      return;
    }

    const words = splitTextIntoLines(title);
    gsap.to(words, {
      y: 0, opacity: 1,
      duration: 0.6,
      ease: 'power3.out',
      stagger: 0.04,
      scrollTrigger: {
        trigger: title,
        start: 'top 80%',
        toggleActions: 'play none none none',
      }
    });
  });

  // === Section Subtitles — Fade up ===
  document.querySelectorAll('.section__subtitle').forEach(sub => {
    gsap.fromTo(sub,
      { opacity: 0, y: 30 },
      {
        opacity: 1, y: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: sub,
          start: 'top 85%',
          toggleActions: 'play none none none',
        }
      }
    );
  });

  // === SERVICES — Horizontal Scroll with Pinned Title (desktop only) ===
  const servicesSection = document.getElementById('section-services-hscroll');
  const isDesktop = window.innerWidth > 768;

  if (servicesSection && isDesktop) {
    const servicesTrack = servicesSection.querySelector('.services-track');
    const serviceCards = servicesSection.querySelectorAll('.service-card');

    if (servicesTrack && serviceCards.length) {
      const totalWidth = servicesTrack.scrollWidth - window.innerWidth + 200;

      const hScrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: servicesSection,
          start: 'top top',
          end: () => `+=${totalWidth}`,
          scrub: 1,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        }
      });

      hScrollTl.to(servicesTrack, {
        x: () => -totalWidth,
        ease: 'none',
      });

      serviceCards.forEach((card, i) => {
        gsap.fromTo(card,
          { opacity: 0, y: 40, scale: 0.95 },
          {
            opacity: 1, y: 0, scale: 1,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: card,
              containerAnimation: hScrollTl,
              start: 'left 80%',
              toggleActions: 'play none none none',
            }
          }
        );
      });
    }
  } else if (servicesSection) {
    // Mobile: simple stagger reveal
    servicesSection.querySelectorAll('.service-card').forEach((card) => {
      gsap.fromTo(card,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: card,
            start: 'top 85%',
            toggleActions: 'play none none none',
          }
        }
      );
    });
  }

  // === STATS — Number Count-up ===
  document.querySelectorAll('.stat__number[data-count]').forEach(el => {
    const target = parseInt(el.getAttribute('data-count'));
    const suffix = el.textContent.replace(/[\d]/g, '').trim();

    gsap.fromTo(el,
      { innerText: 0 },
      {
        innerText: target,
        duration: 2,
        ease: 'power2.out',
        snap: { innerText: 1 },
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
        onUpdate() {
          el.textContent = Math.round(parseFloat(el.innerText || 0)) + suffix;
        }
      }
    );
  });

  // Stats section — staggered reveal from the right (content side)
  const statsSection = document.getElementById('section-stats');
  if (statsSection) {
    const statsContent = statsSection.querySelector('.split-layout__content') || statsSection;
    gsap.fromTo(statsContent.querySelectorAll('.stat'),
      { opacity: 0, x: 40 },
      {
        opacity: 1, x: 0,
        stagger: 0.12,
        duration: 0.7,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: statsSection,
          start: 'top 80%',
          toggleActions: 'play none none none',
        }
      }
    );
  }

  // === TESTIMONIALS — Stacked cards with staggered reveal ===
  const testimonialsSection = document.getElementById('section-testimonials');
  if (testimonialsSection) {
    const testimonials = testimonialsSection.querySelectorAll('.testimonial');

    testimonials.forEach((card, i) => {
      // Cards slide in from the right (they’re on the right side of the split layout)
      gsap.fromTo(card,
        { opacity: 0, x: 60, rotateZ: 1 },
        {
          opacity: 1, x: 0, rotateZ: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: card,
            start: 'top 85%',
            toggleActions: 'play none none none',
          }
        }
      );

      // Subtle parallax on scroll
      gsap.to(card, {
        y: (i % 2 === 0 ? -20 : -10),
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.5,
        }
      });
    });
  }

  // === PORTFOLIO — Reveal with clip-path + parallax images ===
  document.querySelectorAll('.portfolio-card').forEach((card, i) => {
    const img = card.querySelector('.portfolio-card__img');

    // Card reveals with clip path
    gsap.fromTo(card,
      { clipPath: 'inset(10% 10% 10% 10%)', opacity: 0 },
      {
        clipPath: 'inset(0% 0% 0% 0%)', opacity: 1,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 85%',
          toggleActions: 'play none none none',
        }
      }
    );

    // Image parallax within card
    if (img) {
      gsap.to(img, {
        y: '-15%',
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        }
      });
    }
  });

  // === CTA — Dramatic Scale Entrance ===
  const ctaSection = document.getElementById('section-cta');
  if (ctaSection) {
    const ctaTitle = ctaSection.querySelector('.section__title');
    const ctaSubtitle = ctaSection.querySelector('.section__subtitle');
    const ctaActions = ctaSection.querySelector('.hero__actions');

    if (ctaTitle) {
      gsap.fromTo(ctaTitle,
        { scale: 0.85, opacity: 0, filter: 'blur(8px)' },
        {
          scale: 1, opacity: 1, filter: 'blur(0px)',
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: ctaSection,
            start: 'top 70%',
            toggleActions: 'play none none none',
          }
        }
      );
    }
    if (ctaSubtitle) {
      gsap.fromTo(ctaSubtitle,
        { opacity: 0, y: 20 },
        {
          opacity: 1, y: 0,
          duration: 0.8,
          delay: 0.2,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: ctaSection,
            start: 'top 70%',
            toggleActions: 'play none none none',
          }
        }
      );
    }
    if (ctaActions) {
      gsap.fromTo(ctaActions,
        { opacity: 0, y: 20 },
        {
          opacity: 1, y: 0,
          duration: 0.8,
          delay: 0.35,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: ctaSection,
            start: 'top 70%',
            toggleActions: 'play none none none',
          }
        }
      );
    }
  }

  // === ABOUT PAGE — Pinned Left / Scrolling Right ===
  const aboutSplit = document.querySelector('.about-pinned');
  if (aboutSplit) {
    const leftCol = aboutSplit.querySelector('.about-pinned__left');
    const rightItems = aboutSplit.querySelectorAll('.about-pinned__right > *');

    if (leftCol && rightItems.length) {
      ScrollTrigger.create({
        trigger: aboutSplit,
        start: 'top top+=80',
        end: 'bottom bottom',
        pin: leftCol,
        pinSpacing: false,
      });

      rightItems.forEach((item, i) => {
        gsap.fromTo(item,
          { opacity: 0, x: 60 },
          {
            opacity: 1, x: 0,
            duration: 0.7,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: item,
              start: 'top 80%',
              toggleActions: 'play none none none',
            }
          }
        );
      });
    }
  }

  // === GENERAL — Parallax decorative elements ===
  document.querySelectorAll('[data-parallax]').forEach(el => {
    const speed = parseFloat(el.getAttribute('data-parallax')) || 0.2;
    gsap.to(el, {
      y: () => -100 * speed,
      scrollTrigger: {
        trigger: el.parentElement || el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1.5,
      }
    });
  });

  // === CARD REVEALS — Universal stagger for all cards ===
  document.querySelectorAll('.card').forEach((card, i) => {
    if (card.closest('#section-services-hscroll')) return; // handled by h-scroll

    gsap.fromTo(card,
      { opacity: 0, y: 40 },
      {
        opacity: 1, y: 0,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 85%',
          toggleActions: 'play none none none',
        }
      }
    );
  });

  // === HERO — Entrance animations (not scroll-triggered) ===
  const heroTitle = document.getElementById('hero-title');
  const heroBadge = document.getElementById('hero-badge');
  const heroDesc = document.getElementById('hero-desc');
  const heroActions = document.getElementById('hero-actions');

  if (heroTitle) {
    const heroTl = gsap.timeline({ delay: 0.3 });

    heroTl
      .fromTo(heroBadge,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
      )
      .fromTo(heroTitle,
        { opacity: 0, y: 40, filter: 'blur(6px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power3.out' },
        '-=0.3'
      )
      .fromTo(heroDesc,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' },
        '-=0.5'
      )
      .fromTo(heroActions,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' },
        '-=0.4'
      );
  }

  // Expose lenis for potential use
  window._lenis = lenis;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScrollDynamics);
} else {
  initScrollDynamics();
}
