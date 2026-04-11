import { ChevronLeft, Heart, UserPlus, AlertCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

export function CreateSolidarityTontineScreen() {
  const navigate = useNavigate();
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [reason, setReason] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [contributionAmount, setContributionAmount] = useState('');

  const solidarityReasons = [
    'Maladie',
    'Décès',
    'Mariage',
    'Naissance',
    'Études',
    'Autre'
  ];

  const calculateParticipants = () => {
    if (targetAmount && contributionAmount) {
      return Math.ceil(Number(targetAmount) / Number(contributionAmount));
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
          <div className="w-12 h-12 rounded-full bg-[#FF7900]/20 flex items-center justify-center">
            <Heart className="w-6 h-6 text-[#FF7900]" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900">
              Aider un proche
            </h1>
          </div>
        </div>
        <p className="font-['Outfit'] text-gray-600 mt-2">
          Mobilisez votre communauté pour soutenir quelqu'un
        </p>
      </div>

      {/* Form */}
      <div className="px-6 space-y-6">
        {/* Beneficiary Section - FOCUS */}
        <div className="bg-[#FF7900]/10 rounded-3xl p-6 border border-[#FF7900]/20">
          <div className="flex items-start gap-4 mb-4">
            {/* Photo Placeholder */}
            <div className="w-20 h-20 rounded-2xl bg-[#FF7900] flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
                Qui aidons-nous ?
              </label>
              <input
                type="text"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Nom ou Numéro de téléphone"
                className="w-full bg-white rounded-xl px-4 py-3 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/30 border border-[#FF7900]/20"
              />
            </div>
          </div>
          <p className="font-['Outfit'] text-xs text-gray-600 flex items-center gap-2">
            <span className="text-[#FF7900]">💛</span>
            La personne sera notifiée de votre geste
          </p>
        </div>

        {/* Reason Section */}
        <div>
          <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
            Motif de la solidarité
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Frais médicaux, Funérailles..."
            className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100 mb-3"
          />
          
          {/* Quick Reason Selection */}
          <div className="grid grid-cols-3 gap-2">
            {solidarityReasons.map((reasonOption) => (
              <button
                key={reasonOption}
                onClick={() => setReason(reasonOption)}
                className={`py-2.5 px-3 rounded-xl font-['Outfit'] text-sm transition-all active:scale-95 ${
                  reason === reasonOption
                    ? 'bg-[#FF7900] text-white shadow-md'
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-[#FF7900]/30'
                }`}
              >
                {reasonOption}
              </button>
            ))}
          </div>
        </div>

        {/* Target Amount */}
        <div>
          <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
            Montant nécessaire
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
          <p className="font-['Outfit'] text-xs text-gray-500 mt-2">
            Montant total à collecter pour aider
          </p>
        </div>

        {/* Contribution Amount */}
        <div>
          <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
            Montant par participant
          </label>
          <div className="relative">
            <input
              type="number"
              value={contributionAmount}
              onChange={(e) => setContributionAmount(e.target.value)}
              placeholder="25000"
              className="w-full bg-gray-50 rounded-2xl px-4 py-4 pr-16 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-['Outfit'] text-gray-500">
              FCFA
            </span>
          </div>
          <p className="font-['Outfit'] text-xs text-gray-500 mt-2">
            Montant suggéré par personne
          </p>
        </div>

        {/* Calculation Preview */}
        {targetAmount && contributionAmount && (
          <div className="bg-[#FF7900]/10 rounded-2xl p-5 border-2 border-[#FF7900]/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-['Outfit'] text-xs text-gray-600 mb-1">
                  Nombre de participants nécessaires
                </p>
                <p className="font-['Space_Grotesk'] font-bold text-3xl text-[#FF7900]">
                  {calculateParticipants()}
                </p>
              </div>
              <div className="w-14 h-14 rounded-full bg-[#FF7900]/10 flex items-center justify-center">
                <Users className="w-7 h-7 text-[#FF7900]" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-['Outfit'] text-gray-600">Objectif:</span>
              <span className="font-['Outfit'] font-medium text-gray-900">
                {Number(targetAmount).toLocaleString('fr-FR')} F
              </span>
              <span className="text-gray-400">÷</span>
              <span className="font-['Outfit'] text-gray-600">
                {Number(contributionAmount).toLocaleString('fr-FR')} F/personne
              </span>
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-['Outfit'] font-medium text-amber-900 mb-1">
                Geste de solidarité
              </p>
              <p className="font-['Outfit'] text-sm text-amber-800">
                Cette collecte est un acte de générosité. Tous les fonds seront 
                remis directement au bénéficiaire.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Button */}
      <div className="px-6 mt-8 mb-8">
        <button 
          className="w-full bg-[#FF7900] text-white font-['Outfit'] font-medium py-5 px-6 rounded-2xl shadow-[0_10px_40px_rgba(255,121,0,0.3)] hover:bg-[#FF7900]/90 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Heart className="w-5 h-5" />
          <span className="text-lg">Créer le groupe de soutien</span>
        </button>
        <p className="font-['Outfit'] text-xs text-gray-500 text-center mt-3">
          Vous pourrez inviter les participants après création
        </p>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}