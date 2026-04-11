import { ChevronLeft, Lock, Wallet, Check } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

type PaymentProvider = 'orange' | 'mtn' | 'wave' | 'moov' | null;

export function DepositToAccountScreen() {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+225 07 08 09 10 11');

  const providers = [
    {
      id: 'orange' as const,
      name: 'Orange Money',
      bgColor: 'bg-orange-500',
      textColor: 'text-white',
    },
    {
      id: 'mtn' as const,
      name: 'MTN MoMo',
      bgColor: 'bg-yellow-400',
      textColor: 'text-gray-900',
    },
    {
      id: 'wave' as const,
      name: 'Wave',
      bgColor: 'bg-blue-500',
      textColor: 'text-white',
    },
    {
      id: 'moov' as const,
      name: 'Moov Money',
      bgColor: 'bg-green-500',
      textColor: 'text-white',
    },
  ];

  const quickAmounts = [5000, 10000, 25000, 50000, 100000];

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

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-[#FF7900]/10 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-[#FF7900]" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900">
              Recharger mon compte
            </h1>
          </div>
        </div>
        <p className="font-['Outfit'] text-gray-600 mt-2">
          Ajoutez de l'argent à votre solde COTICI
        </p>
      </div>

      {/* Current Balance Card */}
      <div className="px-6 mb-8">
        <div className="bg-gray-100 rounded-2xl p-5 border border-gray-200">
          <p className="font-['Outfit'] text-xs text-gray-600 mb-1">
            Solde actuel
          </p>
          <p className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900">
            487.000 <span className="text-lg">FCFA</span>
          </p>
        </div>
      </div>

      {/* Amount Section */}
      <div className="px-6 mb-8">
        <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
          Montant à déposer
        </label>
        <div className="relative">
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="Entrez le montant"
            className="w-full bg-gray-50 rounded-2xl px-4 py-5 pr-16 font-['Space_Grotesk'] font-bold text-2xl text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100"
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
                onClick={() => setDepositAmount(amount.toString())}
                className="flex-shrink-0 px-4 py-2 rounded-xl bg-white border-2 border-gray-200 hover:border-[#FF7900] hover:bg-[#FF7900]/5 font-['Outfit'] text-sm text-gray-700 hover:text-[#FF7900] transition-all active:scale-95"
              >
                {amount.toLocaleString('fr-FR')} F
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Method Section */}
      <div className="px-6 mb-8">
        <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-4 block">
          Choisir l'opérateur
        </label>

        <div className="grid grid-cols-2 gap-3">
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => setSelectedProvider(provider.id)}
              className={`relative rounded-2xl p-6 transition-all active:scale-95 ${provider.bgColor} ${
                selectedProvider === provider.id
                  ? 'ring-4 ring-[#FF7900]/30 shadow-lg'
                  : 'opacity-90 hover:opacity-100'
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-2">
                <div className={`w-12 h-12 rounded-full bg-white/20 flex items-center justify-center ${provider.textColor}`}>
                  <span className="font-['Space_Grotesk'] font-bold text-xl">
                    {provider.name.charAt(0)}
                  </span>
                </div>
                <p className={`font-['Outfit'] font-medium text-sm ${provider.textColor}`}>
                  {provider.name}
                </p>
              </div>
              
              {selectedProvider === provider.id && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                  <Check className="w-4 h-4 text-[#009E60]" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Phone Number Input */}
      <div className="px-6 mb-8">
        <label className="font-['Outfit'] text-sm font-medium text-gray-700 mb-2 block">
          Numéro de téléphone du compte
        </label>
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+225 XX XX XX XX XX"
          className="w-full bg-gray-50 rounded-2xl px-4 py-4 font-['Outfit'] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#FF7900]/20 border border-gray-100 transition-all"
        />
      </div>

      {/* Summary */}
      {depositAmount && (
        <div className="px-6 mb-8">
          <div className="bg-[#009E60]/10 rounded-2xl p-5 border border-[#009E60]/20">
            <div className="flex items-center justify-between mb-3">
              <span className="font-['Outfit'] text-sm text-gray-600">Nouveau solde</span>
              <span className="font-['Space_Grotesk'] font-bold text-xl text-[#009E60]">
                {(487000 + Number(depositAmount)).toLocaleString('fr-FR')} F
              </span>
            </div>
            <div className="text-center pt-3 border-t border-[#009E60]/20">
              <p className="font-['Outfit'] text-xs text-gray-600">
                487.000 F + {Number(depositAmount).toLocaleString('fr-FR')} F
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Security Note */}
      <div className="px-6 mb-6">
        <div className="flex items-center justify-center gap-2">
          <Lock className="w-4 h-4 text-gray-500" />
          <p className="font-['Outfit'] text-xs text-gray-600">
            Transaction sécurisée et chiffrée
          </p>
        </div>
      </div>

      {/* Confirm Button */}
      <div className="px-6 mb-8">
        <button 
          disabled={!selectedProvider || !depositAmount}
          className={`w-full py-5 px-6 rounded-2xl font-['Outfit'] font-medium text-lg shadow-lg transition-all active:scale-95 ${
            selectedProvider && depositAmount
              ? 'bg-[#FF7900] text-white hover:bg-[#FF7900]/90 shadow-[0_10px_40px_rgba(255,121,0,0.3)]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Confirmer le dépôt
        </button>
        {(!selectedProvider || !depositAmount) && (
          <p className="font-['Outfit'] text-xs text-gray-500 text-center mt-3">
            {!depositAmount ? 'Entrez un montant' : 'Sélectionnez un opérateur'}
          </p>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}