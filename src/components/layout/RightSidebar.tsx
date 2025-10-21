'use client';

import { MessageSquare, Plus, Send } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
}

interface RightSidebarProps {
  messages: Message[];
  onSendMessage?: (message: string) => void;
}

export default function RightSidebar({ 
  messages,
  onSendMessage
}: RightSidebarProps) {
  const { data: session } = useSession();
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 새 메시지가 올 때마다 스크롤을 맨 아래로 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 메시지 전송 함수
  const handleSendMessage = () => {
    if (newMessage.trim() && onSendMessage) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
      inputRef.current?.focus();
    }
  };

  // Enter 키로 메시지 전송
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 현재 사용자인지 확인
  const isCurrentUser = (senderName: string) => {
    return session?.user?.name === senderName;
  };
  return (
    <div className="w-full h-full bg-white shadow-lg flex flex-col overflow-hidden">
      {/* 상단 빈 공간 (나중에 추가 기능용) */}
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Plus className="h-8 w-8" />
          </div>
          <p className="text-sm">추가 기능 예정</p>
        </div>
      </div>

      {/* 실시간 채팅 (하단 50%) */}
      <div className="h-1/2 border-t border-gray-200 p-4 flex flex-col">
        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
          <MessageSquare className="h-4 w-4 mr-2" />
          팀 채팅
        </h4>
        
        {/* 메시지 목록 */}
        <div className="flex-1 space-y-2 overflow-y-auto mb-3 pr-1">
          {messages.map((message) => {
            const isMe = isCurrentUser(message.sender);
            return (
              <div key={message.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex ${isMe ? 'flex-row-reverse' : 'flex-row'} space-x-2 max-w-[85%]`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isMe ? 'bg-blue-600 ml-2' : 'bg-gray-500 mr-2'
                  }`}>
                    <span className="text-white text-xs">{message.sender.charAt(0)}</span>
                  </div>
                  <div className={`flex-1 min-w-0 ${isMe ? 'mr-2' : 'ml-2'}`}>
                    {!isMe && (
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-medium text-gray-900 truncate">{message.sender}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">
                          {format(message.timestamp, 'HH:mm')}
                        </span>
                      </div>
                    )}
                    <div className={`rounded-lg p-2 ${
                      isMe 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      <p className="text-xs break-words">{message.content}</p>
                      {isMe && (
                        <div className="text-right mt-1">
                          <span className="text-xs text-blue-100">
                            {format(message.timestamp, 'HH:mm')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        
        {/* 메시지 입력 */}
        <div className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!session}
          />
          <button 
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || !session}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-1"
          >
            <Send className="h-3 w-3" />
            <span className="hidden sm:inline">전송</span>
          </button>
        </div>
        
        {/* 로그인 안내 */}
        {!session && (
          <div className="mt-2 text-center text-xs text-gray-500">
            채팅을 사용하려면 로그인이 필요합니다
          </div>
        )}
      </div>
    </div>
  );
}