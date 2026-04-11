import { ChevronLeft, PiggyBank, Target, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

export function CreatePersonalGoalScreen() {
  const navigate = useNavigate();
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [duration, setDuration] = useState('');

  const calculateMonthlyAmount = () => {
    if (targetAmount && duration) {
      return Math.ceil(Number(targetAmount) / Number(duration));
    }
    return 0;
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate('/create-savings')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-[#FF7900]/10 flex items-center justify-center">
            <PiggyBank className="w-6 h-6 text-[#FF7900]" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900">
              Objectif Personnel
            </h1>
            <p className="font-['Outfit'] text-sm text-gray-500">
              Ma tirelire
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="px-6 space-y-4">
        {/* Goal Name */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Nom de l'objectif
          </label>
          <input
            type="text"
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
            placeholder="Ex: Nouveau Projet, Vacances, Mariage..."
            className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100"
          />
        </div>

        {/* Target Amount */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Montant à atteindre
          </label>
          <div className="relative">
            <input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="500000"
              className="w-full bg-gray-50 rounded-2xl px-4 py-4 pr-16 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-['Outfit'] text-gray-500">
              FCFA
            </span>
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Durée (en mois)
          </label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="6"
            className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100"
          />
          <p className="font-['Outfit'] text-xs text-gray-500 mt-2">
            Combien de temps voulez-vous prendre pour atteindre cet objectif ?
          </p>
        </div>

        {/* Category Selection */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Catégorie
          </label>
          <div className="grid grid-cols-2 gap-2">
            {['Voyage', 'Projet', 'Mariage', 'Éducation', 'Santé', 'Autre'].map((category) => (
              <button
                key={category}
                className="bg-gray-50 hover:bg-[#FF7900]/10 hover:border-[#FF7900]/30 border border-gray-100 rounded-xl py-3 px-4 font-['Outfit'] text-sm text-gray-700 hover:text-[#FF7900] transition-all active:scale-95"
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-[#009E60]/10 rounded-2xl p-5 border border-[#009E60]/20 mt-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#009E60]/10 flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 text-[#009E60]" />
            </div>
            <div>
              <p className="font-['Outfit'] font-medium text-gray-900 mb-1">
                Épargne flexible
              </p>
              <p className="font-['Outfit'] text-sm text-gray-600">
                Vous décidez quand et combien épargner. 
                Modifiez votre objectif à tout moment.
              </p>
            </div>
          </div>
        </div>

        {/* Preview Card */}
        {targetAmount && duration && (
          <div className="bg-white rounded-2xl p-5 border-2 border-[#FF7900]/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-['Outfit'] text-xs text-gray-600 mb-1">
                  Épargne mensuelle recommandée
                </p>
                <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#FF7900]">
                  {calculateMonthlyAmount().toLocaleString('fr-FR')} F
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[#FF7900]/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-[#FF7900]" />
              </div>
            </div>
            <p className="font-['Outfit'] text-sm text-gray-500">
              Pour atteindre {Number(targetAmount).toLocaleString('fr-FR')} F en {duration} mois
            </p>
          </div>
        )}
      </div>

      {/* Create Button */}
      <div className="px-6 mt-8">
        <button 
          className="w-full bg-[#FF7900] text-white font-['Outfit'] font-medium py-4 px-6 rounded-2xl shadow-lg hover:bg-[#FF7900]/90 transition-all active:scale-95"
        >
          Créer mon objectif
        </button>
        <p className="font-['Outfit'] text-xs text-gray-500 text-center mt-3">
          Vous pourrez suivre votre progression en temps réel
        </p>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}