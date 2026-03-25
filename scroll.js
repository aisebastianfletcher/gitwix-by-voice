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

  // === STEVE ORB SCROLL COMPANION v3 (desktop only) ===
  // v3: Smooth orb that glides between sections. The orb wrapper is 38vw wide.
  // Positions are chosen so the orb sits cleanly between content, never overlapping.
  // Uses onEnter/onEnterBack with gsap.to for smooth position-based animation.
  const orbWrapper = document.getElementById('orb-viewport-wrapper');
  const isDesktopOrb = window.innerWidth > 768;

  if (orbWrapper && isDesktopOrb) {
    // Position constants (% from left edge):
    //   right  = 62%  → orb in rightmost 38vw, clear of left content
    //   left   = 2%   → orb in leftmost 38vw, clear of right content
    //   far-R  = 68%  → pushed to edge during full-width services section
    const ORB_RIGHT = '62%';
    const ORB_LEFT  = '2%';
    const ORB_FAR_R = '68%';

    // Initial position: orb on right
    gsap.set(orbWrapper, { left: ORB_RIGHT, right: 'auto', width: '38vw', opacity: 1 });

    // Smooth mover — all transitions use the same easing for consistency
    let currentOrbTarget = ORB_RIGHT;
    function moveOrb(left, opacity, scale, dur) {
      if (left === currentOrbTarget) return; // Don't re-trigger same position
      currentOrbTarget = left;
      gsap.to(orbWrapper, {
        left: left,
        opacity: opacity,
        duration: dur || 1.2,
        ease: 'power3.inOut',
        overwrite: 'auto',
        onUpdate: () => window.orbResize?.(),
      });
      window.orbVisualizer?.setScale(scale);
    }

    // Unified scroll listener: determine active section by which one
    // occupies the most viewport area, then move the orb accordingly.
    // This avoids trigger-ordering conflicts entirely.
    const sectionConfig = [
      { id: 'section-hero',             left: ORB_RIGHT, scale: 1,    opacity: 1,    dur: 1.0 },
      { id: 'section-services-hscroll', left: ORB_FAR_R, scale: 0.45, opacity: 0.15, dur: 0.8 },
      { id: 'section-stats',            left: ORB_LEFT,  scale: 0.7,  opacity: 0.5,  dur: 1.4 },
      { id: 'section-testimonials',     left: ORB_LEFT,  scale: 0.65, opacity: 0.45, dur: 1.0 },
      { id: 'section-cta',              left: ORB_RIGHT, scale: 0.8,  opacity: 0.55, dur: 1.4 },
    ];

    let lastActiveSection = 'section-hero';

    function updateOrbForScroll() {
      const vh = window.innerHeight;
      let bestSection = null;
      let bestCoverage = 0;

      for (const cfg of sectionConfig) {
        const el = document.getElementById(cfg.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // How much of this section is visible in the viewport?
        const visTop = Math.max(0, rect.top);
        const visBot = Math.min(vh, rect.bottom);
        const coverage = Math.max(0, visBot - visTop);
        if (coverage > bestCoverage) {
          bestCoverage = coverage;
          bestSection = cfg;
        }
      }

      if (bestSection && bestSection.id !== lastActiveSection) {
        lastActiveSection = bestSection.id;
        moveOrb(bestSection.left, bestSection.opacity, bestSection.scale, bestSection.dur);
      }
    }

    // Run on every scroll tick via ScrollTrigger
    ScrollTrigger.addEventListener('refresh', updateOrbForScroll);
    ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: updateOrbForScroll,
    });

    // Fade out near footer
    const footer = document.getElementById('main-footer');
    if (footer) {
      ScrollTrigger.create({
        trigger: footer,
        start: 'top 90%',
        end: 'top 50%',
        scrub: true,
        onUpdate: (self) => {
          gsap.set(orbWrapper, { opacity: 0.55 * (1 - self.progress) });
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
