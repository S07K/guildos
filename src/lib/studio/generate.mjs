import { runGuild } from './guild.ts';

/** Retained entry point; all generation now follows the shared component pipeline. */
export async function generateDesign(input, request = fetch) {
 return runGuild(input, request);
}
