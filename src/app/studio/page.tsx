import { dashboardData } from '@/lib/studio/dashboard';
import { Dashboard } from '@/components/studio/dashboard';
export default async function Studio() {
 return <Dashboard {...await dashboardData('overview')} view="overview" />;
}
