
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { createClient, AnamClient } from '@anam-ai/js-sdk';

interface SommelierUIProps {
  onEnd: () => void;
}

const SommelierUI: React.FC<SommelierUIProps> = ({ onEnd }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [transcript, setTranscript] = useState("");
  
  const anamClientRef = useRef<AnamClient | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<any>(null);
  const chatRef = useRef<any>(null);

  const PERSONA_ID = "19d18eb0-5346-4d50-a77f-26b3723ed79d"; // Avatar: Richard
  const VOICE_ID = "6bfbe25a-979d-40f3-a92b-5394170af54b";

  const systemInstruction = `
    Eres 'Arturo', un Sommelier de Carnes de 60 años, dueño de 'The Prime Cut'.
    Tu apariencia actual es la de un hombre distinguido llamado Richard.
    Eres un experto absoluto en carnes argentinas y de exportación.

    CARÁCTER:
    - Distinguido, culto y sumamente respetuoso.
    - Hablas con la autoridad de décadas de experiencia.
    - Usas siempre 'Usted'.
    - Tu objetivo es guiar al cliente en la elección del corte perfecto, punto de cocción y maridaje.

    INSTRUCCIÓN TÉCNICA:
    - Mantén tus respuestas concisas y elegantes (máximo 3-4 frases por intervención) para que la fluidez con el avatar sea óptima.
  `;

  useEffect(() => {
    const initEngines = async () => {
      try {
        // 1. Inicializar Anam Client
        // Nota: Se asume que ANAM_API_KEY está disponible en el entorno o se usa la del usuario.
        // Como las reglas dictan usar process.env para llaves, usaremos la lógica de Anam aquí.
        const anamApiKey = (process.env as any).ANAM_API_KEY || "";
        
        anamClientRef.current = createClient({
          apiKey: anamApiKey,
          disableAudio: false, // Queremos que Anam maneje el audio del avatar
        });

        // Eventos de Anam
        anamClientRef.current.on('connectionStateChange', (state) => {
          console.log("Anam State:", state);
          if (state === 'connected') setIsInitializing(false);
        });

        anamClientRef.current.on('messageReceived', (msg) => {
          if (msg.type === 'is_speaking') setIsSpeaking(msg.is_speaking);
        });

        // 2. Inicializar Gemini
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
        aiRef.current = ai;
        chatRef.current = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: { systemInstruction }
        });

        // 3. Iniciar sesión de Anam
        if (videoContainerRef.current) {
          await anamClientRef.current.start({
            personaId: PERSONA_ID,
            voiceId: VOICE_ID,
          });
          // El SDK de Anam inyecta el video automáticamente si se configura o podemos pedir el elemento.
          const videoElement = anamClientRef.current.getVideoElement();
          if (videoElement) {
            videoElement.className = "w-full h-full object-cover rounded-[80px]";
            videoContainerRef.current.appendChild(videoElement);
          }
        }
      } catch (err) {
        console.error("Error inicializando Arturo/Anam:", err);
        onEnd();
      }
    };

    initEngines();

    return () => {
      anamClientRef.current?.stop();
    };
  }, []);

  const handleUserInput = async (text: string) => {
    if (!chatRef.current || !anamClientRef.current) return;
    
    setTranscript("");
    try {
      const result = await chatRef.current.sendMessageStream({ message: text });
      let fullResponse = "";
      
      for await (const chunk of result) {
        const textChunk = chunk.text || "";
        fullResponse += textChunk;
        setTranscript(prev => prev + textChunk);
      }
      
      // Enviamos el texto completo a Anam para que Richard lo diga
      anamClientRef.current.talk(fullResponse);
    } catch (err) {
      console.error("Gemini Error:", err);
    }
  };

  // Escucha de voz simple para enviar a Gemini
  // En un entorno de producción, usaríamos STT continuo, aquí simulamos con un input o botón
  const [inputValue, setInputValue] = useState("");

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
      
      {/* BACKGROUND DEPTH LAYER */}
      <div className="absolute inset-0 z-0 opacity-40">
         <video autoPlay muted loop playsInline className="w-full h-full object-cover grayscale-[30%]">
            <source src="https://assets.mixkit.co/videos/preview/mixkit-close-up-of-burning-coals-in-a-fire-40244-large.mp4" type="video/mp4" />
         </video>
         <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black"></div>
      </div>

      {/* AVATAR CONTAINER (RICHARD BY ANAM) */}
      <div className="relative z-10 w-full max-w-5xl h-[80vh] flex flex-col items-center">
        
        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/80 backdrop-blur-md rounded-[80px]">
             <div className="w-16 h-16 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mb-6"></div>
             <p className="serif text-2xl text-amber-500 animate-pulse tracking-widest uppercase">Preparando la Boutique...</p>
          </div>
        )}

        <div className="relative w-[340px] h-[550px] md:w-[700px] md:h-[800px] transition-all duration-1000">
          {/* Anam Video Container */}
          <div 
            ref={videoContainerRef}
            id="anam-video-container"
            className="w-full h-full rounded-[80px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] bg-stone-900 border border-white/5"
          >
            {/* El video de Anam se inyectará aquí */}
          </div>

          {/* Luxury Floating Label */}
          <div className="absolute bottom-12 left-12 right-12 text-left pointer-events-none">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-[1px] bg-amber-600"></div>
              <span className="text-amber-600 text-[10px] tracking-[0.5em] uppercase font-black">Sommelier Boutique</span>
            </div>
            <h2 className="serif text-7xl md:text-9xl text-stone-100 font-bold tracking-tighter leading-none">Arturo</h2>
            <p className="text-stone-400 text-xs md:text-sm tracking-[0.3em] font-light uppercase opacity-60 mt-2">Personalidad: Richard | The Prime Cut</p>
          </div>
        </div>

        {/* INPUT INTERFACE */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl">
           <div className="bg-stone-900/95 backdrop-blur-3xl border border-white/10 p-4 rounded-[2.5rem] shadow-2xl flex flex-col gap-4">
              
              {/* Transcript Preview */}
              {transcript && (
                <div className="px-6 py-2 text-stone-400 text-sm italic serif border-l-2 border-amber-800/50 line-clamp-2">
                  "{transcript}"
                </div>
              )}

              <div className="flex items-center gap-4">
                <input 
                  type="text"
                  placeholder="Hágale una pregunta a Arturo..."
                  className="flex-1 bg-black/40 border border-white/5 rounded-full px-8 py-4 text-stone-200 focus:outline-none focus:border-amber-600/50 transition-all placeholder:text-stone-600"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inputValue.trim()) {
                      handleUserInput(inputValue);
                      setInputValue("");
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    if (inputValue.trim()) {
                      handleUserInput(inputValue);
                      setInputValue("");
                    }
                  }}
                  className={`p-4 rounded-full transition-all ${isSpeaking ? 'bg-amber-600 animate-pulse' : 'bg-stone-800 hover:bg-amber-700'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center justify-center gap-6 pb-2">
                 <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`}></div>
                   <span className="text-[9px] uppercase tracking-widest text-stone-500 font-bold">
                     {isSpeaking ? 'Arturo está hablando' : 'Arturo lo escucha'}
                   </span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* FOOTER CTA */}
      <div className="mt-32 text-center z-20">
         <button onClick={onEnd} className="text-stone-700 hover:text-amber-800 transition-all uppercase tracking-[0.8em] text-[9px] font-black border-b border-transparent hover:border-amber-900 pb-1">
           Finalizar Audiencia Privada
         </button>
      </div>
    </div>
  );
};

export default SommelierUI;
