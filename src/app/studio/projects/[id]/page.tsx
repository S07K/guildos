import { notFound } from 'next/navigation';
import { adminClient, studioSession } from '@/lib/studio/supabase';
import { ProjectEditor } from '@/components/studio/project-editor';
import { hasChatGPTPlan } from '@/lib/studio/chatgpt-oauth';
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{version?:string}> }) {
 const { id } = await params;
 const requestedVersion = (await searchParams).version;
 if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
 const { client } = await studioSession();
 const { data: project } = await client.from('studio_projects').select('*').eq('id', id).single();
 if (!project) notFound();
 const { data: versions, error } = await client.from('studio_versions').select('*').eq('project_id', id).order('created_at', { ascending: false }).order('id', { ascending: false });
 if (error) throw new Error('Your saved designs could not be loaded.');
 const admin = adminClient();
 const [{data:key},{data:routerKey},{data:groqKey},chatgpt] = await Promise.all([admin.from('studio_keys').select('workspace_id').eq('workspace_id',project.workspace_id).maybeSingle(),admin.from('studio_openrouter_keys').select('workspace_id').eq('workspace_id',project.workspace_id).maybeSingle(),admin.from('studio_groq_keys').select('workspace_id').eq('workspace_id',project.workspace_id).maybeSingle(),hasChatGPTPlan(project.workspace_id)]);
 return <ProjectEditor project={project} initialVersions={versions || []} initialVersionId={versions?.some(version=>version.id===requestedVersion)?requestedVersion:undefined} connections={{api:!!key,chatgpt,openrouter:!!routerKey,groq:!!groqKey}}/>;
}
