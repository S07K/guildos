import { normalizeIconName } from './icon-names.ts';
import * as icons from 'lucide-static';

const iconMap = icons as Record<string, string>;
const names = Object.keys(iconMap).sort();
const hexColor = /^#[0-9a-f]{6}$/i;
const featured = ['House','Search','Mic','Menu','UserRound','Settings','Bell','Heart','Star','Plus','Minus','Check','X','ArrowRight','ArrowLeft','ChevronRight','ChevronDown','ShoppingCart','ShoppingBag','MapPin','Clock','CalendarDays','Mail','Phone','Camera','Image','Upload','Download','Trash2','Pencil','Filter','SlidersHorizontal','CreditCard','Wallet','Package','Truck','Utensils','Coffee','CircleHelp','Info','CircleAlert','LockKeyhole','Eye','Share2','ExternalLink','Sparkles','LayoutGrid','List','Bookmark','Send','MessageCircle'].filter(name => name in iconMap);

export function isKnownIcon(name:unknown):name is string {
 return normalizeIconName(name)!==undefined;
}

export function searchIcons(query:string,limit=32):string[] {
 const safeLimit=Math.max(1,Math.min(60,Math.floor(limit)||32));
 const terms=query.toLowerCase().trim().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(Boolean).slice(0,5);
 if(!terms.length) return featured.slice(0,safeLimit);
 return names.map(name=>{
  const words=name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase();
  const joined=words.replace(/\s/g,'');
  if(!terms.every(term=>words.includes(term)||joined.includes(term))) return null;
  const exact=words===terms.join(' ')||joined===terms.join('');
  const starts=words.startsWith(terms[0]);
  return {name,score:(exact?100:0)+(starts?20:0)+(featured.includes(name)?10:0)-name.length/100};
 }).filter((item):item is {name:string;score:number}=>!!item).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,safeLimit).map(item=>item.name);
}

export function suggestIcons(instruction:string,brief:string) {
 const words=`${instruction} ${brief}`.toLowerCase().match(/[a-z]{3,}/g)||[];
 const matches=[...new Set(words)].slice(0,24).flatMap(word=>searchIcons(word,3));
 return [...new Set([...matches,...featured])].slice(0,80);
}

export function renderIconSvg(name:string,color='#202b38',strokeWidth=2) {
 if(!isKnownIcon(name)||!hexColor.test(color)||!Number.isFinite(strokeWidth)||strokeWidth<0.5||strokeWidth>4) throw new Error('Invalid icon request.');
 return iconMap[normalizeIconName(name)!].replaceAll('currentColor',color).replace('stroke-width="2"',`stroke-width="${strokeWidth}"`);
}

export const iconLicense = {name:'Lucide',license:'ISC',url:'https://lucide.dev/license'};
