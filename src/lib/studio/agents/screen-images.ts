/**
 * Photos for a planned screen. Every image shares the screen's art direction so
 * the set reads as one shoot. Images are generated with the workspace's own
 * OpenAI or OpenRouter key, stored privately per project, and fall back to
 * Unsplash and then a neutral placeholder.
 */
import { IMAGE_PLACEHOLDER, type ImageAspect, type ScreenArt, type ScreenImage } from '../html-screen.ts';
import { searchUnsplash, trackUnsplashSelection, unsplashConfigured } from '../unsplash.ts';

export type ImageConnection = { provider: 'openai' | 'openrouter'; key: string; model: string };
export type ImageUsage = { model: string; input_tokens: number; output_tokens: number };
type Store = (bytes: Uint8Array) => Promise<string>;

export const defaultImageModel = (provider: ImageConnection['provider']) => provider === 'openai'
 ? process.env.STUDIO_IMAGE_MODEL || 'gpt-image-2'
 : process.env.STUDIO_OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image';

const SIZE: Record<ImageAspect, string> = { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' };
const RATIO: Record<ImageAspect, string> = { square: '1:1', portrait: '2:3', landscape: '3:2' };
const sentence = (text: string) => text.trim().replace(/[.\s]+$/, '');
const imagePrompt = (art: ScreenArt, image: ScreenImage) => `${sentence(image.prompt)}. Art direction: ${sentence(art.direction)}. Photographic, no text, no logos, no watermarks, no borders.`;

async function generate(connection: ImageConnection, prompt: string, aspect: ImageAspect, request: typeof fetch, signal?: AbortSignal): Promise<{ bytes: Uint8Array; usage: ImageUsage }> {
 const timeout = AbortSignal.any([AbortSignal.timeout(150_000), ...(signal ? [signal] : [])]);
 const headers = { Authorization: `Bearer ${connection.key}`, 'Content-Type': 'application/json' };
 if (connection.provider === 'openai') {
  const response = await request('https://api.openai.com/v1/images/generations', { method: 'POST', headers, signal: timeout, body: JSON.stringify({ model: connection.model, prompt, size: SIZE[aspect], quality: 'medium', n: 1 }) });
  if (!response.ok) throw new Error(`OpenAI image generation failed (HTTP ${response.status}).`);
  const result = await response.json();
  const data = result.data?.[0]?.b64_json;
  if (typeof data !== 'string') throw new Error('OpenAI returned no image.');
  return { bytes: Buffer.from(data, 'base64'), usage: { model: `openai/${connection.model}`, input_tokens: Number(result.usage?.input_tokens) || 0, output_tokens: Number(result.usage?.output_tokens) || 0 } };
 }
 const response = await request('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers, signal: timeout, body: JSON.stringify({ model: connection.model, modalities: ['image', 'text'], image_config: { aspect_ratio: RATIO[aspect] }, messages: [{ role: 'user', content: prompt }] }) });
 if (!response.ok) throw new Error(`OpenRouter image generation failed (HTTP ${response.status}).`);
 const result = await response.json();
 const url = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
 const match = typeof url === 'string' ? /^data:image\/(?:png|jpeg|webp);base64,(.+)$/.exec(url) : null;
 if (!match) throw new Error('OpenRouter returned no image.');
 return { bytes: Buffer.from(match[1], 'base64'), usage: { model: `openrouter/${connection.model}`, input_tokens: Number(result.usage?.prompt_tokens) || 0, output_tokens: Number(result.usage?.completion_tokens) || 0 } };
}

/**
 * Resolves every pending image of a screen in parallel. One failing image never
 * fails the screen; it falls back to Unsplash, then to the placeholder.
 */
export async function generateScreenImages(art: ScreenArt, input: { connection: ImageConnection | null; store: Store; request?: typeof fetch; signal?: AbortSignal; onProgress?: (message: string) => Promise<void> }) {
 const request = input.request || fetch;
 const usage: ImageUsage[] = [];
 const images = await Promise.all(art.images.map(async (image): Promise<ScreenImage> => {
  if (image.url) return image;
  if (input.connection) {
   try {
    const generated = await generate(input.connection, imagePrompt(art, image), image.aspect, request, input.signal);
    usage.push(generated.usage);
    return { ...image, url: await input.store(generated.bytes), source: 'generated' };
   } catch (error) {
    if (input.signal?.aborted) throw error;
    await input.onProgress?.(`${image.id}: ${error instanceof Error ? error.message : 'image generation failed'} Using a fallback photo.`);
   }
  }
  if (unsplashConfigured()) {
   try {
    const photo = (await searchUnsplash(image.prompt.slice(0, 100), request, input.signal))[0];
    if (photo) { await trackUnsplashSelection(photo, request, input.signal); return { ...image, url: photo.imageUrl, source: 'unsplash' }; }
   } catch { /* fall through to the placeholder */ }
  }
  return { ...image, url: IMAGE_PLACEHOLDER, source: 'placeholder' };
 }));
 return { art: { ...art, images }, usage };
}
