import { dashboardData } from '@/lib/studio/dashboard';
import { Dashboard } from '@/components/studio/dashboard';
export default async function Projects() { return <Dashboard {...await dashboardData('projects')} view="projects" />; }
