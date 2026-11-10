'use client';

import { useState } from 'react';

const minLength = 20;
const maxLength = 2000;

/** Landing-page brief box: the submit button stays disabled until the brief is usable. */
export function HeroBriefForm() {
  const [brief, setBrief] = useState('');
  const length = brief.trim().length;
  const ready = length >= minLength && length <= maxLength;
  const hint = length === 0
    ? 'Free trial · no API key or card'
    : length < minLength
      ? `${minLength - length} more character${minLength - length === 1 ? '' : 's'} to go`
      : 'Ready when you are';

  return (
    <form
      className="hero-brief"
      action="/studio/projects/new"
      method="get"
      noValidate
      data-motion="hero"
      data-delay="300"
      onSubmit={event => { if (!ready) event.preventDefault(); }}
    >
      <label htmlFor="hero-brief-input" className="sr-only">Describe what you are building</label>
      <textarea
        id="hero-brief-input"
        name="brief"
        rows={2}
        maxLength={maxLength}
        value={brief}
        onChange={event => setBrief(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ready) event.currentTarget.form?.requestSubmit();
        }}
        aria-describedby="hero-brief-hint"
        placeholder="Describe your product, e.g. a calm landing page for a budgeting app for freelancers"
      />
      <div className="hero-brief-bar">
        <span id="hero-brief-hint" className="hero-brief-hint" data-state={length === 0 ? 'idle' : ready ? 'ready' : 'short'} aria-live="polite">{hint}</span>
        <button type="submit" className="hero-brief-submit" disabled={!ready}>Start designing<span aria-hidden="true">→</span></button>
      </div>
    </form>
  );
}
