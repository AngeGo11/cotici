import { Bell, ArrowDownToLine, ArrowUpFromLine, Send, Users, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

export function HomeScreen() {
  const navigate = useNavigate();
  const [balanceVisible, setBalanceVisible] = useState(true);

  const activities: Activity[] = [
    {
      id: '1',
      type: 'Versement Tontine',
      amount: -10000,
      date: '10 Fév 2026',
    },
    {
      id: '2',
      type: 'Dépôt Mobile Money',
      amount: 50000,
      date: '09 Fév 2026',
    },
    {
      id: '3',
      type: 'Retrait Espèces',
      amount: -25000,
      date: '08 Fév 2026',
    },
    {
      id: '4',
      type: 'Transfert reçu',
      amount: 75000,
      date: '07 Fév 2026',
    },
    {
      id: '5',
      type: 'Versement Tontine',
      amount: -10000,
      date: '03 Fév 2026',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar */}
      <div className="px-6 pt-12 pb-6 flex items-center justify-between">
        <div className="w-12 h-12 rounded-full bg-[#FF7900] flex items-center justify-center">
          <span className="text-white font-['Space_Grotesk'] font-bold text-lg">JD</span>
        </div>
        <div className="relative">
          <button className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5 text-gray-700" />
          </button>
          <div className="absolute top-2 right-2 w-2 h-2 bg-[#FF7900] rounded-full"></div>
        </div>
      </div>

      {/* Balance Card */}
      <div className="px-6 mb-6">
        <div className="bg-[#FF7900] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-['Outfit'] text-sm text-white/80">Solde disponible</p>
            <button 
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              {balanceVisible ? (
                <Eye className="w-4 h-4 text-white" />
              ) : (
                <EyeOff className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
          
          <div className="mb-4">
            {balanceVisible ? (
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white mb-1">
                487.000 <span className="text-xl">FCFA</span>
              </h2>
            ) : (
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white mb-1">
                ••••••
              </h2>
            )}
            <p className="font-['Outfit'] text-sm text-white/70">
              +25.000 FCFA ce mois
            </p>
          </div>

          <button 
            onClick={() => navigate('/create-savings')}
            className="w-full bg-white text-[#FF7900] font-['Outfit'] font-medium py-3 px-4 rounded-xl hover:bg-white/90 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="text-2xl leading-none">+</span>
            <span>Nouveau Projet</span>
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-6 mb-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col items-center gap-2 flex-1">
            <button 
              onClick={() => navigate('/deposit-to-account')}
              className="w-16 h-16 rounded-full bg-[#FF7900]/10 flex items-center justify-center hover:bg-[#FF7900]/20 transition-all active:scale-95"
            >
              <ArrowDownToLine className="w-7 h-7 text-[#FF7900]" />
            </button>
            <span className="font-['Outfit'] text-xs text-gray-700">Dépôt</span>
          </div>
          <div className="flex flex-col items-center gap-2 flex-1">
            <button className="w-16 h-16 rounded-full bg-[#009E60]/10 flex items-center justify-center hover:bg-[#009E60]/20 transition-all active:scale-95">
              <ArrowUpFromLine className="w-7 h-7 text-[#009E60]" />
            </button>
            <span className="font-['Outfit'] text-xs text-gray-700">Retrait</span>
          </div>
          <div className="flex flex-col items-center gap-2 flex-1">
            <button className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center hover:bg-blue-200 transition-all active:scale-95">
              <Send className="w-7 h-7 text-blue-600" />
            </button>
            <span className="font-['Outfit'] text-xs text-gray-700">Envoyer</span>
          </div>
        </div>
      </div>

      {/* Savings Goal Card - NEW */}
      <div className="px-6 mb-8">
        <button 
          onClick={() => navigate('/savings')}
          className="w-full bg-[#009E60]/10 rounded-3xl p-5 border border-gray-100 hover:border-[#009E60]/20 transition-all active:scale-98 mb-3"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <p className="font-['Outfit'] text-xs text-gray-600 mb-1">Objectif d'épargne</p>
              <p className="font-['Space_Grotesk'] font-bold text-xl text-gray-900 mb-1">
                Nouveau Projet
              </p>
              <p className="font-['Outfit'] text-sm text-[#009E60]">
                325.000 F / 500.000 F
              </p>
            </div>
            <div className="relative w-16 h-16">
              <svg width="64" height="64" className="transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="#F3F4F6"
                  strokeWidth="6"
                  fill="none"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="#009E60"
                  strokeWidth="6"
                  fill="none"
                  strokeDasharray={2 * Math.PI * 28}
                  strokeDashoffset={2 * Math.PI * 28 * 0.35}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-['Space_Grotesk'] font-bold text-sm text-[#009E60]">65%</span>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Recent Activity */}
      <div className="px-6 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-['Space_Grotesk'] font-bold text-xl text-gray-900">
            Activités Récentes
          </h3>
          <button className="font-['Outfit'] text-sm text-[#FF7900] hover:underline">
            Voir tout
          </button>
        </div>

        <div className="space-y-3">
          {activities.map((activity) => (
            <div 
              key={activity.id}
              className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  activity.amount > 0 
                    ? 'bg-[#009E60]/10' 
                    : 'bg-red-50'
                }`}>
                  {activity.amount > 0 ? (
                    <ArrowDownToLine className="w-5 h-5 text-[#009E60]" />
                  ) : (
                    <ArrowUpFromLine className="w-5 h-5 text-red-500" />
                  )}
                </div>
                <div>
                  <p className="font-['Outfit'] text-gray-900">{activity.type}</p>
                  <p className="font-['Outfit'] text-xs text-gray-500">{activity.date}</p>
                </div>
              </div>
              <p className={`font-['Space_Grotesk'] font-bold ${
                activity.amount > 0 ? 'text-[#009E60]' : 'text-red-500'
              }`}>
                {activity.amount > 0 ? '+' : ''}{activity.amount.toLocaleString('fr-FR')}F
              </p>
            </div>
          ))}
        </div>
        
        {/* Quick Access to Solidarity Tontine */}
        <button 
          onClick={() => navigate('/solidarity')}
          className="w-full mt-4 bg-[#FF7900]/10 rounded-2xl p-4 border border-gray-100 hover:border-[#FF7900]/20 transition-all active:scale-98 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FF7900] flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="font-['Outfit'] font-medium text-gray-900">Tontine Solidaire</p>
              <p className="font-['Outfit'] text-xs text-gray-500">Fonds d'urgence disponible</p>
            </div>
          </div>
          <span className="font-['Space_Grotesk'] font-bold text-[#FF7900]">→</span>
        </button>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}