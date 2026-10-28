import { normalizeIconName } from './icon-names.ts';

/** Small semantic UI dictionary shared by validation and model context. */
export const uiIconNames=['Search','MapPin','ShoppingCart','ShoppingBag','Heart','Star','ChevronLeft','SlidersHorizontal','House','UserRound','Menu','Settings','Bell','Plus','Minus','Check','X','ArrowRight','ChevronRight','ChevronDown','ChevronUp','Clock','CalendarDays','Mail','Phone','Camera','Image','Upload','Download','Trash2','Pencil','CreditCard','Wallet','Package','Truck','Utensils','Coffee','CircleHelp','Info','CircleAlert','LockKeyhole','Eye','EyeOff','Share2','ExternalLink','Bookmark','Send','MessageCircle','Mic','LayoutGrid','List','CheckCircle2'] as const;
export const uiIconSemantics={search:'Search',location:'MapPin',cart:['ShoppingCart','ShoppingBag'],favorite:'Heart',rating:'Star',back:'ChevronLeft',filter:'SlidersHorizontal'} as const;
export function normalizeUiIconName(value:unknown):typeof uiIconNames[number]|undefined {
 if(typeof value!=='string')return undefined;
 const alias=value.trim().toLowerCase();
 const name=alias==='bag'?'ShoppingBag':alias==='sliders'?'SlidersHorizontal':normalizeIconName(value);
 return uiIconNames.includes(name as typeof uiIconNames[number])?name as typeof uiIconNames[number]:undefined;
}
export function semanticIconIssue(icon:string,label:string):string|undefined {
 const rules:[RegExp,readonly string[]][]=[
  [/\b(search|searchbar)\b/i,['Search']], [/\b(address|location|delivery address)\b/i,['MapPin']],
  [/\b(cart|basket|shopping bag)\b/i,['ShoppingCart','ShoppingBag']], [/\b(favou?rites?|wishlist)\b/i,['Heart']],
  [/\b(ratings?|reviews? score)\b/i,['Star']], [/\b(back|go back|navigate back)\b/i,['ChevronLeft']], [/\b(filters?|filter controls)\b/i,['SlidersHorizontal']],
 ];
 const rule=rules.find(([pattern])=>pattern.test(label));
 return rule&&!rule[1].includes(icon)?`Consider ${rule[1].join(' or ')} if this icon represents “${label.match(rule[0])?.[0]}”.`:undefined;
}
