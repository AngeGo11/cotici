import { ChevronLeft, RotateCw, Shuffle, ClipboardList, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

export function CreateClassicTontineScreen() {
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [rotationLogic, setRotationLogic] = useState<'random' | 'admin'>('random');

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
            <RotateCw className="w-6 h-6 text-[#FF7900]" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900">
              Configurer la Tontine
            </h1>
          </div>
        </div>
        <p className="font-['Outfit'] text-gray-600 mt-2">
          Définissez les règles de votre groupe
        </p>
      </div>

      {/* Form Sections */}
      <div className="px-6 space-y-6">
        {/* Basic Info Section */}
        <div className="space-y-4">
          <h3 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900">
            Informations de base
          </h3>
          
          {/* Group Name */}
          <div>
            <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
              Nom du Groupe
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ex: Tontine des Entrepreneurs"
              className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100"
            />
          </div>

          {/* Monthly Amount */}
          <div>
            <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
              Montant de la mise
            </label>
            <div className="relative">
              <input
                type="number"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                placeholder="10000"
                className="w-full bg-gray-50 rounded-2xl px-4 py-4 pr-16 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-['Outfit'] text-gray-500">
                FCFA
              </span>
            </div>
          </div>
        </div>

        {/* Frequency Section */}
        <div>
          <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-3 block">
            Fréquence
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFrequency('weekly')}
              className={`py-4 px-6 rounded-2xl font-['Outfit'] font-medium transition-all active:scale-95 ${
                frequency === 'weekly'
                  ? 'bg-[#FF7900] text-white shadow-lg'
                  : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300'
              }`}
            >
              Hebdo
            </button>
            <button
              onClick={() => setFrequency('monthly')}
              className={`py-4 px-6 rounded-2xl font-['Outfit'] font-medium transition-all active:scale-95 ${
                frequency === 'monthly'
                  ? 'bg-[#FF7900] text-white shadow-lg'
                  : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300'
              }`}
            >
              Mensuel
            </button>
          </div>
        </div>

        {/* Rotation Rules Section - CRITICAL */}
        <div className="pt-4">
          <h3 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900 mb-1">
            Ordre de passage des membres
          </h3>
          <p className="font-['Outfit'] text-sm text-gray-600 mb-4">
            Choisissez comment l'ordre sera défini
          </p>

          <div className="space-y-3">
            {/* Option A: Random */}
            <button
              onClick={() => setRotationLogic('random')}
              className={`w-full rounded-2xl p-5 border-2 transition-all active:scale-98 ${
                rotationLogic === 'random'
                  ? 'border-[#FF7900] bg-[#FF7900]/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-all ${
                  rotationLogic === 'random'
                    ? 'border-[#FF7900] bg-[#FF7900]'
                    : 'border-gray-300 bg-white'
                }`}>
                  {rotationLogic === 'random' && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Shuffle className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className={`font-['Space_Grotesk'] font-bold text-lg mb-1 ${
                    rotationLogic === 'random' ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    Aléatoire
                  </p>
                  <p className="font-['Outfit'] text-sm text-gray-600">
                    L'application tire au sort le bénéficiaire chaque mois.
                  </p>
                </div>
              </div>
            </button>

            {/* Option B: Admin Defined */}
            <button
              onClick={() => setRotationLogic('admin')}
              className={`w-full rounded-2xl p-5 border-2 transition-all active:scale-98 ${
                rotationLogic === 'admin'
                  ? 'border-[#FF7900] bg-[#FF7900]/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-all ${
                  rotationLogic === 'admin'
                    ? 'border-[#FF7900] bg-[#FF7900]'
                    : 'border-gray-300 bg-white'
                }`}>
                  {rotationLogic === 'admin' && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className={`font-['Space_Grotesk'] font-bold text-lg mb-1 ${
                    rotationLogic === 'admin' ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    Défini par l'Admin
                  </p>
                  <p className="font-['Outfit'] text-sm text-gray-600">
                    Vous décidez qui prend à quelle date.
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-[#009E60]/10 rounded-2xl p-5 border border-[#009E60]/20">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-[#009E60]/10 flex items-center justify-center flex-shrink-0">
              <span className="text-[#009E60] text-sm">ℹ️</span>
            </div>
            <div>
              <p className="font-['Outfit'] font-medium text-gray-900 mb-1">
                À savoir
              </p>
              <p className="font-['Outfit'] text-sm text-gray-700">
                Tous les membres devront valider ces règles avant de rejoindre la tontine.
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
          <Users className="w-5 h-5" />
          <span className="text-lg">Créer et Inviter</span>
        </button>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}