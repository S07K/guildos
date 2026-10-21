export type TaskWait = { reason:'daily_limit'; resetsAt:string; serverNow:string };
/** Generation reservations use a UTC calendar day, consistently in API and worker clients. */
export function dailyLimitWait(limit:{day:string;attempts:number}|null|undefined, now=new Date()):TaskWait|null {
 if(!limit||limit.day!==now.toISOString().slice(0,10)||limit.attempts<30)return null;
 return {reason:'daily_limit',resetsAt:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString(),serverNow:now.toISOString()};
}
export function resetCountdown(resetsAt:string, now:number) {
 const minutes=Math.max(0,Math.ceil((Date.parse(resetsAt)-now)/60000));
 if(!Number.isFinite(minutes))return '';
 if(!minutes)return 'now';
 const hours=Math.floor(minutes/60),remainder=minutes%60;
 return hours?`${hours}h${remainder?` ${remainder}m`:''}`:`${minutes}m`;
}
