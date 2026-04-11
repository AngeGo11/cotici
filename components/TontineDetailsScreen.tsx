import { ChevronLeft, Users, Calendar, TrendingUp, MessageCircle, Check, Clock, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BottomNavigation } from './BottomNavigation';

interface Member {
  id: string;
  name: string;
  avatar: string;
  status: 'paid' | 'current' | 'late';
  amount?: number;
  turn?: number;
}

export function TontineDetailsScreen() {
  const navigate = useNavigate();

  const members: Member[] = [
    { id: '1', name: 'Marie Koné', avatar: 'MK', status: 'paid', amount: 10000, turn: 1 },
    { id: '2', name: 'Jean Diabaté', avatar: 'JD', status: 'paid', amount: 10000, turn: 2 },
    { id: '3', name: 'Fatou Touré', avatar: 'FT', status: 'current', amount: 10000, turn: 3 },
    { id: '4', name: 'Amadou Bamba', avatar: 'AB', status: 'late', amount: 10000, turn: 4 },
    { id: '5', name: 'Aya Kouassi', avatar: 'AK', status: 'paid', amount: 10000, turn: 5 },
    { id: '6', name: 'Ibrahim Sanogo', avatar: 'IS', status: 'paid', amount: 10000, turn: 6 },
    { id: '7', name: 'Adjoua N\'Guessan', avatar: 'AN', status: 'paid', amount: 10000, turn: 7 },
    { id: '8', name: 'Youssouf Doumbia', avatar: 'YD', status: 'paid', amount: 10000, turn: 8 },
  ];

  const getStatusConfig = (status: Member['status']) => {
    switch (status) {
      case 'paid':
        return {
          icon: <Check className="w-4 h-4 text-[#009E60]" />,
          text: 'Payé',
          textColor: 'text-[#009E60]',
          bgColor: 'bg-[#009E60]/10',
          borderColor: 'border-[#009E60]/20',
        };
      case 'current':
        return {
          icon: <Clock className="w-4 h-4 text-[#FF7900]" />,
          text: 'En attente',
          textColor: 'text-[#FF7900]',
          bgColor: 'bg-[#FF7900]/10',
          borderColor: 'border-[#FF7900]/20',
        };
      case 'late':
        return {
          icon: <AlertCircle className="w-4 h-4 text-red-500" />,
          text: 'Retard',
          textColor: 'text-red-500',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-100',
        };
    }
  };

  const paidCount = members.filter(m => m.status === 'paid').length;
  const totalAmount = members.reduce((sum, m) => sum + (m.amount || 0), 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate('/home')}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate('/admin')}
              className="font-['Outfit'] text-sm text-[#009E60] hover:underline"
            >
              Admin
            </button>
            <div className="w-1 h-1 rounded-full bg-gray-300"></div>
            <button 
              onClick={() => navigate('/chat')}
              className="font-['Outfit'] text-sm text-[#FF7900] hover:underline flex items-center gap-1"
            >
              <MessageCircle className="w-4 h-4" />
              Discussion
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-[#FF7900] flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900">
              Tontine Famille
            </h1>
            <p className="font-['Outfit'] text-sm text-gray-500">
              Tour 3 sur 12
            </p>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="px-6 mb-6">
        <div className="bg-[#009E60]/10 rounded-3xl p-5 border border-[#009E60]/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-['Outfit'] text-xs text-gray-600 mb-1">Cotisation mensuelle</p>
              <p className="font-['Space_Grotesk'] font-bold text-2xl text-gray-900">
                {totalAmount.toLocaleString('fr-FR')} <span className="text-base">FCFA</span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-['Outfit'] text-xs text-gray-600 mb-1">Progression</p>
              <p className="font-['Space_Grotesk'] font-bold text-xl text-[#009E60]">
                {paidCount}/{members.length}
              </p>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-[#009E60] h-2 rounded-full transition-all duration-500"
              style={{ width: `${(paidCount / members.length) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="px-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-['Space_Grotesk'] font-bold text-xl text-gray-900">
            Membres (8)
          </h3>
          <button 
            onClick={() => navigate('/admin')}
            className="font-['Outfit'] text-sm text-[#FF7900] hover:underline"
          >
            Gérer
          </button>
        </div>

        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#FF7900] flex items-center justify-center">
                  <span className="text-white font-['Space_Grotesk'] font-bold text-sm">
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div>
                  <p className="font-['Outfit'] text-gray-900 font-medium">{member.name}</p>
                  <p className="font-['Outfit'] text-xs text-gray-500">Tour {member.turn}</p>
                </div>
              </div>
              <div>
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-['Outfit'] font-medium ${
                  member.status === 'Payé'
                    ? 'bg-[#009E60]/10 text-[#009E60]'
                    : member.status === 'En attente'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {member.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Pay Button */}
        <button 
          onClick={() => navigate('/make-deposit')}
          className="w-full mt-6 bg-[#FF7900] text-white font-['Outfit'] font-medium py-4 px-6 rounded-2xl shadow-lg hover:bg-[#FF7900]/90 transition-all active:scale-95"
        >
          Payer ma cotisation
        </button>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}