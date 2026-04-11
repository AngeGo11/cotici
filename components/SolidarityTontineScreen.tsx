import { ChevronLeft, Users, Heart, AlertCircle, Cross } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BottomNavigation } from './BottomNavigation';

interface AidHistory {
  id: string;
  type: string;
  recipient: string;
  amount: number;
  date: string;
  icon: 'medical' | 'education' | 'emergency' | 'family';
}

export function SolidarityTontineScreen() {
  const navigate = useNavigate();

  const aidHistory: AidHistory[] = [
    {
      id: '1',
      type: 'Aide Santé',
      recipient: 'Fatou K.',
      amount: 25000,
      date: '05 Fév 2026',
      icon: 'medical',
    },
    {
      id: '2',
      type: 'Aide Éducation',
      recipient: 'Amadou B.',
      amount: 30000,
      date: '28 Jan 2026',
      icon: 'education',
    },
    {
      id: '3',
      type: 'Urgence Famille',
      recipient: 'Marie K.',
      amount: 40000,
      date: '15 Jan 2026',
      icon: 'family',
    },
    {
      id: '4',
      type: 'Aide Médicale',
      recipient: 'Ibrahim S.',
      amount: 35000,
      date: '03 Jan 2026',
      icon: 'medical',
    },
  ];

  const getIconForType = (type: AidHistory['icon']) => {
    switch (type) {
      case 'medical':
        return (
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <Cross className="w-4 h-4 text-red-600" />
          </div>
        );
      case 'education':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-600 font-bold text-sm">📚</span>
          </div>
        );
      case 'emergency':
        return (
          <div className="w-8 h-8 rounded-full bg-[#FF7900]/10 flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-[#FF7900]" />
          </div>
        );
      case 'family':
        return (
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <Heart className="w-4 h-4 text-purple-600" />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-white pb-24">{/* Added padding bottom for nav */}
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate('/home')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <button className="font-['Outfit'] text-sm text-[#FF7900] hover:underline">
            Règlement
          </button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-[#FF7900] flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900">
              Tontine Solidaire
            </h1>
            <p className="font-['Outfit'] text-sm text-gray-500">
              des Commerçants
            </p>
          </div>
        </div>
      </div>

      {/* Dual Cards */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Card 1 - Rotating Pot */}
          <div className="bg-white rounded-3xl p-5 border-2 border-[#009E60]/20 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-[#009E60]/10 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-[#009E60]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="font-['Outfit'] text-xs text-gray-600 mb-2">
              Cagnotte Tournante
            </p>
            <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#009E60]">
              200.000
              <span className="text-sm ml-1">F</span>
            </p>
            <p className="font-['Outfit'] text-xs text-gray-500 mt-1">
              8 membres actifs
            </p>
          </div>

          {/* Card 2 - Emergency Fund */}
          <div className="bg-[#FF7900] rounded-3xl p-5">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mb-3">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <p className="font-['Outfit'] text-xs text-white/90 mb-2">
              Fonds d'Urgence
            </p>
            <p className="font-['Space_Grotesk'] font-bold text-2xl text-white">
              50.000
              <span className="text-sm ml-1">F</span>
            </p>
            <p className="font-['Outfit'] text-xs text-white/80 mt-1">
              Disponible
            </p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="px-6 mb-6">
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 text-sm">ℹ️</span>
            </div>
            <div>
              <p className="font-['Outfit'] text-sm text-blue-900">
                Le fonds d'urgence est réservé aux situations critiques validées par le groupe.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Request Button */}
      <div className="px-6 mb-8">
        <button className="w-full bg-transparent text-[#FF7900] font-['Outfit'] font-medium py-4 px-6 rounded-2xl border-2 border-[#FF7900] hover:bg-[#FF7900]/5 transition-all active:scale-95 flex items-center justify-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>Demander une aide d'urgence</span>
        </button>
      </div>

      {/* Aid History */}
      <div className="px-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-['Space_Grotesk'] font-bold text-xl text-gray-900">
            Historique des Aides
          </h2>
          <button className="font-['Outfit'] text-sm text-[#FF7900] hover:underline">
            Voir tout
          </button>
        </div>

        <div className="space-y-3">
          {aidHistory.map((aid) => (
            <div 
              key={aid.id}
              className="bg-gray-50 rounded-2xl p-4 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {getIconForType(aid.icon)}
                  <div>
                    <p className="font-['Outfit'] text-gray-900 font-medium">
                      {aid.type}
                    </p>
                    <p className="font-['Outfit'] text-xs text-gray-500">
                      Pour {aid.recipient}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-['Space_Grotesk'] font-bold text-[#FF7900]">
                    {aid.amount.toLocaleString('fr-FR')} F
                  </p>
                  <p className="font-['Outfit'] text-xs text-gray-500">
                    {aid.date}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statistics Section */}
      <div className="px-6 mt-8">
        <h3 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900 mb-4">
          Impact collectif
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#009E60]/10 rounded-2xl p-4 text-center border border-[#009E60]/20">
            <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#009E60] mb-1">
              12
            </p>
            <p className="font-['Outfit'] text-xs text-gray-600">
              Aides accordées
            </p>
          </div>
          <div className="bg-[#FF7900]/10 rounded-2xl p-4 text-center border border-[#FF7900]/20">
            <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#FF7900] mb-1">
              8
            </p>
            <p className="font-['Outfit'] text-xs text-gray-600">
              Membres
            </p>
          </div>
          <div className="bg-purple-100 rounded-2xl p-4 text-center border border-purple-200">
            <p className="font-['Space_Grotesk'] font-bold text-2xl text-purple-600 mb-1">
              130K
            </p>
            <p className="font-['Outfit'] text-xs text-gray-600">
              Total versé
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}