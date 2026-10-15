import { notFound } from 'next/navigation';
import { adminClient, studioSession } from '@/lib/studio/supabase';
import { ProjectEditor } from '@/components/studio/project-editor';
import { hasChatGPTPlan } from '@/lib/studio/chatgpt-oauth';
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
 const { client } = await studioSession();
 const { data: project } = await client.from('studio_projects').select('*').eq('id', id).single();
 if (!project) notFound();
 const { data: versions, error } = await client.from('studio_versions').select('*').eq('project_id', id).order('created_at', { ascending: false });
 if (error) throw new Error('Your saved designs could not be loaded.');
 const admin = adminClient();
 const [{data:key},chatgpt] = await Promise.all([admin.from('studio_keys').select('workspace_id').eq('workspace_id',project.workspace_id).maybeSingle(),hasChatGPTPlan(project.workspace_id)]);
 return <ProjectEditor project={project} initialVersions={versions || []} connections={{api:!!key,chatgpt}}/>;
}
