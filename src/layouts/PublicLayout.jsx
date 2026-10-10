import { Outlet } from 'react-router-dom';
import ThemeToggle from '@/components/ThemeToggle';
import AlifGrowthFooter from '@/components/AlifGrowthFooter';

export default function PublicLayout() {
  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex-1"><Outlet /></div>
      <AlifGrowthFooter />
    </div>
  );
}
