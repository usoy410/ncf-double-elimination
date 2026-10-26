// Measure the rendered cards so lines remain attached after wrapping and resizing.
(function () {
  const ns = 'http://www.w3.org/2000/svg';
  function draw(container) {
    container.querySelector('.bracket-connectors')?.remove();
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('bracket-connectors');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', bounds.width);
    svg.setAttribute('height', bounds.height);
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const cards = new Map(Array.from(container.querySelectorAll('[data-match]'), el => [Number(el.dataset.match), el]));
    function connect(from, to, conditional = false) {
      const a = cards.get(from)?.getBoundingClientRect();
      const b = cards.get(to)?.getBoundingClientRect();
      if (!a || !b || b.left <= a.right) return;
      const x1 = a.right - bounds.left, y1 = a.top + a.height / 2 - bounds.top;
      const x2 = b.left - bounds.left, y2 = b.top + b.height / 2 - bounds.top;
      const mid = (x1 + x2) / 2;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
      path.dataset.from = from;
      path.dataset.to = to;
      if (conditional) path.setAttribute('stroke-dasharray', '4 4');
      svg.append(path);
    }
    for (const [id] of cards) {
      // The reset repeats the finalists, but is triggered by the first final.
      if (id === 14) { connect(13, 14, true); continue; }
      for (const source of Bracket.specs[id].sources) {
        if (source.match !== undefined && cards.has(source.match)) connect(source.match, id);
      }
    }
    container.prepend(svg);
  }
  window.drawBracketConnectors = () => document.querySelectorAll('.bracket-grid, .print-bracket').forEach(draw);
  let frame;
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(window.drawBracketConnectors); };
  window.addEventListener('resize', schedule);
  window.addEventListener('beforeprint', window.drawBracketConnectors);
  window.addEventListener('afterprint', schedule);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(document.querySelector('#board'));
  document.fonts?.ready.then(schedule);
})();
