import { Home, Users, PiggyBank, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

export function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      id: 'home',
      label: 'Accueil',
      icon: <Home className="w-6 h-6" />,
      path: '/home',
    },
    {
      id: 'tontines',
      label: 'Tontines',
      icon: <Users className="w-6 h-6" />,
      path: '/tontine',
    },
    {
      id: 'savings',
      label: 'Épargne',
      icon: <PiggyBank className="w-6 h-6" />,
      path: '/savings',
    },
    {
      id: 'profile',
      label: 'Profil',
      icon: <User className="w-6 h-6" />,
      path: '/profile',
    },
  ];

  const isActive = (path: string) => {
    // Check if current path matches or starts with the nav path
    return location.pathname === path || 
           (path === '/tontine' && (location.pathname.startsWith('/tontine') || 
                                     location.pathname === '/chat' || 
                                     location.pathname === '/solidarity')) ||
           (path === '/savings' && location.pathname.startsWith('/savings')) ||
           (path === '/profile' && (location.pathname.startsWith('/profile') || 
                                     location.pathname === '/admin'));
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] z-50">
      <div className="flex items-center justify-around px-2 py-3">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all active:scale-95"
            >
              <div className={active ? 'text-[#FF7900]' : 'text-[#A0A0A0]'}>
                {item.icon}
              </div>
              <span 
                className={`font-['Outfit'] text-[11px] ${
                  active ? 'text-[#FF7900] font-medium' : 'text-[#A0A0A0]'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}