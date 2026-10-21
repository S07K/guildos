import nextEnv from '@next/env';
import { searchUnsplash, ImageConnectorError } from '../src/lib/studio/unsplash.ts';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import { iconLicense, isKnownIcon, renderIconSvg, searchIcons } from '../src/lib/studio/icon-library.ts';

export function createIconMcpServer() {
 const server=new McpServer({name:'guildos-lucide-icons',version:'1.0.0'});
 server.registerTool('search_icons',{
  title:'Search free icons',description:'Search the ISC-licensed Lucide icon catalog. Use a returned name as properties.iconName on a GuildOS component icon layer.',
  inputSchema:z.object({query:z.string().max(80).default(''),limit:z.number().int().min(1).max(60).default(24)}),
  annotations:{readOnlyHint:true},
 },async({query,limit})=>({content:[{type:'text',text:JSON.stringify({icons:searchIcons(query,limit),source:iconLicense})}]}));
 server.registerTool('get_icon',{
  title:'Get free icon',description:'Get a Lucide SVG and the editable GuildOS canvas fields for an icon returned by search_icons.',
  inputSchema:z.object({name:z.string().max(80),color:z.string().regex(/^#[0-9a-f]{6}$/i).default('#202b38'),strokeWidth:z.number().min(0.5).max(4).default(2)}),
  annotations:{readOnlyHint:true},
 },async({name,color,strokeWidth})=>isKnownIcon(name)
  ? {content:[{type:'text',text:JSON.stringify({name,svg:renderIconSvg(name,color,strokeWidth),canvas:{type:'icon',layoutMode:'VERTICAL',primaryAxisSizingMode:'FIXED',counterAxisSizingMode:'FIXED',padding:0,itemSpacing:0,properties:{iconName:name,color,borderWidth:strokeWidth}},source:iconLicense})}]}
  : {isError:true,content:[{type:'text',text:'Unknown icon name. Call search_icons first.'}]});
 server.registerTool('search_unsplash',{
  title:'Search Unsplash photos',description:'Find relevant imagery. Use a returned stable CDN imageUrl on a GuildOS image node; retain attribution and record selection through the backend.',
  inputSchema:z.object({query:z.string().min(2).max(100)}),annotations:{readOnlyHint:true},
 },async({query})=>{try{return {content:[{type:'text',text:JSON.stringify({photos:await searchUnsplash(query)})}]};}catch(error){return {isError:true,content:[{type:'text',text:error instanceof ImageConnectorError?error.message:'Image search is unavailable.'}]};}});
 return server;
}

nextEnv.loadEnvConfig(process.cwd());
void serveStdio(createIconMcpServer);
