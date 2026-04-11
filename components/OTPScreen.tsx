import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';

export function OTPScreen() {
  const navigate = useNavigate();
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Auto-navigate to home when all digits are filled
    if (otp.every(digit => digit !== '')) {
      setTimeout(() => {
        navigate('/home');
      }, 500);
    }
  }, [otp, navigate]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = () => {
    setTimer(60);
    setOtp(['', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-12">
      {/* Header */}
      <div className="w-full flex items-center justify-between mb-8">
        <button 
          onClick={() => navigate('/login')}
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
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-[#FF7900]/10 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-[#FF7900]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>

        <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-gray-900 mb-2 text-center">
          Vérification
        </h1>
        <p className="font-['Outfit'] text-gray-500 mb-8 text-center">
          Entrez le code reçu par SMS
        </p>

        {/* OTP Input */}
        <div className="flex gap-4 justify-center mb-8 w-full">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-16 h-20 bg-gray-50 rounded-2xl font-['Space_Grotesk'] font-bold text-center text-3xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF7900]/30 focus:bg-white transition-all"
            />
          ))}
        </div>

        {/* Timer and Resend */}
        <div className="flex flex-col items-center gap-2">
          {timer > 0 ? (
            <p className="font-['Outfit'] text-sm text-gray-500">
              Renvoyer le code dans{' '}
              <span className="font-['Space_Grotesk'] font-bold text-[#FF7900]">
                {timer}s
              </span>
            </p>
          ) : (
            <button 
              onClick={handleResend}
              className="font-['Outfit'] text-[#FF7900] hover:underline transition-all"
            >
              Renvoyer le code
            </button>
          )}
        </div>
      </div>

      {/* Bottom Info */}
      <p className="font-['Outfit'] text-xs text-gray-400 text-center mt-8">
        Vous n'avez pas reçu de code ? Vérifiez votre numéro
      </p>
    </div>
  );
}