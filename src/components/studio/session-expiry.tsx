'use client';
import { useEffect } from 'react';
import { safeNextUrl } from '@/lib/auth/config';

/** Server-derived absolute deadline; refreshes and client clock changes never renew access. */
export function SessionExpiry({expiresAt,serverNow}:{expiresAt:number;serverNow:number}) {
 useEffect(()=>{
  const started=performance.now();
  const remaining=expiresAt-serverNow;
  const expire=()=>{
   const next=safeNextUrl(window.location.pathname+window.location.search);
   window.location.replace(`/signin?reason=expired&next=${encodeURIComponent(next)}`);
  };
  const check=()=>{if(performance.now()-started>=remaining||Date.now()>=expiresAt)expire();};
  const timer=setTimeout(expire,Math.max(0,remaining));
  window.addEventListener('focus',check);window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',check);
  return ()=>{clearTimeout(timer);window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);document.removeEventListener('visibilitychange',check);};
 },[expiresAt,serverNow]);
 return null;
}
