const text = { type: 'string' };
export const designSchema = {
 type: 'object', additionalProperties: false,
 properties: {
  brand: text, eyebrow: text, headline: text, description: text, cta: text,
  style: { type: 'string', enum: ['editorial', 'bold', 'minimal'] },
  palette: { type: 'string', enum: ['ocean', 'moss', 'clay', 'midnight'] },
  sectionOrder: { type: 'array', minItems: 3, maxItems: 3, enum: [['hero', 'features', 'closing']], items: { type: 'string', enum: ['hero', 'features', 'closing'] } },
  features: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { title: text, description: text }, required: ['title', 'description'] } },
  closingTitle: text, closingDescription: text, designNotes: text,
 },
 required: ['brand', 'eyebrow', 'headline', 'description', 'cta', 'style', 'palette', 'features', 'closingTitle', 'closingDescription', 'designNotes', 'sectionOrder'],
};
export function validateDesign(value) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The design was incomplete. Please try again.');
 for (const key of ['brand', 'eyebrow', 'headline', 'description', 'cta', 'closingTitle', 'closingDescription', 'designNotes']) {
  if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 2000) throw new Error('The design contained invalid copy. Please try again.');
 }
 if (!['editorial','bold','minimal'].includes(value.style) || !['ocean','moss','clay','midnight'].includes(value.palette)) throw new Error('The design theme was invalid.');
 if (!Array.isArray(value.features) || value.features.length < 3 || value.features.length > 6 || value.features.some(f => !f || typeof f.title !== 'string' || !f.title.trim() || f.title.length > 200 || typeof f.description !== 'string' || !f.description.trim() || f.description.length > 2000)) throw new Error('The design sections were incomplete.');
 if (value.sectionOrder !== undefined && (!Array.isArray(value.sectionOrder) || value.sectionOrder.length !== 3 || new Set(value.sectionOrder).size !== 3 || value.sectionOrder.some(section => !['hero','features','closing'].includes(section)))) throw new Error('The design section order was invalid.');
 return value;
}
export function validDestination(value) {
 try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && value.length <= 2048; } catch { return false; }
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
export function renderDesign(document, destination) {
 const d = validateDesign(document);
 if (destination != null && !validDestination(destination)) throw new Error('Use a valid HTTPS destination.');
 const themes = { ocean: ['#f4f6f5','#203b47','#335e70'], moss: ['#f4f4ec','#283f31','#3b6048'], clay: ['#fbf4ef','#452b25','#884331'], midnight: ['#17242b','#f4f0e6','#b8dacb'] };
 const [paper, ink, accent] = themes[d.palette];
 const buttonInk = d.palette === 'midnight' ? '#17242b' : '#ffffff';
 const font = d.style === 'editorial' ? 'Georgia,serif' : 'system-ui,sans-serif';
 const align = d.style === 'bold' ? 'left' : 'center';
 const action = destination == null
  ? '<button class="button" type="button" disabled>'+escape(d.cta)+'</button>'
  : '<a class="button" href="'+escape(destination)+'" rel="noopener noreferrer">'+escape(d.cta)+'</a>';
 const sectionMarkup = {
  hero: '<section class="hero"><span class="eyebrow">'+escape(d.eyebrow)+'</span><h1>'+escape(d.headline)+'</h1><p>'+escape(d.description)+'</p>'+action+'</section>',
  features: '<section id="details" class="features" aria-label="Benefits">'+d.features.map((f,i)=>'<article><span>0'+(i+1)+'</span><h3>'+escape(f.title)+'</h3><p>'+escape(f.description)+'</p></article>').join('')+'</section>',
  closing: '<section class="closing"><h2>'+escape(d.closingTitle)+'</h2><p>'+escape(d.closingDescription)+'</p>'+action+'</section>',
 };
 const mainMarkup = (d.sectionOrder || ['hero','features','closing']).map(section => sectionMarkup[section]).join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>' + escape(d.brand) + '</title><style>' +
 '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:'+paper+';color:'+ink+';font:17px/1.7 system-ui,sans-serif}a{color:inherit}header,main,footer{max-width:1160px;margin:auto;padding:28px 6%}header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid '+ink+'25}.brand{font-weight:700;letter-spacing:-.04em;font-size:23px}.hero{padding:100px 0 90px;text-align:'+align+'}.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:.16em;color:'+accent+'}h1,h2,h3{font-family:'+font+';line-height:1.1;letter-spacing:-.035em;text-wrap:balance}h1{font-size:clamp(44px,7vw,86px);font-weight:'+(d.style==='bold'?700:400)+';max-width:900px;margin:24px '+(align==='center'?'auto':'0')+'}h2{font-size:clamp(32px,4vw,50px);font-weight:400}h3{font-size:25px}p{max-width:680px}.hero p{margin:24px '+(align==='center'?'auto':'0')+'}.button{border:0;font:inherit;display:inline-block;background:'+accent+';color:'+buttonInk+';padding:14px 25px;border-radius:'+(d.style==='minimal'?'5px':'30px')+';text-decoration:none;font-weight:600;margin-top:12px}.features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:36px;padding:50px 0 80px;border-top:1px solid '+ink+'30}.features span{font-size:13px;color:'+accent+'}.features p{font-size:16px}.closing{padding:65px 0;text-align:'+align+';border-top:1px solid '+ink+'30}.closing p{margin:20px '+(align==='center'?'auto':'0')+'}footer{border-top:1px solid '+ink+'25;font-size:13px}a:focus-visible{outline:3px solid '+accent+';outline-offset:5px}@media(max-width:650px){.features{grid-template-columns:1fr;gap:20px}.hero{padding:60px 0}header{font-size:14px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}</style></head><body><header><span class="brand">'+escape(d.brand)+'</span><a href="#details">Discover</a></header><main>'+mainMarkup+'</main><footer>'+escape(d.brand)+'</footer></body></html>';
}
