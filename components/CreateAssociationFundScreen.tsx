import { ChevronLeft, Building2, Target, Calendar, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

export function CreateAssociationFundScreen() {
  const navigate = useNavigate();
  const [fundName, setFundName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');

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
          <div className="w-12 h-12 rounded-full bg-[#009E60]/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-[#009E60]" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900">
              Cagnotte Association
            </h1>
            <p className="font-['Outfit'] text-sm text-gray-500">
              Collecte de fonds communautaire
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="px-6 space-y-4">
        {/* Fund Name */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Nom de la cagnotte
          </label>
          <input
            type="text"
            value={fundName}
            onChange={(e) => setFundName(e.target.value)}
            placeholder="Ex: Construction Mosquée du Village"
            className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#009E60]/20 border border-gray-100"
          />
        </div>

        {/* Target Amount */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Objectif de collecte
          </label>
          <div className="relative">
            <input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="5000000"
              className="w-full bg-gray-50 rounded-2xl px-4 py-4 pr-16 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#009E60]/20 border border-gray-100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-['Outfit'] text-gray-500">
              FCFA
            </span>
          </div>
        </div>

        {/* Deadline */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Date limite
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#009E60]/20 border border-gray-100"
          />
          <p className="font-['Outfit'] text-xs text-gray-500 mt-2">
            Date limite de collecte (optionnel)
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Description du projet
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez la cause et l'utilisation des fonds..."
            rows={4}
            className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#009E60]/20 border border-gray-100 resize-none"
          />
        </div>

        {/* Category Selection */}
        <div>
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Catégorie
          </label>
          <div className="grid grid-cols-2 gap-2">
            {['Religion', 'Éducation', 'Santé', 'Infrastructure', 'Sport', 'Culture'].map((category) => (
              <button
                key={category}
                className="bg-gray-50 hover:bg-[#009E60]/10 hover:border-[#009E60]/30 border border-gray-100 rounded-xl py-3 px-4 font-['Outfit'] text-sm text-gray-700 hover:text-[#009E60] transition-all active:scale-95"
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
              <Users className="w-5 h-5 text-[#009E60]" />
            </div>
            <div>
              <p className="font-['Outfit'] font-medium text-gray-900 mb-1">
                Collecte ouverte
              </p>
              <p className="font-['Outfit'] text-sm text-gray-600">
                Tout le monde peut contribuer à cette cagnotte. 
                Les montants sont transparents et publics.
              </p>
            </div>
          </div>
        </div>

        {/* Preview Card */}
        {targetAmount && (
          <div className="bg-white rounded-2xl p-5 border-2 border-[#009E60]/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-['Outfit'] text-xs text-gray-600 mb-1">
                  Objectif de collecte
                </p>
                <p className="font-['Space_Grotesk'] font-bold text-2xl text-[#009E60]">
                  {Number(targetAmount).toLocaleString('fr-FR')} F
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[#009E60]/10 flex items-center justify-center">
                <Target className="w-6 h-6 text-[#009E60]" />
              </div>
            </div>
            <p className="font-['Outfit'] text-sm text-gray-500">
              La collecte sera visible par tous les membres
            </p>
          </div>
        )}
      </div>

      {/* Create Button */}
      <div className="px-6 mt-8">
        <button 
          className="w-full bg-[#009E60] text-white font-['Outfit'] font-medium py-4 px-6 rounded-2xl shadow-lg hover:bg-[#009E60]/90 transition-all active:scale-95"
        >
          Créer la cagnotte
        </button>
        <p className="font-['Outfit'] text-xs text-gray-500 text-center mt-3">
          Vous pourrez partager le lien de collecte après création
        </p>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}