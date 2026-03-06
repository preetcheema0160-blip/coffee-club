/* ============================================
   Coffee Club — Gravity Physics Engine
   Vanilla JS, zero dependencies
   ============================================ */

(function () {
  'use strict';

  /* ---------- Constants ---------- */
  const GRAVITY        = 980;     // px/s²
  const FRICTION       = 0.65;    // velocity multiplier on bounce
  const AIR_DRAG       = 0.998;   // per-frame drag
  const RESTITUTION    = 0.55;    // bounciness
  const REST_THRESHOLD = 0.8;     // velocity below which we stop
  const THROW_SCALE    = 1.4;     // amplify throw velocity
  const DELAY_BASE     = 800;     // ms before first element falls
  const DELAY_STEP     = 120;     // ms stagger between elements
  const FPS_INTERVAL   = 1000 / 60;

  /* ---------- State ---------- */
  let items     = [];
  let dragging  = null;   // { item, offsetX, offsetY, lastX, lastY, lastT }
  let animId    = null;
  let lastFrame = 0;

  /* ---------- Helpers ---------- */
  const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand    = (lo, hi) => Math.random() * (hi - lo) + lo;

  /* ---------- Item blueprint ---------- */
  function createItem(el) {
    const rect = el.getBoundingClientRect();
    return {
      el,
      x: rect.left + window.scrollX,
      y: rect.top  + window.scrollY,
      w: rect.width,
      h: rect.height,
      vx: rand(-30, 30),   // small random horizontal nudge
      vy: 0,
      released: false,
      resting: false,
    };
  }

  /* ---------- Init ---------- */
  function init() {
    const els = document.querySelectorAll('[data-gravity="true"]');
    els.forEach((el, i) => {
      const item = createItem(el);
      items.push(item);

      // Stagger-release
      setTimeout(() => {
        el.classList.add('gravity-element');
        el.style.width  = item.w + 'px';
        el.style.left   = item.x + 'px';
        el.style.top    = item.y + 'px';
        item.released = true;
      }, DELAY_BASE + i * DELAY_STEP);
    });

    // Attach listeners
    window.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup',   onPointerUp);
    window.addEventListener('resize', onResize);

    // Start loop
    lastFrame = performance.now();
    animId = requestAnimationFrame(step);
  }

  /* ---------- Physics step ---------- */
  function step(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05); // cap delta
    lastFrame = now;

    const floorY  = window.innerHeight - 4; // floor div = 4px
    const wallR   = window.innerWidth;

    for (const item of items) {
      if (!item.released || item === dragging?.item) continue;

      if (item.resting) {
        // Check if still on solid ground (window may have resized)
        if (item.y + item.h < floorY - 1) {
          item.resting = false;
        } else {
          continue;
        }
      }

      // Apply gravity
      item.vy += GRAVITY * dt;

      // Air drag
      item.vx *= AIR_DRAG;
      item.vy *= AIR_DRAG;

      // Integrate
      item.x += item.vx * dt;
      item.y += item.vy * dt;

      // Floor collision
      if (item.y + item.h >= floorY) {
        item.y  = floorY - item.h;
        item.vy = -item.vy * RESTITUTION;
        item.vx *= FRICTION;

        if (Math.abs(item.vy) < REST_THRESHOLD) {
          item.vy = 0;
          item.vx = 0;
          item.resting = true;
        }
      }

      // Wall collisions
      if (item.x < 0) {
        item.x  = 0;
        item.vx = -item.vx * RESTITUTION;
      } else if (item.x + item.w > wallR) {
        item.x  = wallR - item.w;
        item.vx = -item.vx * RESTITUTION;
      }

      // Ceiling collision (for thrown items)
      if (item.y < 0) {
        item.y  = 0;
        item.vy = -item.vy * RESTITUTION;
      }

      // Apply position
      item.el.style.left = item.x + 'px';
      item.el.style.top  = item.y + 'px';
    }

    // Simple element-to-element collision (push apart)
    resolveCollisions(items, floorY);

    animId = requestAnimationFrame(step);
  }

  /* ---------- Collision resolution ---------- */
  function resolveCollisions(items, floorY) {
    for (let i = 0; i < items.length; i++) {
      if (!items[i].released) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (!items[j].released) continue;

        const a = items[i];
        const b = items[j];

        // AABB overlap test
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

        if (overlapX > 0 && overlapY > 0) {
          // Push apart on the axis of least overlap
          if (overlapX < overlapY) {
            const sign = a.x < b.x ? -1 : 1;
            a.x += sign * overlapX * 0.5;
            b.x -= sign * overlapX * 0.5;
            // Swap velocities with damping
            const tmpVx = a.vx;
            a.vx = b.vx * RESTITUTION;
            b.vx = tmpVx * RESTITUTION;
            a.resting = false;
            b.resting = false;
          } else {
            const sign = a.y < b.y ? -1 : 1;
            a.y += sign * overlapY * 0.5;
            b.y -= sign * overlapY * 0.5;
            const tmpVy = a.vy;
            a.vy = b.vy * RESTITUTION;
            b.vy = tmpVy * RESTITUTION;
            a.resting = false;
            b.resting = false;
          }

          // Clamp to floor
          if (a.y + a.h > floorY) a.y = floorY - a.h;
          if (b.y + b.h > floorY) b.y = floorY - b.h;
        }
      }
    }
  }

  /* ---------- Pointer Events ---------- */
  function findItem(target) {
    return items.find(it => it.el === target || it.el.contains(target));
  }

  function onPointerDown(e) {
    const item = findItem(e.target);
    if (!item || !item.released) return;

    e.preventDefault();
    item.resting = false;
    item.vx = 0;
    item.vy = 0;
    item.el.classList.add('dragging');
    item.el.setPointerCapture(e.pointerId);

    dragging = {
      item,
      offsetX: e.clientX - item.x,
      offsetY: e.clientY - item.y,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
      trail: [],
    };
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();

    const item = dragging.item;
    item.x = e.clientX - dragging.offsetX;
    item.y = e.clientY - dragging.offsetY;
    item.el.style.left = item.x + 'px';
    item.el.style.top  = item.y + 'px';

    // Track velocity samples
    dragging.trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (dragging.trail.length > 6) dragging.trail.shift();
  }

  function onPointerUp(e) {
    if (!dragging) return;

    const item = dragging.item;
    item.el.classList.remove('dragging');

    // Calculate throw velocity from last few pointer samples
    const trail = dragging.trail;
    if (trail.length >= 2) {
      const first = trail[0];
      const last  = trail[trail.length - 1];
      const dt    = (last.t - first.t) / 1000 || 0.016;
      item.vx = ((last.x - first.x) / dt) * THROW_SCALE;
      item.vy = ((last.y - first.y) / dt) * THROW_SCALE;

      // Clamp to reasonable speed
      item.vx = clamp(item.vx, -3000, 3000);
      item.vy = clamp(item.vy, -3000, 3000);
    }

    dragging = null;
  }

  /* ---------- Resize Handler ---------- */
  function onResize() {
    const floorY = window.innerHeight - 4;
    const wallR  = window.innerWidth;
    for (const item of items) {
      if (!item.released) continue;
      // Keep items within bounds
      if (item.x + item.w > wallR) item.x = wallR - item.w;
      if (item.y + item.h > floorY) {
        item.y  = floorY - item.h;
        item.vy = 0;
      }
      item.el.style.left = item.x + 'px';
      item.el.style.top  = item.y + 'px';
      item.resting = false;
    }
  }

  /* ---------- Boot ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
