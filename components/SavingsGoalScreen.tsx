import { ChevronLeft, TrendingUp, Calendar, Target } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BottomNavigation } from './BottomNavigation';

export function SavingsGoalScreen() {
  const navigate = useNavigate();

  const savedAmount = 325000;
  const goalAmount = 500000;
  const percentage = Math.round((savedAmount / goalAmount) * 100);

  // SVG circle calculations
  const size = 280;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = ((100 - percentage) / 100) * circumference;

  return (
    <div className="min-h-screen bg-white">
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
            Historique
          </button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-[#009E60]/10 flex items-center justify-center">
            <Target className="w-6 h-6 text-[#009E60]" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900">
              Mon Objectif d'Épargne
            </h1>
            <p className="font-['Outfit'] text-sm text-gray-500">
              Nouveau Projet
            </p>
          </div>
        </div>
      </div>

      {/* Progress Circle */}
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background Circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#F3F4F6"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Progress Circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#009E60"
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={progress}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          
          {/* Center Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-['Space_Grotesk'] font-bold text-6xl text-[#009E60] mb-1">
              {percentage}%
            </p>
            <p className="font-['Outfit'] text-sm text-gray-500">
              Complété
            </p>
          </div>
        </div>

        {/* Amount Details */}
        <div className="mt-8 w-full max-w-sm">
          <div className="bg-[#009E60]/10 rounded-3xl p-6 border border-[#009E60]/20">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-['Outfit'] text-xs text-gray-600 mb-1">Montant épargné</p>
                <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#009E60]">
                  {savedAmount.toLocaleString('fr-FR')} F
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[#009E60]/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-[#009E60]" />
              </div>
            </div>
            
            <div className="h-px bg-gray-200 my-4"></div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-['Outfit'] text-xs text-gray-600 mb-1">Objectif</p>
                <p className="font-['Space_Grotesk'] font-bold text-xl text-gray-900">
                  {goalAmount.toLocaleString('fr-FR')} F
                </p>
              </div>
              <div className="text-right">
                <p className="font-['Outfit'] text-xs text-gray-600 mb-1">Restant</p>
                <p className="font-['Space_Grotesk'] font-bold text-xl text-[#FF7900]">
                  {(goalAmount - savedAmount).toLocaleString('fr-FR')} F
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-6 mb-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-gray-600" />
              <p className="font-['Outfit'] text-xs text-gray-600">Durée</p>
            </div>
            <p className="font-['Space_Grotesk'] font-bold text-lg text-gray-900">6 mois</p>
            <p className="font-['Outfit'] text-xs text-gray-500 mt-1">3 mois restants</p>
          </div>
          
          <div className="bg-gray-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-gray-600" />
              <p className="font-['Outfit'] text-xs text-gray-600">Mensuel</p>
            </div>
            <p className="font-['Space_Grotesk'] font-bold text-lg text-gray-900">83.333 F</p>
            <p className="font-['Outfit'] text-xs text-gray-500 mt-1">À épargner</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 pb-8 space-y-3">
        <button 
          onClick={() => navigate('/add-to-savings')}
          className="w-full bg-[#FF7900] text-white font-['Outfit'] font-medium py-4 px-6 rounded-2xl shadow-lg hover:bg-[#FF7900]/90 transition-all active:scale-95"
        >
          Ajouter de l'argent
        </button>
        <button className="w-full bg-transparent text-gray-600 font-['Outfit'] py-4 px-6 rounded-2xl hover:bg-gray-50 transition-all active:scale-95">
          Modifier l'objectif
        </button>
      </div>

      {/* Recent Contributions */}
      <div className="px-6 pb-8">
        <h3 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900 mb-4">
          Contributions récentes
        </h3>
        <div className="space-y-3">
          {[
            { date: '05 Fév 2026', amount: 50000 },
            { date: '01 Fév 2026', amount: 75000 },
            { date: '28 Jan 2026', amount: 100000 },
          ].map((contribution, index) => (
            <div 
              key={index}
              className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <div>
                <p className="font-['Outfit'] text-gray-900">Dépôt effectué</p>
                <p className="font-['Outfit'] text-xs text-gray-500">{contribution.date}</p>
              </div>
              <p className="font-['Space_Grotesk'] font-bold text-[#009E60]">
                +{contribution.amount.toLocaleString('fr-FR')} F
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}