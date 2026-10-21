import { iconLicense, searchIcons } from '@/lib/studio/icon-library';

export async function GET(request:Request) {
 const params=new URL(request.url).searchParams;
 const query=(params.get('query')||'').slice(0,80);
 const limit=Math.min(60,Math.max(1,Number(params.get('limit'))||32));
 return Response.json({icons:searchIcons(query,limit),source:iconLicense},{headers:{'Cache-Control':'public, max-age=3600'}});
}
