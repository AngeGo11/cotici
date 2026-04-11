import { ChevronLeft, Check, X, Settings, UserMinus, AlertCircle, Shield } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BottomNavigation } from './BottomNavigation';

interface JoinRequest {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  requestDate: string;
}

interface PaymentValidation {
  id: string;
  memberName: string;
  amount: number;
  method: string;
  date: string;
}

export function AdminManagementScreen() {
  const navigate = useNavigate();

  const joinRequests: JoinRequest[] = [
    {
      id: '1',
      name: 'Sophie Traoré',
      avatar: 'ST',
      phone: '+225 07 12 34 56',
      requestDate: '10 Fév 2026',
    },
    {
      id: '2',
      name: 'Moussa Keita',
      avatar: 'MK',
      phone: '+225 05 98 76 54',
      requestDate: '09 Fév 2026',
    },
  ];

  const paymentValidations: PaymentValidation[] = [
    {
      id: '1',
      memberName: 'Kouassi Jean',
      amount: 10000,
      method: 'Cash',
      date: '10 Fév 2026',
    },
    {
      id: '2',
      memberName: 'Awa Diallo',
      amount: 15000,
      method: 'Espèces',
      date: '09 Fév 2026',
    },
  ];

  const handleAcceptRequest = (id: string) => {
    // Logic to accept request
    console.log('Accept request:', id);
  };

  const handleRejectRequest = (id: string) => {
    // Logic to reject request
    console.log('Reject request:', id);
  };

  const handleConfirmPayment = (id: string) => {
    // Logic to confirm payment
    console.log('Confirm payment:', id);
  };

  return (
    <div className="min-h-screen bg-white pb-24">{/* Added padding bottom for nav */}
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate('/tontine')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="px-3 py-1.5 bg-[#FF7900]/10 rounded-full border border-[#FF7900]/20">
            <p className="font-['Outfit'] text-xs text-[#FF7900] font-medium">
              Mode Administrateur
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-[#FF7900]/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-[#FF7900]" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900">
              Gestion du Groupe
            </h1>
            <p className="font-['Outfit'] text-sm text-gray-500">
              Tontine Entrepreneurs
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Join Requests */}
      <div className="px-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900">
            Demandes d'Adhésion
          </h2>
          {joinRequests.length > 0 && (
            <div className="w-6 h-6 rounded-full bg-[#FF7900] flex items-center justify-center">
              <span className="font-['Outfit'] text-xs font-bold text-white">
                {joinRequests.length}
              </span>
            </div>
          )}
        </div>

        {joinRequests.length > 0 ? (
          <div className="space-y-3">
            {joinRequests.map((request) => (
              <div 
                key={request.id}
                className="bg-gray-50 rounded-2xl p-4 border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center">
                      <span className="font-['Space_Grotesk'] font-bold text-white">
                        {request.avatar}
                      </span>
                    </div>
                    <div>
                      <p className="font-['Outfit'] text-gray-900 font-medium">
                        {request.name}
                      </p>
                      <p className="font-['Outfit'] text-xs text-gray-500">
                        {request.phone}
                      </p>
                    </div>
                  </div>
                  <p className="font-['Outfit'] text-xs text-gray-500">
                    {request.requestDate}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => handleAcceptRequest(request.id)}
                    className="flex-1 bg-[#009E60] text-white font-['Outfit'] py-3 px-4 rounded-xl hover:bg-[#009E60]/90 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Accepter</span>
                  </button>
                  <button 
                    onClick={() => handleRejectRequest(request.id)}
                    className="flex-1 bg-red-500 text-white font-['Outfit'] py-3 px-4 rounded-xl hover:bg-red-600 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    <span>Refuser</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-6 text-center">
            <p className="font-['Outfit'] text-sm text-gray-500">
              Aucune demande en attente
            </p>
          </div>
        )}
      </div>

      {/* Section 2: Payment Validations */}
      <div className="px-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900">
            Validations de Paiement
          </h2>
          {paymentValidations.length > 0 && (
            <div className="w-6 h-6 rounded-full bg-[#009E60] flex items-center justify-center">
              <span className="font-['Outfit'] text-xs font-bold text-white">
                {paymentValidations.length}
              </span>
            </div>
          )}
        </div>

        {paymentValidations.length > 0 ? (
          <div className="space-y-3">
            {paymentValidations.map((payment) => (
              <div 
                key={payment.id}
                className="bg-[#FF7900]/10 rounded-2xl p-4 border border-[#FF7900]/20"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="font-['Outfit'] text-gray-900 font-medium mb-1">
                      {payment.memberName}
                    </p>
                    <div className="flex items-center gap-3">
                      <p className="font-['Space_Grotesk'] font-bold text-[#FF7900]">
                        {payment.amount.toLocaleString('fr-FR')} F
                      </p>
                      <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                      <p className="font-['Outfit'] text-sm text-gray-600">
                        {payment.method}
                      </p>
                    </div>
                  </div>
                  <p className="font-['Outfit'] text-xs text-gray-500">
                    {payment.date}
                  </p>
                </div>

                <button 
                  onClick={() => handleConfirmPayment(payment.id)}
                  className="w-full bg-[#FF7900] text-white font-['Outfit'] font-medium py-3 px-4 rounded-xl hover:bg-[#FF7900]/90 transition-all active:scale-95"
                >
                  Confirmer la réception
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-6 text-center">
            <p className="font-['Outfit'] text-sm text-gray-500">
              Aucun paiement à valider
            </p>
          </div>
        )}
      </div>

      {/* Section 3: Group Settings */}
      <div className="px-6">
        <h2 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900 mb-4">
          Paramètres du Groupe
        </h2>

        <div className="space-y-3">
          <button className="w-full bg-white rounded-2xl p-4 border border-gray-200 hover:border-[#FF7900]/30 hover:bg-gray-50 transition-all active:scale-98 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Settings className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-['Outfit'] text-gray-900 font-medium">
                  Modifier les règles
                </p>
                <p className="font-['Outfit'] text-xs text-gray-500">
                  Montant, fréquence, conditions
                </p>
              </div>
            </div>
            <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
          </button>

          <button className="w-full bg-white rounded-2xl p-4 border border-gray-200 hover:border-red-300 hover:bg-red-50/30 transition-all active:scale-98 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <UserMinus className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-left">
                <p className="font-['Outfit'] text-red-600 font-medium">
                  Exclure un membre
                </p>
                <p className="font-['Outfit'] text-xs text-gray-500">
                  Retirer définitivement du groupe
                </p>
              </div>
            </div>
            <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="px-6 mt-8 mb-8">
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="font-['Outfit'] text-sm text-blue-900">
              Les décisions importantes nécessitent l'accord de la majorité des membres actifs.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}