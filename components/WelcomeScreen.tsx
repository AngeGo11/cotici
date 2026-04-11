import { ImageWithFallback } from './figma/ImageWithFallback';
import { Shield, Users, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router';

export function WelcomeScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-between px-6 py-12">
      {/* Logo */}
      <div className="w-full flex justify-center pt-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-[#009E60] flex items-center justify-center">
            <span className="text-white font-['Space_Grotesk'] font-bold text-xl">C</span>
          </div>
          <span className="font-['Space_Grotesk'] font-bold text-2xl text-[#009E60]">COTICI</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
        {/* Illustration */}
        <div className="w-full mb-8 relative">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1530043123514-c01b94ef483b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb21tdW5pdHklMjBzYXZpbmdzJTIwaWxsdXN0cmF0aW9uJTIwY29sb3JmdWx8ZW58MXx8fHwxNzcwNzY1MjA1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Community Savings Illustration"
            className="w-full h-64 object-contain"
          />
          
          {/* Decorative elements */}
          <div className="absolute -top-4 right-8 w-16 h-16 rounded-full bg-[#FF7900]/10 animate-pulse" />
          <div className="absolute bottom-4 left-8 w-12 h-12 rounded-full bg-[#009E60]/10 animate-pulse delay-150" />
        </div>

        {/* Headline */}
        <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-center text-gray-900 mb-4 leading-tight">
          Votre Tontine,<br />Sécurisée & Digitale
        </h1>

        {/* Trust Indicators */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-[#009E60]/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-[#009E60]" />
            </div>
            <span className="font-['Outfit'] text-xs text-gray-600">Sécurisé</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-[#009E60]/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-[#009E60]" />
            </div>
            <span className="font-['Outfit'] text-xs text-gray-600">Communautaire</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-[#009E60]/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-[#009E60]" />
            </div>
            <span className="font-['Outfit'] text-xs text-gray-600">Rentable</span>
          </div>
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="w-full max-w-md space-y-4">
        <button className="w-full bg-[#FF7900] text-white font-['Outfit'] py-4 px-6 rounded-2xl shadow-lg hover:bg-[#FF7900]/90 transition-all active:scale-95">
          Créer un compte
        </button>
        <button 
          onClick={() => navigate('/login')}
          className="w-full bg-white text-[#FF7900] font-['Outfit'] py-4 px-6 rounded-2xl border-2 border-[#FF7900] hover:bg-[#FF7900]/5 transition-all active:scale-95"
        >
          Se connecter
        </button>
      </div>

      {/* Footer Note */}
      <p className="font-['Outfit'] text-xs text-gray-400 mt-6 text-center">
        En continuant, vous acceptez nos conditions d'utilisation
      </p>
      
      {/* Quick Demo Access - For Testing */}
      <button 
        onClick={() => navigate('/home')}
        className="font-['Outfit'] text-xs text-gray-300 mt-2 hover:text-[#FF7900] transition-colors"
      >
        Accès rapide dashboard →
      </button>
    </div>
  );
}