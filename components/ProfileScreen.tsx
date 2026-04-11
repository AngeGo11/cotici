import { Settings, ChevronRight, LogOut, Bell, Lock, HelpCircle, FileText } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BottomNavigation } from './BottomNavigation';

export function ProfileScreen() {
  const navigate = useNavigate();

  const settingsOptions = [
    {
      id: 'notifications',
      label: 'Notifications',
      description: 'Gérer vos alertes',
      icon: <Bell className="w-5 h-5" />,
      color: 'bg-blue-100 text-blue-600',
    },
    {
      id: 'security',
      label: 'Sécurité',
      description: 'Code PIN et biométrie',
      icon: <Lock className="w-5 h-5" />,
      color: 'bg-[#009E60]/10 text-[#009E60]',
    },
    {
      id: 'help',
      label: 'Aide & Support',
      description: 'FAQ et contact',
      icon: <HelpCircle className="w-5 h-5" />,
      color: 'bg-purple-100 text-purple-600',
    },
    {
      id: 'terms',
      label: 'Conditions d\'utilisation',
      description: 'Politique de confidentialité',
      icon: <FileText className="w-5 h-5" />,
      color: 'bg-gray-100 text-gray-600',
    },
  ];

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <h1 className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900 mb-6">
          Mon Profil
        </h1>

        {/* User Card */}
        <div className="bg-[#FF7900] rounded-3xl p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
              <span className="font-['Space_Grotesk'] font-bold text-2xl text-white">
                MK
              </span>
            </div>
            <div className="flex-1">
              <h2 className="font-['Space_Grotesk'] font-bold text-xl text-white mb-1">
                Marie Koné
              </h2>
              <p className="font-['Outfit'] text-sm text-white/80">
                +225 07 12 34 56 78
              </p>
            </div>
          </div>
          
          <div className="bg-white/10 rounded-2xl p-4 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-['Outfit'] text-xs text-white/80 mb-1">
                  Solde total
                </p>
                <p className="font-['Space_Grotesk'] font-bold text-2xl text-white">
                  487.000 F
                </p>
              </div>
              <div className="text-right">
                <p className="font-['Outfit'] text-xs text-white/80 mb-1">
                  Membre depuis
                </p>
                <p className="font-['Outfit'] text-white font-medium">
                  Janvier 2024
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 mb-8">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#009E60]/10 rounded-2xl p-4 text-center border border-[#009E60]/20">
            <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#009E60] mb-1">
              3
            </p>
            <p className="font-['Outfit'] text-xs text-gray-600">
              Tontines
            </p>
          </div>
          <div className="bg-[#FF7900]/10 rounded-2xl p-4 text-center border border-[#FF7900]/20">
            <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#FF7900] mb-1">
              2
            </p>
            <p className="font-['Outfit'] text-xs text-gray-600">
              Objectifs
            </p>
          </div>
          <div className="bg-blue-100 rounded-2xl p-4 text-center border border-blue-200">
            <p className="font-['Space_Grotesk'] font-bold text-2xl text-blue-600 mb-1">
              98%
            </p>
            <p className="font-['Outfit'] text-xs text-gray-600">
              Fiabilité
            </p>
          </div>
        </div>
      </div>

      {/* Settings Options */}
      <div className="px-6">
        <h3 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900 mb-4">
          Paramètres
        </h3>
        
        <div className="space-y-3">
          {settingsOptions.map((option) => (
            <button
              key={option.id}
              className="w-full bg-gray-50 rounded-2xl p-4 hover:bg-gray-100 transition-all active:scale-98 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${option.color} flex items-center justify-center`}>
                  {option.icon}
                </div>
                <div className="text-left">
                  <p className="font-['Outfit'] text-gray-900 font-medium">
                    {option.label}
                  </p>
                  <p className="font-['Outfit'] text-xs text-gray-500">
                    {option.description}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Logout Button */}
      <div className="px-6 mt-8">
        <button 
          onClick={() => navigate('/')}
          className="w-full bg-red-50 text-red-600 font-['Outfit'] font-medium py-4 px-6 rounded-2xl hover:bg-red-100 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          <span>Se déconnecter</span>
        </button>
      </div>

      {/* Version Info */}
      <div className="px-6 mt-6 text-center">
        <p className="font-['Outfit'] text-xs text-gray-400">
          COTICI v1.0.2
        </p>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}