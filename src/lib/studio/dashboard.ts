import 'server-only';
import { studioSession } from './supabase';
import type { Project, Version } from '@/components/studio/dashboard';
export async function dashboardData() {
 const { client } = await studioSession();
 const projects: Project[] = []; const versions: Version[] = []; const messages: { project_id: string; model: string; input_tokens: number; output_tokens: number; created_at: string }[] = [];
 for (const table of ['studio_projects', 'studio_versions', 'studio_agent_messages']) {
  for (let offset = 0; ; offset += 500) {
   const columns = table === 'studio_projects' ? 'id, name, brief, created_at' : table === 'studio_versions' ? 'id, project_id, document, model, input_tokens, output_tokens, created_at' : 'id, project_id, author_kind, model, input_tokens, output_tokens, created_at';
   const { data, error } = await (client as any).from(table).select(columns).order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
   if (error) {
    // Agent chat analytics are additive; keep the core workspace usable while that table is unavailable.
    if (table === 'studio_agent_messages') break;
    throw new Error('Your workspace activity could not be loaded.');
   }
   if (table === 'studio_projects') projects.push(...(data as unknown as Project[] || []));
   else if (table === 'studio_versions') versions.push(...(data as unknown as Version[] || []));
   else messages.push(...((data || []).filter((item: { author_kind: string }) => item.author_kind === 'agent') as unknown as typeof messages));
   if (!data || data.length < 500) break;
  }
 }
 return { projects, versions, messages };
}
