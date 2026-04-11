import { ChevronLeft, Users, Shuffle, List } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

export function TontineConfigurationScreen() {
  const navigate = useNavigate();
  const [tontineName, setTontineName] = useState('');
  const [amountPerPerson, setAmountPerPerson] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [rotationLogic, setRotationLogic] = useState<'random' | 'fixed'>('random');

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

        <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900 mb-2">
          Configurer le Groupe
        </h1>
        <p className="font-['Outfit'] text-gray-600">
          Définissez les règles de votre tontine
        </p>
      </div>

      {/* Form */}
      <div className="px-6 space-y-6">
        {/* Tontine Name */}
        <div>
          <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
            Nom de la Tontine
          </label>
          <input
            type="text"
            value={tontineName}
            onChange={(e) => setTontineName(e.target.value)}
            placeholder="Famille Kouassi"
            className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100 transition-all"
          />
        </div>

        {/* Amount Per Person */}
        <div>
          <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
            Montant par personne
          </label>
          <div className="relative">
            <input
              type="number"
              value={amountPerPerson}
              onChange={(e) => setAmountPerPerson(e.target.value)}
              placeholder="10.000"
              className="w-full bg-gray-50 rounded-2xl px-4 py-4 pr-20 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100 transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-['Outfit'] text-gray-500 font-medium">
              FCFA
            </span>
          </div>
        </div>

        {/* Frequency Selector */}
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

        {/* Rotation Logic */}
        <div>
          <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-3 block">
            Attribution des tours
          </label>
          <div className="space-y-3">
            {/* Random Option */}
            <button
              onClick={() => setRotationLogic('random')}
              className={`w-full rounded-2xl p-4 border-2 transition-all active:scale-98 ${
                rotationLogic === 'random'
                  ? 'border-[#FF7900] bg-[#FF7900]/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  rotationLogic === 'random'
                    ? 'border-[#FF7900] bg-[#FF7900]'
                    : 'border-gray-300 bg-white'
                }`}>
                  {rotationLogic === 'random' && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </div>
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Shuffle className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className={`font-['Outfit'] font-medium ${
                    rotationLogic === 'random' ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    Tirage au sort (Aléatoire)
                  </p>
                  <p className="font-['Outfit'] text-xs text-gray-500">
                    L'ordre sera déterminé automatiquement
                  </p>
                </div>
              </div>
            </button>

            {/* Fixed Order Option */}
            <button
              onClick={() => setRotationLogic('fixed')}
              className={`w-full rounded-2xl p-4 border-2 transition-all active:scale-98 ${
                rotationLogic === 'fixed'
                  ? 'border-[#FF7900] bg-[#FF7900]/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  rotationLogic === 'fixed'
                    ? 'border-[#FF7900] bg-[#FF7900]'
                    : 'border-gray-300 bg-white'
                }`}>
                  {rotationLogic === 'fixed' && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <List className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className={`font-['Outfit'] font-medium ${
                    rotationLogic === 'fixed' ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    Ordre fixe (Manuel)
                  </p>
                  <p className="font-['Outfit'] text-xs text-gray-500">
                    Vous définirez l'ordre des membres
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
                Bon à savoir
              </p>
              <p className="font-['Outfit'] text-sm text-gray-700">
                Tous les membres devront accepter ces règles avant de rejoindre la tontine.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Button */}
      <div className="fixed bottom-24 left-0 right-0 px-6 py-4 bg-white">
        <button 
          className="w-full bg-[#FF7900] text-white font-['Outfit'] font-medium py-5 px-6 rounded-2xl hover:bg-[#FF7900]/90 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Users className="w-5 h-5" />
          <span className="text-lg">Inviter des membres</span>
        </button>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}