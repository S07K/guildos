/** A wire sculpture: individual paths forming one shared creative loop. */
function loopContour(index: number) {
  const angle = index * Math.PI * 2 / 40;
  return Array.from({ length: 65 }, (_, point) => {
    const turn = point * Math.PI * 2 / 64;
    const radius = 109 + 43 * Math.cos(turn);
    const x = 440 + radius * Math.cos(angle);
    const y = 148 + radius * Math.sin(angle) * .5 + 43 * Math.sin(turn) * .86;
    return `${point ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + 'Z';
}

export function HeroBackdrop() {
  return <div className="creative-loop" data-animation-scene aria-hidden="true">
    <svg viewBox="245 0 390 296" fill="none" focusable="false">
      <g className="loop-sculpture" stroke="#718ba5" strokeWidth=".8">{Array.from({ length: 40 }, (_, index) => <path key={index} d={loopContour(index)} />)}</g>
    </svg>
  </div>;
}
