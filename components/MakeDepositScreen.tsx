import { ChevronLeft, Lock, Check } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

type PaymentProvider = 'orange' | 'mtn' | 'wave' | 'moov' | null;

export function MakeDepositScreen() {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(null);
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

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate('/tontine')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900 mb-2">
          Effectuer un Dépôt
        </h1>
        <p className="font-['Outfit'] text-gray-600">
          Payez votre cotisation mensuelle
        </p>
      </div>

      {/* Payment Summary Card */}
      <div className="px-6 mb-8">
        <div className="bg-[#009E60]/10 rounded-3xl p-6 border-2 border-[#009E60]/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-['Outfit'] text-sm text-gray-600 mb-1">
                Vous payez
              </p>
              <p className="font-['Outfit'] text-gray-900 font-medium">
                Cotisation Tontine - Tour 3
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#009E60]/10 flex items-center justify-center">
              <span className="text-xl">💰</span>
            </div>
          </div>
          
          <div className="pt-4 border-t border-[#009E60]/20">
            <p className="font-['Outfit'] text-xs text-gray-600 mb-2">
              Montant à payer
            </p>
            <p className="font-['Space_Grotesk'] font-bold text-4xl text-[#009E60]">
              10.000 <span className="text-2xl">FCFA</span>
            </p>
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
        <p className="font-['Outfit'] text-xs text-gray-500 mt-2">
          Le numéro de votre compte Mobile Money
        </p>
      </div>

      {/* Payment Details */}
      <div className="px-6 mb-8">
        <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-['Outfit'] text-sm text-gray-600">Montant</span>
            <span className="font-['Outfit'] text-sm text-gray-900 font-medium">10.000 F</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-['Outfit'] text-sm text-gray-600">Frais de transaction</span>
            <span className="font-['Outfit'] text-sm text-gray-900 font-medium">0 F</span>
          </div>
          <div className="border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between">
              <span className="font-['Outfit'] font-medium text-gray-900">Total à payer</span>
              <span className="font-['Space_Grotesk'] font-bold text-lg text-gray-900">10.000 F</span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Note */}
      <div className="px-6 mb-6">
        <div className="flex items-center justify-center gap-2">
          <Lock className="w-4 h-4 text-gray-500" />
          <p className="font-['Outfit'] text-xs text-gray-600">
            Transaction sécurisée et chiffrée
          </p>
        </div>
      </div>

      {/* Confirm Payment Button */}
      <div className="px-6 mb-8">
        <button 
          disabled={!selectedProvider}
          className={`w-full py-5 px-6 rounded-2xl font-['Outfit'] font-medium text-lg shadow-lg transition-all active:scale-95 ${
            selectedProvider
              ? 'bg-[#FF7900] text-white hover:bg-[#FF7900]/90 shadow-[0_10px_40px_rgba(255,121,0,0.3)]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Confirmer le paiement
        </button>
        {!selectedProvider && (
          <p className="font-['Outfit'] text-xs text-gray-500 text-center mt-3">
            Veuillez sélectionner un opérateur
          </p>
        )}
      </div>

      {/* Info Banner */}
      <div className="px-6">
        <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 text-sm">ℹ️</span>
            </div>
            <div>
              <p className="font-['Outfit'] font-medium text-blue-900 mb-1">
                Comment ça marche ?
              </p>
              <p className="font-['Outfit'] text-sm text-blue-800">
                Vous allez recevoir une notification de paiement sur votre téléphone. 
                Suivez les instructions pour finaliser la transaction.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}