import { ChevronLeft, Users, Send, Paperclip, MoreVertical } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { useState } from 'react';
import { BottomNavigation } from './BottomNavigation';

interface Message {
  id: string;
  type: 'user' | 'system' | 'alert';
  sender?: string;
  content: string;
  time?: string;
  isMe?: boolean;
}

export function GroupChatScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [messageText, setMessageText] = useState('');

  const messages: Message[] = [
    {
      id: '1',
      type: 'system',
      content: '✅ Moussa a payé sa cotisation (10.000F).',
    },
    {
      id: '2',
      type: 'user',
      sender: 'Fatou K.',
      content: 'Parfait ! Merci Moussa 👏',
      time: '14:32',
      isMe: false,
    },
    {
      id: '3',
      type: 'user',
      sender: 'Ibrahim S.',
      content: "J'ai bien reçu la notification",
      time: '14:35',
      isMe: false,
    },
    {
      id: '4',
      type: 'alert',
      content: '⚠️ Rappel : Cotisation due demain.',
    },
    {
      id: '5',
      type: 'user',
      sender: 'Moi',
      content: 'Merci pour le virement !',
      time: '15:20',
      isMe: true,
    },
    {
      id: '6',
      type: 'user',
      sender: 'Amadou B.',
      content: 'De rien 😊 Tout est ok ?',
      time: '15:22',
      isMe: false,
    },
    {
      id: '7',
      type: 'user',
      sender: 'Moi',
      content: 'Oui parfait, merci encore',
      time: '15:23',
      isMe: true,
    },
  ];

  const handleSendMessage = () => {
    if (messageText.trim()) {
      // Logic to send message would go here
      setMessageText('');
    }
  };

  const renderMessage = (message: Message) => {
    if (message.type === 'system') {
      return (
        <div key={message.id} className="flex justify-center mb-4">
          <div className="bg-[#009E60]/10 rounded-full px-5 py-2.5 max-w-[85%] border border-[#009E60]/20">
            <p className="font-['Outfit'] text-sm text-[#009E60] text-center">
              {message.content}
            </p>
          </div>
        </div>
      );
    }

    if (message.type === 'alert') {
      return (
        <div key={message.id} className="flex justify-center mb-4">
          <div className="bg-[#FF7900]/10 rounded-full px-5 py-2.5 max-w-[85%] border border-[#FF7900]/20">
            <p className="font-['Outfit'] text-sm text-[#FF7900] text-center">
              {message.content}
            </p>
          </div>
        </div>
      );
    }

    if (message.type === 'user') {
      if (message.isMe) {
        return (
          <div key={message.id} className="flex justify-end mb-4">
            <div className="flex flex-col items-end max-w-[75%]">
              <div className="bg-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm border border-gray-100">
                <p className="font-['Outfit'] text-gray-900">{message.content}</p>
              </div>
              <span className="font-['Outfit'] text-xs text-gray-500 mt-1">
                {message.time}
              </span>
            </div>
          </div>
        );
      } else {
        return (
          <div key={message.id} className="flex justify-start mb-4">
            <div className="flex flex-col items-start max-w-[75%]">
              <p className="font-['Outfit'] text-xs text-gray-600 mb-1 ml-1">
                {message.sender}
              </p>
              <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
                <p className="font-['Outfit'] text-gray-900">{message.content}</p>
              </div>
              <span className="font-['Outfit'] text-xs text-gray-500 mt-1">
                {message.time}
              </span>
            </div>
          </div>
        );
      }
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="px-6 pt-12 pb-4 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button 
              onClick={() => navigate('/tontine')}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            
            <div className="flex items-center gap-3 flex-1">
              <div className="w-12 h-12 rounded-full bg-[#FF7900] flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-['Space_Grotesk'] font-bold text-lg text-gray-900 truncate">
                  Tontine Entrepreneurs
                </h1>
                <p className="font-['Outfit'] text-sm text-gray-500">
                  12 Membres
                </p>
              </div>
            </div>
          </div>
          
          <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
            <MoreVertical className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 bg-gray-50/30">
        <div className="space-y-2">
          {messages.map(renderMessage)}
        </div>
      </div>

      {/* Input Area */}
      <div className="px-6 py-4 bg-white border-t border-gray-100 pb-24">
        <div className="flex items-end gap-2">
          <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
            <Paperclip className="w-5 h-5 text-gray-600" />
          </button>
          
          <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3">
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Écrire un message..."
              className="w-full bg-transparent font-['Outfit'] text-gray-900 placeholder:text-gray-500 outline-none"
            />
          </div>
          
          <button 
            onClick={handleSendMessage}
            className="w-12 h-12 rounded-full bg-[#FF7900] flex items-center justify-center hover:bg-[#FF7900]/90 transition-all active:scale-95 flex-shrink-0 shadow-lg"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}