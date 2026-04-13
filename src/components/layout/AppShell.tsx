import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import BottomTabBar from './BottomTabBar';

const HIDE_TAB_BAR = ['/', '/auth', '/consent', '/capture', '/family/add', '/settings/privacy'];

const shouldHideTabBar = (pathname: string) =>
  HIDE_TAB_BAR.includes(pathname) ||
  pathname.startsWith('/analysis/') ||
  pathname.endsWith('/share');

const AppShell = () => {
  const location = useLocation();
  const hideBar = shouldHideTabBar(location.pathname);
  const prefersReducedMotion = useReducedMotion();

  // Respect prefers-reduced-motion: skip slide animation, keep fade
  const variants = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit:    { opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit:    { opacity: 0, y: -10 },
      };

  const transition = { type: 'spring' as const, stiffness: 300, damping: 26 };

  return (
    <div className="min-h-screen radial-glow">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
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
