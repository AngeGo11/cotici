import { ChevronLeft, RotateCw, PiggyBank, Heart, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BottomNavigation } from './BottomNavigation';

interface SavingsOption {
  id: string;
  icon: React.ReactNode;
  iconBgColor: string;
  iconColor: string;
  title: string;
  subtitle: string;
  path: string;
}

export function CreateSavingsScreen() {
  const navigate = useNavigate();

  const savingsOptions: SavingsOption[] = [
    {
      id: 'tontine-groupe',
      icon: <RotateCw className="w-8 h-8" />,
      iconBgColor: 'bg-[#FF7900]/10',
      iconColor: 'text-[#FF7900]',
      title: 'Tontine de Groupe',
      subtitle: 'Cotisez ensemble, ramassez à tour de rôle.',
      path: '/create-classic-tontine',
    },
    {
      id: 'epargne-personnelle',
      icon: <PiggyBank className="w-8 h-8" />,
      iconBgColor: 'bg-[#009E60]/10',
      iconColor: 'text-[#009E60]',
      title: 'Mon Épargne',
      subtitle: 'Économisez seul pour vos envies.',
      path: '/create-personal-goal',
    },
    {
      id: 'tontine-solidaire',
      icon: <Heart className="w-8 h-8" />,
      iconBgColor: 'bg-[#FF7900]/10',
      iconColor: 'text-[#FF7900]',
      title: 'Tontine Solidaire',
      subtitle: 'Cotisez pour aider une personne dans le besoin.',
      path: '/create-solidarity-tontine',
    },
    {
      id: 'cagnotte-association',
      icon: <Building2 className="w-8 h-8" />,
      iconBgColor: 'bg-[#009E60]/10',
      iconColor: 'text-[#009E60]',
      title: 'Cagnotte Association',
      subtitle: 'Récoltez des fonds pour une cause commune.',
      path: '/create-association-fund',
    },
  ];

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate('/home')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900 mb-2">
          Nouveau Projet
        </h1>
        <p className="font-['Outfit'] text-gray-600">
          Choisissez le type d'épargne qui vous convient
        </p>
      </div>

      {/* Savings Options Cards */}
      <div className="px-6 space-y-4">
        {savingsOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => navigate(option.path)}
            className="w-full bg-white rounded-3xl p-6 border-2 border-gray-100 hover:border-[#FF7900]/30 hover:shadow-lg transition-all active:scale-98"
          >
            <div className="flex items-start gap-4">
              <div className={`w-16 h-16 rounded-2xl ${option.iconBgColor} flex items-center justify-center flex-shrink-0 ${option.iconColor}`}>
                {option.icon}
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-['Space_Grotesk'] font-bold text-xl text-gray-900 mb-2">
                  {option.title}
                </h3>
                <p className="font-['Outfit'] text-gray-600">
                  {option.subtitle}
                </p>
              </div>
              <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180 flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
      </div>

      {/* Info Banner */}
      <div className="px-6 mt-8">
        <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 text-sm">💡</span>
            </div>
            <div>
              <p className="font-['Outfit'] font-medium text-blue-900 mb-1">
                Conseil
              </p>
              <p className="font-['Outfit'] text-sm text-blue-800">
                Les tontines de groupe permettent de mobiliser plus de fonds rapidement, 
                tandis que l'épargne personnelle offre plus de flexibilité.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Features Comparison */}
      <div className="px-6 mt-8">
        <h3 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900 mb-4">
          Pourquoi choisir ?
        </h3>
        
        <div className="space-y-3">
          <div className="bg-[#FF7900]/10 rounded-2xl p-4 border-l-4 border-[#FF7900]">
            <p className="font-['Outfit'] font-medium text-gray-900 mb-1">
              Tontine de Groupe
            </p>
            <p className="font-['Outfit'] text-sm text-gray-600">
              Idéal pour mobiliser rapidement une grosse somme
            </p>
          </div>

          <div className="bg-[#009E60]/10 rounded-2xl p-4 border-l-4 border-[#009E60]">
            <p className="font-['Outfit'] font-medium text-gray-900 mb-1">
              Mon Épargne
            </p>
            <p className="font-['Outfit'] text-sm text-gray-600">
              Épargne autonome et flexible pour vos projets
            </p>
          </div>

          <div className="bg-[#FF7900]/10 rounded-2xl p-4 border-l-4 border-[#FF7900]">
            <p className="font-['Outfit'] font-medium text-gray-900 mb-1">
              Tontine Solidaire
            </p>
            <p className="font-['Outfit'] text-sm text-gray-600">
              Entraide et soutien mutuel entre membres
            </p>
          </div>

          <div className="bg-[#009E60]/10 rounded-2xl p-4 border-l-4 border-[#009E60]">
            <p className="font-['Outfit'] font-medium text-gray-900 mb-1">
              Cagnotte Association
            </p>
            <p className="font-['Outfit'] text-sm text-gray-600">
              Collecte de fonds pour causes communes
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}