import type { CSSProperties } from 'react';

const cursor = [
  '1000000000', '1100000000', '1110000000', '1111000000',
  '1111100000', '1111110000', '1111111000', '1111111100',
  '1111111110', '1111110000', '1100110000', '1000011000', '0000011000',
];

/** SVG pixels gather into a design cursor, hold, then gently disperse. */
export function PixelFormation() {
  return <div className="pixel-formation" data-animation-scene aria-hidden="true">
    <svg viewBox="0 0 240 190" fill="none" focusable="false">
      <path d="M65 40v-8h8m96 0h8v8M65 150v8h8m96 0h8v-8" stroke="#d6dee5" strokeWidth="1" />
      <g transform="translate(82 42)">
        {cursor.flatMap((row, y) => [...row].flatMap((cell, x) => {
          if (cell === '0') return [];
          const seed = y * 11 + x;
          const style = {
            '--pixel-x': `${((seed * 17) % 93) - 46}px`,
            '--pixel-y': `${((seed * 29) % 71) - 35}px`,
            '--pixel-delay': `${(seed % 9) * -0.09}s`,
          } as CSSProperties;
          return <rect key={seed} className="forming-pixel" x={x * 8} y={y * 8} width="6.5" height="6.5" rx=".7" fill={seed % 11 === 0 ? '#9aacba' : '#718ba5'} style={style} />;
        }))}
      </g>
      <rect className="pixel-accent" x="180" y="63" width="5" height="5" rx=".5" fill="#d1a18d" />
      <rect className="pixel-accent pixel-accent-late" x="51" y="117" width="4" height="4" rx=".5" fill="#9bad9c" />
    </svg>
  </div>;
}
