/* ===========================================================
   Icon library — line-style SVGs, stroke=currentColor
   Usage: Icons.render('flask', {class:'x'}) -> svg markup string
   =========================================================== */

const Icons = (() => {
  const paths = {
    dashboard: '<path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z"/>',
    patients: '<path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M3 21c0-3.9 2.7-6 6-6s6 2.1 6 6"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M21 21c0-3-1.7-4.8-4-5.4"/>',
    visits: '<path d="M8 3v3M16 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/><path d="M9 13l1.6 1.6L15 10.5"/>',
    stethoscope: '<path d="M5 4v6a4 4 0 0 0 8 0V4"/><path d="M9 15v1a5 5 0 0 0 10 0v-2.5"/><circle cx="19" cy="10.5" r="2"/><path d="M5 4H4M9 4H8"/>',
    employees: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3.6 2.6-5.6 5.5-5.6s5.5 2 5.5 5.6"/><path d="M16.5 4.5a3.2 3.2 0 0 1 0 6.4"/><path d="M20.5 20c0-2.8-1.7-4.6-3.8-5.3"/>',
    admissions: '<path d="M3 19V6a1 1 0 0 1 1-1h2v14"/><path d="M3 13h18"/><path d="M6 19V9h9a3 3 0 0 1 3 3v7"/><circle cx="8.5" cy="7" r="1.4"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v6.2L4.8 18a1.6 1.6 0 0 0 1.4 2.4h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3"/><path d="M7.5 14.5h9"/>',
    pill: '<rect x="3.5" y="9.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 13)"/><path d="M8.5 8.5l6 6"/>',
    referrals: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16.5h4"/>',
    reports: '<path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 13v4M12.5 10.5V17M16 14.5V17"/>',
    users: '<circle cx="8.5" cy="7.5" r="3"/><circle cx="16" cy="8.5" r="2.4"/><path d="M2.5 20c0-3.3 2.5-5.3 6-5.3s6 2 6 5.3"/><path d="M15 15c2.6.2 4.5 1.9 4.5 5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.5 7.5 0 0 0 0-3l1.9-1.3-2-3.4-2.2.8a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.2-.8-2 3.4L4.6 10.5a7.5 7.5 0 0 0 0 3L2.7 14.8l2 3.4 2.2-.8c.75.66 1.63 1.17 2.6 1.5l.5 2.6h4l.5-2.6a7.6 7.6 0 0 0 2.6-1.5l2.2.8 2-3.4z"/>',
    backup: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6"/><path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6"/>',
    logout: '<path d="M13 15v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v2"/><path d="M9 12h11M17 8l3 4-3 4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12.5 5.5l4 4L7 19H3v-4z"/><path d="M16 4l4 4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
    trash: '<path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    check: '<path d="M4 12.5l5.5 5.5L20 6"/>',
    alert: '<path d="M12 2.5L1.8 20.5h20.4z"/><path d="M12 9.5v5M12 17.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5h.01"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/>',
    filecheck: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M9.5 14l1.7 1.7L16 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    shield: '<path d="M12 2.5l8 3v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10v-6z"/><path d="M8.5 12l2.4 2.4L15.5 9.5"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/><path d="M10 21v-4h4v4"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };

  function render(name, opts = {}) {
    const cls = opts.class ? ` class="${opts.class}"` : '';
    const strokeWidth = opts.strokeWidth || 2;
    const inner = paths[name] || paths.info;
    return `<svg${cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  return { render, names: Object.keys(paths) };
})();
