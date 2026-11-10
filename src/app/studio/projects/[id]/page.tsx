import { notFound } from 'next/navigation';
import { adminClient, studioSession } from '@/lib/studio/supabase';
import { ProjectEditor } from '@/components/studio/project-editor';
import { hasChatGPTPlan } from '@/lib/studio/chatgpt-oauth';
import { trialStatus, workspaceConnections } from '@/lib/studio/trial';
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
 const [connections, trial] = await Promise.all([workspaceConnections(admin, project.workspace_id, hasChatGPTPlan), trialStatus(admin, project.workspace_id)]);
 return <ProjectEditor project={project} initialVersions={versions || []} initialVersionId={versions?.some(version=>version.id===requestedVersion)?requestedVersion:undefined} connections={connections} trial={Object.values(connections).some(Boolean)?null:trial}/>;
}
