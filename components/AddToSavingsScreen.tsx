import { ChevronLeft, PiggyBank, TrendingUp, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

export function AddToSavingsScreen() {
  const navigate = useNavigate();
  const [addAmount, setAddAmount] = useState('');

  // Current savings data
  const currentAmount = 325000;
  const targetAmount = 500000;
  const goalName = "Nouveau Projet";

  const quickAmounts = [10000, 25000, 50000, 100000];

  const calculateNewProgress = () => {
    if (addAmount) {
      const newTotal = currentAmount + Number(addAmount);
      const percentage = Math.min((newTotal / targetAmount) * 100, 100);
      return {
        newTotal,
        percentage: percentage.toFixed(0),
        remaining: Math.max(targetAmount - newTotal, 0)
      };
    }
    return null;
  };

  const progress = calculateNewProgress();

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate('/savings')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-[#009E60]/10 flex items-center justify-center">
            <PiggyBank className="w-6 h-6 text-[#009E60]" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900">
              Ajouter de l'argent
            </h1>
          </div>
        </div>
        <p className="font-['Outfit'] text-gray-600 mt-2">
          Contribuez à votre objectif d'épargne
        </p>
      </div>

      {/* Current Goal Summary */}
      <div className="px-6 mb-8">
        <div className="bg-[#009E60]/10 rounded-3xl p-6 border-2 border-[#009E60]/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-['Outfit'] text-xs text-gray-600 mb-1">
                Votre objectif
              </p>
              <p className="font-['Space_Grotesk'] font-bold text-xl text-gray-900">
                {goalName}
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

          <div className="pt-4 border-t border-[#009E60]/20">
            <div className="flex items-center justify-between text-sm">
              <span className="font-['Outfit'] text-gray-600">Épargné</span>
              <span className="font-['Outfit'] font-medium text-gray-900">
                {currentAmount.toLocaleString('fr-FR')} F
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="font-['Outfit'] text-gray-600">Objectif</span>
              <span className="font-['Outfit'] font-medium text-gray-900">
                {targetAmount.toLocaleString('fr-FR')} F
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Amount Section */}
      <div className="px-6 mb-8">
        <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
          Montant à ajouter
        </label>
        <div className="relative">
          <input
            type="number"
            value={addAmount}
            onChange={(e) => setAddAmount(e.target.value)}
            placeholder="Entrez le montant"
            className="w-full bg-gray-50 rounded-2xl px-4 py-5 pr-16 font-['Space_Grotesk'] font-bold text-2xl text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#009E60]/20 border border-gray-100"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-['Outfit'] text-gray-500 font-medium">
            FCFA
          </span>
        </div>

        {/* Quick Amount Buttons */}
        <div className="mt-4">
          <p className="font-['Outfit'] text-xs text-gray-600 mb-2">Montants rapides</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => setAddAmount(amount.toString())}
                className="flex-shrink-0 px-4 py-2 rounded-xl bg-white border-2 border-gray-200 hover:border-[#009E60] hover:bg-[#009E60]/5 font-['Outfit'] text-sm text-gray-700 hover:text-[#009E60] transition-all active:scale-95"
              >
                {amount.toLocaleString('fr-FR')} F
              </button>
            ))}
          </div>
        </div>

        {/* Remaining Amount Suggestion */}
        {currentAmount < targetAmount && (
          <button
            onClick={() => setAddAmount((targetAmount - currentAmount).toString())}
            className="w-full mt-3 bg-[#009E60]/10 rounded-xl p-3 border border-[#009E60]/20 hover:border-[#009E60]/40 transition-all active:scale-98"
          >
            <div className="flex items-center justify-between">
              <p className="font-['Outfit'] text-sm text-gray-700">
                Compléter l'objectif
              </p>
              <p className="font-['Space_Grotesk'] font-bold text-[#009E60]">
                {(targetAmount - currentAmount).toLocaleString('fr-FR')} F
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Progress Preview */}
      {progress && (
        <div className="px-6 mb-8">
          <div className="bg-[#009E60]/10 rounded-2xl p-5 border-2 border-[#009E60]/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#009E60]/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[#009E60]" />
              </div>
              <div>
                <p className="font-['Outfit'] text-xs text-gray-600">Nouvelle progression</p>
                <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#009E60]">
                  {progress.percentage}%
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-['Outfit'] text-gray-600">Nouveau total</span>
                <span className="font-['Outfit'] font-medium text-gray-900">
                  {progress.newTotal.toLocaleString('fr-FR')} F
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-['Outfit'] text-gray-600">Reste à épargner</span>
                <span className="font-['Outfit'] font-medium text-[#FF7900]">
                  {progress.remaining.toLocaleString('fr-FR')} F
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#009E60] transition-all duration-500 rounded-full"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>

            {progress.percentage === '100' && (
              <div className="mt-4 bg-white rounded-xl p-3 flex items-center gap-2">
                <span className="text-2xl">🎉</span>
                <p className="font-['Outfit'] text-sm text-[#009E60] font-medium">
                  Félicitations ! Objectif atteint !
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Source Info */}
      <div className="px-6 mb-8">
        <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 text-sm">ℹ️</span>
            </div>
            <div>
              <p className="font-['Outfit'] font-medium text-blue-900 mb-1">
                Source du paiement
              </p>
              <p className="font-['Outfit'] text-sm text-blue-800">
                Le montant sera prélevé de votre solde COTICI (487.000 F disponible).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Button */}
      <div className="px-6 mb-8">
        <button 
          disabled={!addAmount || Number(addAmount) <= 0}
          className={`w-full py-5 px-6 rounded-2xl font-['Outfit'] font-medium text-lg shadow-lg transition-all active:scale-95 ${
            addAmount && Number(addAmount) > 0
              ? 'bg-[#009E60] text-white hover:bg-[#009E60]/90 shadow-[0_10px_40px_rgba(0,158,96,0.3)]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Ajouter à mon épargne
        </button>
        {(!addAmount || Number(addAmount) <= 0) && (
          <p className="font-['Outfit'] text-xs text-gray-500 text-center mt-3">
            Entrez un montant valide
          </p>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}