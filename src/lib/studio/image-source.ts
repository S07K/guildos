export type UnsplashPhoto = {id:string;imageUrl:string;alt:string;photographer:string;profileUrl:string;photoUrl:string};
export function isUnsplashImageUrl(value:unknown):value is string {
 if(typeof value!=='string'||value.length>2000)return false;
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='images.unsplash.com'&&!url.port&&!url.username&&!url.password&&!url.hash&&/^\/photo-[A-Za-z0-9-]+$/.test(url.pathname);}catch{return false;}
}
const unsplashLink=(value:unknown,path:RegExp)=>{
 if(typeof value!=='string'||value.length>2000)return false;
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='unsplash.com'&&!url.port&&!url.username&&!url.password&&!url.hash&&path.test(url.pathname);}catch{return false;}
};
export function isUnsplashPhoto(value:unknown):value is UnsplashPhoto {
 if(!value||typeof value!=='object')return false;
 const photo=value as UnsplashPhoto;
 return typeof photo.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(photo.id)&&isUnsplashImageUrl(photo.imageUrl)&&typeof photo.alt==='string'&&photo.alt.length<=500&&typeof photo.photographer==='string'&&photo.photographer.length>0&&photo.photographer.length<=200&&unsplashLink(photo.profileUrl,/^\/@[A-Za-z0-9_.-]+\/?$/)&&unsplashLink(photo.photoUrl,/^\/photos\/[A-Za-z0-9_-]+\/?$/);
}
