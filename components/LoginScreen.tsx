import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Fingerprint, ChevronLeft } from 'lucide-react';

export function LoginScreen() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPinInput] = useState(['', '', '', '']);

  const handlePinChange = (index: number, value: string) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;
    
    const newPin = [...pin];
    newPin[index] = value;
    setPinInput(newPin);

    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleLogin = () => {
    navigate('/otp');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-12">
      {/* Header */}
      <div className="w-full flex items-center justify-between mb-8">
        <button 
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#009E60] flex items-center justify-center">
            <span className="text-white font-['Space_Grotesk'] font-bold text-sm">C</span>
          </div>
          <span className="font-['Space_Grotesk'] font-bold text-lg text-[#009E60]">COTICI</span>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col w-full max-w-md mx-auto">
        <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900 mb-2">
          Connexion
        </h1>
        <p className="font-['Outfit'] text-gray-500 mb-8">
          Accédez à votre compte COTICI
        </p>

        {/* Phone Number Input */}
        <div className="mb-6">
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Numéro de téléphone
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-2xl">🇨🇮</span>
              <span className="font-['Outfit'] text-gray-600">+225</span>
              <div className="w-px h-6 bg-gray-300 ml-1"></div>
            </div>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="07 XX XX XX XX"
              className="w-full pl-28 pr-4 py-4 bg-gray-50 rounded-2xl font-['Outfit'] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF7900]/30 transition-all"
            />
          </div>
        </div>

        {/* PIN Input */}
        <div className="mb-8">
          <label className="font-['Outfit'] text-sm text-gray-700 mb-2 block">
            Code PIN
          </label>
          <div className="flex gap-4 justify-between">
            {pin.map((digit, index) => (
              <input
                key={index}
                id={`pin-${index}`}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handlePinChange(index, e.target.value)}
                className="w-16 h-16 bg-gray-50 rounded-2xl font-['Outfit'] text-center text-2xl focus:outline-none focus:ring-2 focus:ring-[#FF7900]/30 transition-all"
              />
            ))}
          </div>
        </div>

        {/* Login Button */}
        <button 
          onClick={handleLogin}
          className="w-full bg-[#FF7900] text-white font-['Outfit'] py-4 px-6 rounded-2xl shadow-lg hover:bg-[#FF7900]/90 transition-all active:scale-95 mb-6"
        >
          Connexion
        </button>

        {/* Forgot PIN Link */}
        <button className="font-['Outfit'] text-[#FF7900] text-sm text-center hover:underline">
          Code PIN oublié ?
        </button>
        
        {/* Quick Demo Access */}
        <button 
          onClick={() => navigate('/home')}
          className="font-['Outfit'] text-xs text-gray-400 text-center mt-4 hover:text-[#FF7900] transition-colors"
        >
          Passer directement au dashboard →
        </button>
      </div>

      {/* Biometric Authentication */}
      <div className="flex flex-col items-center gap-3 mt-8">
        <p className="font-['Outfit'] text-xs text-gray-500">Ou connectez-vous avec</p>
        <button className="w-16 h-16 rounded-full bg-[#009E60]/10 flex items-center justify-center hover:bg-[#009E60]/20 transition-all active:scale-95">
          <Fingerprint className="w-8 h-8 text-[#009E60]" />
        </button>
      </div>
    </div>
  );
}