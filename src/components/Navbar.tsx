import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { NavLink, useLocation } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { Gamepad2, User } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const TABS = [
  { name: 'Games', path: '/', icon: Gamepad2 },
  { name: 'Profile', path: '/profile', icon: User },
];

export default function Navbar() {
  const location = useLocation();
  const username = useUserStore((state) => state.username);
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    // Detect if we are running inside an iframe
    if (window !== window.top) {
      setIsEmbedded(true);
    }
  }, []);

  // Don't render the Navbar at all if inside an iframe (like MelodySync)
  if (isEmbedded) {
    return null;
  }

  return (
    <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4">

      <nav className="flex items-center gap-2 p-2 bg-[var(--color-glass-surface)]/80 backdrop-blur-xl border border-[var(--color-glass-border)] rounded-full shadow-2xl">
        {TABS.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={cn(
                "relative flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-full transition-colors",
                isActive ? "text-white" : "text-purple-200 hover:text-white hover:bg-white/5"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-bubble"
                  className="absolute inset-0 bg-purple-500/40 rounded-full border border-purple-400/30"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <tab.icon className="w-4 h-4 relative z-10" />
              <span className="relative z-10">{tab.name}</span>
            </NavLink>
          );
        })}
        
        <div className="w-[1px] h-6 bg-purple-400/20 mx-2" />
        
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-purple-200">
          <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
          {username}
        </div>
      </nav>
    </div>
  );
}
