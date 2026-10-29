'use client';
import { useState, type FormEvent } from 'react';

export function WaitlistForm() {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'loading') return;
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email') || '');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address.'); setState('error'); return; }
    setState('loading'); setError('');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.get('email'), website: values.get('website') }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again shortly.');
      setState('success');
    } catch (error) {
      setError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Connection timed out. Please try again.');
      setState('error');
    }
  }
  return <div id="join" className="waitlist">
    {state === 'success' ? <div className="success" role="status" tabIndex={-1}>
      <span className="success-icon" aria-hidden="true">✓</span><div><strong>You’re on the list.</strong><p>We’ll email you when early access opens.</p></div>
    </div> : <form noValidate onSubmit={submit} aria-label="Join the GuildOS waitlist" aria-busy={state === 'loading'}>
      <label htmlFor="email" className="sr-only">Email address</label>
      <div className="email-row"><input id="email" name="email" type="email" autoComplete="email" placeholder="Your email address" required maxLength={254} aria-invalid={state === 'error'} aria-describedby="form-note form-error" disabled={state === 'loading'} onChange={() => { setError(''); setState('idle'); }} className={error ? 'border-red-500 focus:ring-red-500/20 bg-red-50/10 placeholder:text-red-400' : ''} />
      <button type="submit" disabled={state === 'loading'}>{state === 'loading' ? 'Joining…' : 'Join the waitlist'}</button></div>
      <div className="honeypot" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <p id="form-error" className="form-error" role="alert">{error}</p>
    </form>}
    <p id="form-note" className="form-note">Early access. No noise. Just your invitation.<br />By joining, you agree to receive GuildOS launch updates.</p>
  </div>;
}
