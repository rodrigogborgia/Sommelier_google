
import React, { useState } from 'react';
import { ConnectionStatus } from './types';
import SommelierUI from './components/SommelierUI';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.IDLE);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus(ConnectionStatus.CONNECTED);
    } catch (err: any) {
      console.error("Failed to start session:", err);
      setError("Se requiere acceso al micrófono para conversar con Arturo.");
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const handleEnd = () => {
    setStatus(ConnectionStatus.IDLE);
    setError(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#0c0a09] overflow-hidden relative">
      {/* Background Living Elements */}
      <div className="absolute inset-0 z-0">
        <video 
          autoPlay 
          muted 
          loop 
          playsInline
          className="w-full h-full object-cover opacity-30 grayscale-[50%]"
        >
          <source src="https://assets.mixkit.co/videos/preview/mixkit-close-up-of-burning-coals-in-a-fire-40244-large.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0a09] via-transparent to-[#0c0a09]"></div>
      </div>
      
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 z-10">
        {status === ConnectionStatus.IDLE || status === ConnectionStatus.ERROR ? (
          <div className="text-center space-y-12 animate-fade-in max-w-2xl">
            <div className="space-y-4">
              <h2 className="text-amber-600 font-semibold tracking-[0.4em] uppercase text-xs md:text-sm">Experiencia de Selección Premium</h2>
              <h1 className="serif text-6xl md:text-8xl text-stone-100 font-bold leading-none">Arturo</h1>
              <p className="text-xl md:text-2xl text-stone-500 font-light italic tracking-wide">Sommelier de Carnes & Fundador</p>
            </div>
            
            <div className="relative group inline-block">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-900 to-amber-700 rounded-xl blur opacity-25 group-hover:opacity-60 transition duration-1000"></div>
              <button
                onClick={handleStart}
                className="relative bg-stone-200 text-stone-950 px-16 py-8 rounded-xl text-xl font-bold hover:bg-white transition-all transform active:scale-95 shadow-2xl tracking-widest uppercase"
              >
                Iniciar Consulta
              </button>
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-900/50 text-red-400 px-6 py-3 rounded-lg text-sm font-medium">
                {error}
              </div>
            )}
            
            <p className="text-stone-600 text-[10px] max-w-xs mx-auto pt-12 border-t border-stone-800/50 tracking-[0.2em] uppercase">
              The Prime Cut Boutique &bull; Buenos Aires, Argentina
            </p>
          </div>
        ) : (
          <SommelierUI onEnd={handleEnd} />
        )}
      </main>

      <footer className="h-20 flex items-center justify-center border-t border-stone-800/30 z-20 bg-black/60 backdrop-blur-xl">
        <p className="text-stone-600 text-[10px] tracking-[0.5em] uppercase font-black">Digital Presence by Gemini Live</p>
      </footer>
    </div>
  );
};

export default App;
