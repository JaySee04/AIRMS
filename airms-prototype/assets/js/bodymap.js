/* AIRMS — Body / Muscle Map (v7, clean inline-SVG)
   - Simplified geometric wireframe (circle + rects + polygons) for the body
   - Muscles drawn as <rect> or <polygon> within the same viewBox so alignment
     is locked. No HTML overlay positioning.
   - Same viewBox (0 0 200 400) for both Front and Back views.
*/
(function () {

  // ---------- Shared wireframe (used by both views) ----------
  const WIREFRAME = `
    <!-- Head -->
    <circle class="bodymap__outline" cx="100" cy="36" r="24"/>
    <!-- Neck -->
    <rect class="bodymap__outline" x="90" y="58" width="20" height="12" rx="2"/>
    <!-- Torso (V-taper) -->
    <polygon class="bodymap__outline" points="56,70 144,70 136,210 64,210"/>
    <!-- Right upper arm / forearm -->
    <rect class="bodymap__outline" x="146" y="72" width="22" height="72" rx="3"/>
    <rect class="bodymap__outline" x="148" y="147" width="20" height="70" rx="3"/>
    <!-- Left upper arm / forearm -->
    <rect class="bodymap__outline" x="32" y="72" width="22" height="72" rx="3"/>
    <rect class="bodymap__outline" x="32" y="147" width="20" height="70" rx="3"/>
    <!-- Hips -->
    <polygon class="bodymap__outline" points="64,210 136,210 148,250 52,250"/>
    <!-- Right thigh / calf -->
    <rect class="bodymap__outline" x="102" y="250" width="46" height="78" rx="3"/>
    <rect class="bodymap__outline" x="102" y="330" width="46" height="62" rx="3"/>
    <!-- Left thigh / calf -->
    <rect class="bodymap__outline" x="52" y="250" width="46" height="78" rx="3"/>
    <rect class="bodymap__outline" x="52" y="330" width="46" height="62" rx="3"/>
  `;

  // ---------- FRONT VIEW MUSCLES ----------
  const FRONT_SVG = `
  <svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" aria-label="Front body view">
    ${WIREFRAME}

    <!-- Neck -->
    <rect class="bodymap__muscle" data-muscle="Sternocleidomastoid" data-side="L"
      x="92" y="59" width="7" height="10" rx="1"/>
    <rect class="bodymap__muscle" data-muscle="Sternocleidomastoid" data-side="R"
      x="101" y="59" width="7" height="10" rx="1"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Capitis Anterior" data-side="L" data-deep="true"
      x="93" y="52" width="6" height="5"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Capitis Anterior" data-side="R" data-deep="true"
      x="101" y="52" width="6" height="5"/>

    <!-- Upper Trapezius (front aspect — slope from neck out to shoulder) -->
    <polygon class="bodymap__muscle" data-muscle="Upper Trapezius" data-side="L"
      points="90,70 64,70 74,78 90,76"/>
    <polygon class="bodymap__muscle" data-muscle="Upper Trapezius" data-side="R"
      points="110,70 136,70 126,78 110,76"/>

    <!-- Deltoids (top + lateral on each upper arm) -->
    <rect class="bodymap__muscle" data-muscle="Middle Deltoid" data-side="L"
      x="33" y="73" width="20" height="13" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Middle Deltoid" data-side="R"
      x="147" y="73" width="20" height="13" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Lateral Deltoid" data-side="L"
      x="33" y="88" width="20" height="22" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Lateral Deltoid" data-side="R"
      x="147" y="88" width="20" height="22" rx="2"/>

    <!-- Pectorals (fill upper torso, sternum to armpit) -->
    <polygon class="bodymap__muscle" data-muscle="Pectoralis Major" data-side="L"
      points="98,72 60,72 56,98 60,114 98,112"/>
    <polygon class="bodymap__muscle" data-muscle="Pectoralis Major" data-side="R"
      points="102,72 140,72 144,98 140,114 102,112"/>

    <!-- Biceps (lower portion of upper arm) -->
    <rect class="bodymap__muscle" data-muscle="Biceps Brachii" data-side="L"
      x="35" y="112" width="16" height="32" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Biceps Brachii" data-side="R"
      x="149" y="112" width="16" height="32" rx="2"/>

    <!-- 6-pack abs (3 segments per side, central torso) -->
    <rect class="bodymap__muscle" data-muscle="Rectus Abdominis" data-side="L" x="84" y="120" width="15" height="18"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Abdominis" data-side="L" x="84" y="140" width="15" height="18"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Abdominis" data-side="L" x="84" y="160" width="15" height="20"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Abdominis" data-side="R" x="101" y="120" width="15" height="18"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Abdominis" data-side="R" x="101" y="140" width="15" height="18"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Abdominis" data-side="R" x="101" y="160" width="15" height="20"/>

    <!-- Obliques (lateral abs band) -->
    <polygon class="bodymap__muscle" data-muscle="External Oblique" data-side="L"
      points="60,120 82,124 82,182 64,182 56,150"/>
    <polygon class="bodymap__muscle" data-muscle="External Oblique" data-side="R"
      points="140,120 118,124 118,182 136,182 144,150"/>
    <polygon class="bodymap__muscle" data-muscle="Internal Oblique" data-side="L"
      points="74,148 82,150 80,180 72,178"/>
    <polygon class="bodymap__muscle" data-muscle="Internal Oblique" data-side="R"
      points="126,148 118,150 120,180 128,178"/>

    <!-- Iliopsoas (within hip region) -->
    <rect class="bodymap__muscle" data-muscle="Iliopsoas" data-side="L"
      x="78" y="218" width="20" height="24" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Iliopsoas" data-side="R"
      x="102" y="218" width="20" height="24" rx="2"/>

    <!-- Quads (3 columns + diagonal Sartorius) -->
    <rect class="bodymap__muscle" data-muscle="Vastus Lateralis" data-side="L"
      x="54" y="258" width="12" height="68" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Vastus Lateralis" data-side="R"
      x="134" y="258" width="12" height="68" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Femoris" data-side="L"
      x="68" y="258" width="14" height="68" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Rectus Femoris" data-side="R"
      x="118" y="258" width="14" height="68" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Vastus Medialis" data-side="L"
      x="84" y="298" width="14" height="28" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Vastus Medialis" data-side="R"
      x="102" y="298" width="14" height="28" rx="2"/>
    <!-- Sartorius drawn last so it overlays the other quads -->
    <polygon class="bodymap__muscle" data-muscle="Sartorius" data-side="L"
      points="54,258 64,258 88,326 78,326"/>
    <polygon class="bodymap__muscle" data-muscle="Sartorius" data-side="R"
      points="146,258 136,258 112,326 122,326"/>
  </svg>
  `;

  // ---------- BACK VIEW MUSCLES ----------
  const BACK_SVG = `
  <svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" aria-label="Back body view">
    ${WIREFRAME}

    <!-- Upper Trapezius (kite from neck to mid back) -->
    <polygon class="bodymap__muscle" data-muscle="Upper Trapezius" data-side="L"
      points="100,72 70,76 58,100 72,130 100,128"/>
    <polygon class="bodymap__muscle" data-muscle="Upper Trapezius" data-side="R"
      points="100,72 130,76 142,100 128,130 100,128"/>

    <!-- Posterior Deltoid (rear shoulder cap) -->
    <rect class="bodymap__muscle" data-muscle="Posterior Deltoid" data-side="L"
      x="33" y="88" width="20" height="22" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Posterior Deltoid" data-side="R"
      x="147" y="88" width="20" height="22" rx="2"/>

    <!-- Latissimus Dorsi (mid back wings, split into upper & lower halves) -->
    <polygon class="bodymap__muscle" data-muscle="Latissimus Dorsi" data-side="L"
      points="60,132 98,132 98,166 64,166 56,150"/>
    <polygon class="bodymap__muscle" data-muscle="Latissimus Dorsi" data-side="L"
      points="64,170 98,170 98,206 68,206 60,186"/>
    <polygon class="bodymap__muscle" data-muscle="Latissimus Dorsi" data-side="R"
      points="140,132 102,132 102,166 136,166 144,150"/>
    <polygon class="bodymap__muscle" data-muscle="Latissimus Dorsi" data-side="R"
      points="136,170 102,170 102,206 132,206 140,186"/>

    <!-- Glutes -->
    <polygon class="bodymap__muscle" data-muscle="Gluteus Medius" data-side="L"
      points="56,213 80,213 82,232 56,232"/>
    <polygon class="bodymap__muscle" data-muscle="Gluteus Medius" data-side="R"
      points="144,213 120,213 118,232 144,232"/>
    <rect class="bodymap__muscle" data-muscle="Gluteus Minimus" data-side="L" data-deep="true"
      x="64" y="218" width="14" height="10"/>
    <rect class="bodymap__muscle" data-muscle="Gluteus Minimus" data-side="R" data-deep="true"
      x="122" y="218" width="14" height="10"/>
    <polygon class="bodymap__muscle" data-muscle="Gluteus Maximus" data-side="L"
      points="54,234 98,234 98,266 70,272 52,258"/>
    <polygon class="bodymap__muscle" data-muscle="Gluteus Maximus" data-side="R"
      points="146,234 102,234 102,266 130,272 148,258"/>
    <rect class="bodymap__muscle" data-muscle="Piriformis" data-side="L" data-deep="true"
      x="66" y="246" width="14" height="10"/>
    <rect class="bodymap__muscle" data-muscle="Piriformis" data-side="R" data-deep="true"
      x="120" y="246" width="14" height="10"/>

    <!-- Hamstrings (back of thigh) -->
    <rect class="bodymap__muscle" data-muscle="Biceps Femoris" data-side="L"
      x="54" y="278" width="44" height="48" rx="2"/>
    <rect class="bodymap__muscle" data-muscle="Biceps Femoris" data-side="R"
      x="102" y="278" width="44" height="48" rx="2"/>
  </svg>
  `;

  // ---------- Painting (data → CSS classes) ----------
  function sideMatches(flag, side) {
    if (!flag) return false;
    if (flag === 'B') return true;
    return flag === side;
  }

  function paintSVG(svgEl, myo, ten) {
    svgEl.querySelectorAll('.bodymap__muscle').forEach(p => {
      const m = p.getAttribute('data-muscle');
      const side = p.getAttribute('data-side');
      const myoFlag = myo[m];
      const tenFlag = ten[m];
      const myoMatch = sideMatches(myoFlag, side);
      const tenMatch = sideMatches(tenFlag, side);
      p.classList.remove('bodymap__muscle--weak', 'bodymap__muscle--tight', 'bodymap__muscle--both', 'is-flagged');
      let cls = null;
      if (myoMatch && tenMatch) cls = 'bodymap__muscle--both';
      else if (myoMatch)        cls = 'bodymap__muscle--weak';
      else if (tenMatch)        cls = 'bodymap__muscle--tight';
      if (cls) {
        p.classList.add(cls);
        p.classList.add('is-flagged');
      }
      const labelParts = [];
      if (myoFlag) labelParts.push(`Weakness (${myoFlag})`);
      if (tenFlag) labelParts.push(`Tension (${tenFlag})`);
      const tip = labelParts.length ? `${m} — ${labelParts.join(' · ')}` : m;
      let title = p.querySelector('title');
      if (!title) {
        title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        p.appendChild(title);
      }
      title.textContent = tip;
    });
  }

  function renderMuscleList(myo, ten) {
    const sideText = c => c === 'L' ? 'Left' : c === 'R' ? 'Right' : 'Both';
    const comp = Object.keys(myo).filter(k => ten[k]).map(k => ({ name: k, weak: myo[k], tight: ten[k] }));

    if (Object.keys(myo).length === 0 && Object.keys(ten).length === 0) {
      return `<div class="empty-state" style="padding: 20px;">No muscle flags from the latest assessment.</div>`;
    }

    const card = (title, subtitle, items, accent, extra = '') => `
      <div class="bm-card">
        <div class="bm-card__head">
          <span class="bm-card__dot" style="background:${accent}"></span>
          <div>
            <div class="bm-card__title">${title}</div>
            <div class="bm-card__sub">${subtitle}</div>
          </div>
          <span class="bm-card__count">${items.length}</span>
        </div>
        ${items.length ? `<ul class="bm-card__list">${items}</ul>` : '<div class="bm-card__empty">None flagged</div>'}
        ${extra}
      </div>
    `;

    const myoItems = Object.entries(myo).map(([m, c]) =>
      `<li><span>${m}</span><span class="lat-code">${c} · ${sideText(c)}</span></li>`).join('');
    const tenItems = Object.entries(ten).map(([m, c]) =>
      `<li><span>${m}</span><span class="lat-code">${c} · ${sideText(c)}</span></li>`).join('');
    const compItems = comp.map(c =>
      `<li><span>${c.name}</span><span><span class="lat-code">W:${c.weak}</span> <span class="lat-code">T:${c.tight}</span></span></li>`).join('');

    return `
      <div class="bm-cards">
        ${card('Myodynamia Deficiency', 'Weakness', myoItems, 'var(--flag-weak)')}
        ${card('Muscle Tension', 'Over-activation', tenItems, 'var(--flag-tight)')}
        ${card('Compensation Pattern', 'Weak + Tight in same muscle', compItems, 'var(--flag-both)',
          comp.length ? '<div class="bm-card__hint">These muscles likely indicate one side compensating for the other — clinically the most significant findings.</div>' : ''
        )}
      </div>
    `;
  }

  function render(rootEl, athlete) {
    const myo = athlete.myodynamia || {};
    const ten = athlete.tension || {};
    const total = Object.keys(myo).length + Object.keys(ten).length;

    rootEl.innerHTML = `
      <div class="bm-shell">
        <div class="bm-figures">
          <div class="bm-fig">
            <div class="bm-fig__title">Front</div>
            ${FRONT_SVG}
          </div>
          <div class="bm-fig">
            <div class="bm-fig__title">Back</div>
            ${BACK_SVG}
          </div>
        </div>

        <div class="bm-strip">
          <div class="bm-summary">
            <div class="bm-summary__num">${total}</div>
            <div class="bm-summary__label">Muscle ${total === 1 ? 'flag' : 'flags'}</div>
          </div>
          <div class="bm-legend">
            <span><i class="weak"></i><span>Weakness <em>(Myodynamia)</em></span></span>
            <span><i class="tight"></i><span>Tension <em>(Over-activation)</em></span></span>
            <span><i class="both"></i><span>Both <em>(Compensation pattern)</em></span></span>
            <span class="bm-legend__note">L · Left  ·  R · Right  ·  B · Both sides</span>
          </div>
        </div>
      </div>

      ${renderMuscleList(myo, ten)}
    `;

    rootEl.querySelectorAll('svg').forEach(svg => paintSVG(svg, myo, ten));
  }

  window.AIRMS_BODYMAP = { render };
})();
