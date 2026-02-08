
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ConnectionStatus } from './types';
import SommelierUI from './components/SommelierUI';
import { GoogleGenAI } from '@google/genai';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.IDLE);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      // Check for microphone permissions
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus(ConnectionStatus.CONNECTED);
    } catch (err: any) {
      console.error("Failed to start session:", err);
      setError("Microphone access is required to talk to Arturo.");
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const handleEnd = () => {
    setStatus(ConnectionStatus.IDLE);
    setError(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#0c0a09] overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center mix-blend-overlay"></div>
      
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 z-10">
        {status === ConnectionStatus.IDLE || status === ConnectionStatus.ERROR ? (
          <div className="text-center space-y-8 animate-fade-in max-w-2xl">
            <div className="space-y-2">
              <h2 className="text-amber-600 font-semibold tracking-widest uppercase text-sm md:text-base">Artisanal Butcher Experience</h2>
              <h1 className="serif text-5xl md:text-7xl text-stone-100 font-bold leading-tight">Arturo</h1>
              <p className="text-xl md:text-2xl text-stone-400 font-light italic">Your Personal Meat Sommelier</p>
            </div>
            
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-900 to-amber-700 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
              <button
                onClick={handleStart}
                className="relative bg-stone-100 text-stone-950 px-12 py-6 rounded-full text-xl font-bold hover:bg-white transition-all transform active:scale-95 shadow-2xl"
              >
                Welcome a Guest
              </button>
            </div>

            {error && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-400 px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            <p className="text-stone-500 text-sm max-w-md mx-auto pt-8 border-t border-stone-800">
              Perfect cuts, expert advice, and a passion for steak. Arturo is here to guide your culinary journey.
            </p>
          </div>
        ) : (
          <SommelierUI onEnd={handleEnd} />
        )}
      </main>

      {/* Totem Footer Brand */}
      <footer className="h-16 flex items-center justify-center border-t border-stone-800/50 z-20 bg-stone-950/50 backdrop-blur-md">
        <p className="text-stone-600 text-xs tracking-[0.2em] uppercase font-bold">The Prime Cut &bull; Digital Sommelier Series</p>
      </footer>
    </div>
  );
};

export default App;
