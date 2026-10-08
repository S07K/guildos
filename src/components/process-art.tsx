type ProcessArtProps = { kind: 'brief' | 'create' | 'refine' };

export function ProcessArt({ kind }: ProcessArtProps) {
  return <div className={`process-art art-${kind}`} data-animation-scene aria-hidden="true">
    <svg viewBox="0 0 260 155" fill="none">
      {kind === 'brief' && <>
        <path d="M30 120h200" stroke="#e1e5e9" />
        <g transform="rotate(-7 130 78)"><rect x="71" y="26" width="119" height="103" rx="4" fill="#fff" stroke="#c3ced8" /><path d="M86 42h18" stroke="#819c87" strokeWidth="3" strokeLinecap="round" /><path d="M86 56h78m-78 8h59" stroke="#dae0e5" strokeWidth="2" />
        <path className="sketch-stroke" pathLength="1" d="M87 108C97 108 99 73 116 88S146 120 173 80" stroke="#526e91" strokeWidth="1.5" strokeLinecap="round" />
        <g stroke="#d69077"><path d="M86 109h27m34-30h27" /><circle cx="86" cy="109" r="2" fill="#fff" /><circle cx="174" cy="79" r="2" fill="#fff" /></g></g>
        <g className="art-cursor"><path d="m181 103 5 22 5-8 9-3z" fill="#526e91" stroke="#fff" strokeWidth="2" /><rect x="194" y="121" width="34" height="15" rx="3" fill="#e8eef4" /><text x="211" y="131" textAnchor="middle" fill="#526e91" fontSize="8" fontFamily="Arial">You</text></g>
      </>}
      {kind === 'create' && <>
        <circle cx="130" cy="78" r="52" stroke="#dce3e8" strokeDasharray="2 5" />
        <g className="petal-orbit" stroke="#718ba5" strokeWidth="1">{[0,60,120].map(angle => <ellipse key={angle} cx="130" cy="78" rx="25" ry="54" transform={`rotate(${angle} 130 78)`} />)}</g>
        <circle cx="130" cy="78" r="10" fill="#edf2f6" stroke="#9cb0c1" /><circle cx="130" cy="78" r="3" fill="#526e91" />
        <circle cx="85" cy="52" r="5" fill="#e8efe9" stroke="#8fa894" /><circle cx="175" cy="52" r="5" fill="#f8e9e2" stroke="#d69077" /><circle cx="130" cy="130" r="5" fill="#e8edf5" stroke="#8299b5" />
      </>}
      {kind === 'refine' && <>
        <g transform="rotate(5 130 78)"><rect x="65" y="31" width="139" height="101" rx="5" fill="#fff" stroke="#c3ced8" /><path d="M65 47h139" stroke="#dce3e8" /><circle cx="74" cy="39" r="1.5" fill="#b6c3ce" /><circle cx="80" cy="39" r="1.5" fill="#b6c3ce" /><rect x="77" y="58" width="114" height="29" rx="3" fill="#e9eef3" /><path d="M87 69h40m-40 8h28" stroke="#98adc0" strokeWidth="2" strokeLinecap="round" /><g className="layout-blocks"><rect x="77" y="95" width="33" height="24" rx="3" fill="#e8efe9" /><rect x="117" y="95" width="33" height="24" rx="3" fill="#f6eae4" /><rect x="157" y="95" width="33" height="24" rx="3" fill="#e8edf5" /></g></g>
        <circle cx="200" cy="119" r="13" fill="#fff" stroke="#a3b9a7" /><path className="approval-stroke" pathLength="1" d="m194 119 4 4 8-9" stroke="#6e9579" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>}
    </svg>
  </div>;
}
