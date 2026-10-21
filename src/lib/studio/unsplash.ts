import { isUnsplashPhoto, type UnsplashPhoto } from './image-source.ts';
export const unsplashSearchTool = {name:'search_unsplash',description:'Find relevant photographic imagery using a specific subject query. Returns stable Unsplash CDN URLs and attribution. Use an exact returned imageUrl on an image node.',inputSchema:{type:'object',additionalProperties:false,properties:{query:{type:'string',minLength:2,maxLength:100}},required:['query']}} as const;
export const unsplashConfigured=()=>Boolean(process.env.UNSPLASH_ACCESS_KEY?.trim());
export class ImageConnectorError extends Error {}
async function api(path:string,request:typeof fetch,signal?:AbortSignal) {
 const key=process.env.UNSPLASH_ACCESS_KEY?.trim();if(!key)throw new ImageConnectorError('Unsplash image search needs UNSPLASH_ACCESS_KEY on the server.');
 const response=await request(`https://api.unsplash.com${path}`,{headers:{Authorization:`Client-ID ${key}`,'Accept-Version':'v1'},redirect:'error',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(12000),...(signal?[signal]:[])])});
 if(!response.ok)throw new ImageConnectorError(response.status===429||response.status===403?'Unsplash image search is temporarily rate limited. Retry later.':'Unsplash image search is unavailable. Check the connector configuration.');
 return response.json();
}
const referral=(value:string)=>{const url=new URL(value);url.searchParams.set('utm_source','guildos');url.searchParams.set('utm_medium','referral');return url.toString();};
export async function searchUnsplash(query:string,request:typeof fetch=fetch,signal?:AbortSignal):Promise<UnsplashPhoto[]> {
 const clean=query.trim();if(clean.length<2||clean.length>100)throw new ImageConnectorError('Use an Unsplash search query between 2 and 100 characters.');
 const data=await api(`/search/photos?${new URLSearchParams({query:clean,per_page:'4',orientation:'landscape',content_filter:'high'})}`,request,signal);
 if(!Array.isArray(data.results))throw new ImageConnectorError('Unsplash returned an invalid search response.');
 return data.results.slice(0,4).flatMap((photo:any)=>{
  try {
   const result={id:photo.id,imageUrl:photo.urls.regular,alt:String(photo.alt_description||photo.description||clean).slice(0,500),photographer:photo.user.name,profileUrl:referral(photo.user.links.html),photoUrl:referral(photo.links.html)};
   return isUnsplashPhoto(result)?[result]:[];
  }catch{return [];}
 });
}
/** Record selection, using the API's photo ID, never a model-supplied fetch URL. */
export async function trackUnsplashSelection(photo:UnsplashPhoto,request:typeof fetch=fetch,signal?:AbortSignal) {
 if(!isUnsplashPhoto(photo))throw new ImageConnectorError('Invalid Unsplash selection.');
 await api(`/photos/${encodeURIComponent(photo.id)}/download`,request,signal);
}
