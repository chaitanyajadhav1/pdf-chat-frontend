'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Upload, Package, FileText, User, LogOut, Loader2, X, CheckCircle, AlertCircle, Paperclip, FileCheck } from 'lucide-react';

const API_URL = 'http://localhost:8000';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: any[];
  showUploadPrompt?: boolean;
}

export default function FreightChatPro() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState('');
  const [token, setToken] = useState('');
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [showUploadUI, setShowUploadUI] = useState(false);
  const [shipmentData, setShipmentData] = useState<any>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAuth = async (isLogin: boolean) => {
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload: any = { userId };
      if (!isLogin) payload.name = userName || userId;

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok) {
        setToken(data.token);
        setUserName(data.user.name);
        setIsAuthenticated(true);
        setDocuments(data.user?.documents || []);
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch {
      alert('Connection error. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setToken('');
    setUserId('');
    setUserName('');
    setMessages([]);
    setThreadId(null);
    setDocuments([]);
    setSelectedFile(null);
    setShowUploadUI(false);
  };

  const startShippingSession = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/agent/shipping/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      if (response.ok) {
        setThreadId(data.threadId);
        setCurrentPhase(data.currentPhase);
        setMessages([{ role: 'assistant', content: data.message, timestamp: new Date().toISOString() }]);
      } else {
        alert(data.error || 'Failed to start session');
      }
    } catch {
      alert('Failed to connect to agent');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append('pdf', selectedFile);
      formData.append('strategy', 'user');

      const response = await fetch(`${API_URL}/upload/pdf`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        const uploadedDoc = { 
          filename: data.filename, 
          uploadedAt: new Date().toISOString(),
          documentId: data.documentId 
        };
        setDocuments(prev => [...prev, uploadedDoc]);
        
        // Add system message about upload
        setMessages(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `✓ Perfect! I've analyzed your document "${data.filename}". This will help me provide more accurate quotes. Let me continue gathering the remaining details...`, 
            timestamp: new Date().toISOString(),
            attachments: [uploadedDoc]
          }
        ]);
        
        setSelectedFile(null);
        setShowUploadUI(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch {
      alert('Upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

  const continueAfterUpload = async () => {
    if (!threadId) return;
    
    try {
      const response = await fetch(`${API_URL}/agent/shipping/message`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          threadId, 
          message: '[DOCUMENT_UPLOADED]',
          hasDocument: true 
        })
      });

      const data = await response.json();
      if (response.ok && data.message) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.message, 
          timestamp: new Date().toISOString() 
        }]);
        if (data.currentPhase) setCurrentPhase(data.currentPhase);
        if (data.shipmentData) setShipmentData(data.shipmentData);
      }
    } catch (err) {
      console.error('Continue after upload error:', err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !threadId) return;

    const userMessage: Message = { 
      role: 'user', 
      content: input, 
      timestamp: new Date().toISOString() 
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/agent/shipping/message`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          threadId, 
          message: input,
          hasDocument: documents.length > 0
        })
      });

      const data = await response.json();
      if (response.ok) {
        const assistantMessage: Message = { 
          role: 'assistant', 
          content: data.message, 
          timestamp: new Date().toISOString() 
        };

        // Check if we should show upload prompt
        if (data.currentPhase === 'cargo_collection' || data.currentPhase === 'finalizing') {
          if (documents.length === 0) {
            assistantMessage.showUploadPrompt = true;
            setShowUploadUI(true);
          }
        }

        setMessages(prev => [...prev, assistantMessage]);
        if (data.currentPhase) setCurrentPhase(data.currentPhase);
        if (data.shipmentData) setShipmentData(data.shipmentData);
      } else {
        alert(data.error || 'Failed to send message');
      }
    } catch {
      alert('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const skipUpload = () => {
    setShowUploadUI(false);
    setMessages(prev => [
      ...prev,
      { 
        role: 'assistant', 
        content: "No problem! I'll proceed with the information you've provided.", 
        timestamp: new Date().toISOString() 
      }
    ]);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-indigo-100">
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Package className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">FreightChat Pro</h1>
            <p className="text-gray-600">AI-Powered Shipping Intelligence</p>
          </div>
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="User ID" 
              value={userId} 
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            <input 
              type="text" 
              placeholder="Name (optional for register)" 
              value={userName} 
              onChange={(e) => setUserName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            <div className="flex gap-3">
              <button 
                onClick={() => handleAuth(true)} 
                className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-3 rounded-xl hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md hover:shadow-lg font-medium"
              >
                Login
              </button>
              <button 
                onClick={() => handleAuth(false)} 
                className="flex-1 bg-gray-600 text-white py-3 rounded-xl hover:bg-gray-700 transition-all shadow-md hover:shadow-lg font-medium"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-2 rounded-xl shadow-md">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">FreightChat Pro</h1>
              <p className="text-xs text-gray-600">AI Agent • Phase: {currentPhase || 'Ready'}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {documents.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                <FileCheck className="w-4 h-4" />
                <span>{documents.length} doc(s)</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 px-4 py-2 rounded-lg">
              <User className="w-4 h-4 text-indigo-600" />
              <span className="font-medium">{userName}</span>
            </div>
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          {!threadId ? (
            <div className="p-12 text-center">
              <div className="bg-gradient-to-br from-indigo-100 to-purple-100 w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Package className="w-12 h-12 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to Ship?</h2>
              <p className="text-gray-600 mb-6">Start a conversation with our AI agent to get instant freight quotes</p>
              <button 
                onClick={startShippingSession} 
                disabled={loading}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all font-medium"
              >
                {loading ? 'Starting...' : 'Start Shipping Session'}
              </button>
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div className="h-[500px] overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white">
                {messages.map((msg, i) => (
                  <div key={i}>
                    <div className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : 'order-1'}`}>
                        <div className={`px-5 py-3 rounded-2xl shadow-md ${
                          msg.role === 'user' 
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' 
                            : 'bg-white border border-gray-200 text-gray-800'
                        }`}>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-300 flex items-center gap-2 text-sm opacity-90">
                              <FileText className="w-4 h-4" />
                              <span>{msg.attachments[0].filename}</span>
                            </div>
                          )}
                        </div>
                        <div className={`text-xs text-gray-500 mt-1 px-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    
                    {/* Upload Prompt Card - Shows right after certain assistant messages */}
                    {msg.role === 'assistant' && msg.showUploadPrompt && showUploadUI && (
                      <div className="mb-4 flex justify-start">
                        <div className="max-w-[85%] bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-5 shadow-lg">
                          <div className="flex items-start gap-3 mb-4">
                            <div className="bg-blue-600 p-2 rounded-lg">
                              <Upload className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-bold text-gray-900 mb-1">Upload Invoice or Bill of Lading</h3>
                              <p className="text-sm text-gray-700 mb-3">
                                For more accurate quotes, you can upload your shipping documents (invoice, commercial invoice, packing list, or bill of lading). The AI will extract details automatically.
                              </p>
                              
                              {!selectedFile ? (
                                <div className="space-y-3">
                                  <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                    accept="application/pdf"
                                    className="hidden"
                                  />
                                  <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 font-medium"
                                  >
                                    <Paperclip className="w-5 h-5" />
                                    Choose Document (PDF)
                                  </button>
                                  <button
                                    onClick={skipUpload}
                                    className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-all text-sm"
                                  >
                                    Skip - Continue without document
                                  </button>
                                </div>
                              ) : (
                                <div className="bg-white rounded-lg p-3 border border-blue-200">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 flex-1">
                                      <FileText className="w-5 h-5 text-blue-600" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
                                        <p className="text-xs text-gray-600">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={() => {
                                        setSelectedFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                      }}
                                      className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={handleFileUpload} 
                                      disabled={uploadingFile}
                                      className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium transition-all flex items-center justify-center gap-2"
                                    >
                                      {uploadingFile ? (
                                        <>
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                          Analyzing...
                                        </>
                                      ) : (
                                        <>
                                          <Upload className="w-4 h-4" />
                                          Upload & Analyze
                                        </>
                                      )}
                                    </button>
                                    <button
                                      onClick={skipUpload}
                                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                                    >
                                      Skip
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start mb-4">
                    <div className="bg-white border border-gray-200 px-5 py-3 rounded-2xl shadow-md">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Type your message..."
                    disabled={showUploadUI && !selectedFile}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  <button 
                    onClick={sendMessage} 
                    disabled={loading || !input.trim() || (showUploadUI && !selectedFile)}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2 shadow-md hover:shadow-lg transition-all flex-shrink-0"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}