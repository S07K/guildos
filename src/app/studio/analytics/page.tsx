import { dashboardData } from '@/lib/studio/dashboard';
import { Dashboard } from '@/components/studio/dashboard';
export default async function Analytics() { return <Dashboard {...await dashboardData('analytics')} view="analytics" />; }
