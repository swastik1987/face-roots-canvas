import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import BottomTabBar from './BottomTabBar';

const HIDE_TAB_BAR = ['/', '/auth', '/consent', '/capture', '/family/add', '/settings/privacy'];

const shouldHideTabBar = (pathname: string) =>
  HIDE_TAB_BAR.includes(pathname) ||
  pathname.startsWith('/analysis/') ||
  pathname.endsWith('/share');

const transition = { type: 'spring' as const, stiffness: 260, damping: 20 };

const AppShell = () => {
  const location = useLocation();
  const hideBar = shouldHideTabBar(location.pathname);

  return (
    <div className="min-h-screen radial-glow">
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={transition}
          className={hideBar ? '' : 'pb-20'}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
      {!hideBar && <BottomTabBar />}
    </div>
  );
};

export default AppShell;
