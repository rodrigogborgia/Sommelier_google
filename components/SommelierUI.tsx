import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import StreamingAvatar from '@heygen/streaming-avatar';

interface SommelierUIProps {
  onEnd: () => void;
}

const SommelierUI: React.FC<SommelierUIProps> = ({ onEnd }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loadingStep, setLoadingStep] = useState("Iniciando motores...");
  const [transcript, setTranscript] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [initError, setInitError] = useState<string | null>(null);
  
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const mediaStreamRef = useRef<HTMLVideoElement | null>(null);
  const chatRef = useRef<any>(null);

  // Arturo: Configuración de Identidad (Avatar Solicitado)
  const AVATAR_ID = "Dexter_Lawyer_Sitting_public"; 
  const VOICE_ID = "2d5b0e6cfbd345519a4f83e300c30c31"; 

  // Clave de HeyGen proporcionada por el usuario
  const HEYGEN_KEY = "sk_V2_hgu_ke1hcy8nne5_ivCK5VXheZNPbgEdmUoRaXNs9pMgvBC9";

  const systemInstruction = `
    Eres 'Arturo', un Sommelier de Carnes de 60 años, dueño de 'The Prime Cut' en Buenos Aires.
    Eres un caballero extremadamente culto, distinguido y apasionado por la excelencia.
    
    COMPORTAMIENTO:
    - Hablas con un léxico refinado. Usas siempre 'Usted'.
    - Eres un experto absoluto en cortes argentinos (Ojo de Bife, Entraña, Vacío, Achuras).
    - Tus respuestas deben ser breves (máx 35 palabras) para que el avatar fluya con elegancia.
    - No solo vendes carne, vendes una experiencia sensorial.
  `;

  const fetchAccessToken = async (apiKey: string) => {
    try {
      const response = await fetch('https://api.heygen.com/v1/streaming.create_token', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Error del servidor (${response.status})`);
      }

      const res = await response.json();
      if (!res.data || !res.data.token) {
        throw new Error("La respuesta de HeyGen no contiene un token válido.");
      }
      return res.data.token;
    } catch (error: any) {
      console.error("Error fetching access token:", error);
      throw new Error("Fallo en autenticación: " + (error.message || "Verifique su clave de HeyGen."));
    }
  };

  useEffect(() => {
    let active = true;

    const initArturo = async () => {
      try {
        setLoadingStep("Validando credenciales...");
        
        // Priorizar clave de entorno, si no usar la proporcionada
        const heygenApiKey = (process.env as any).HEYGEN_API_KEY || HEYGEN_KEY;
        const geminiApiKey = process.env.API_KEY || "";

        if (!heygenApiKey) {
           throw new Error("No se ha configurado la HEYGEN_API_KEY.");
        }

        // 1. Obtener Token de Sesión
        const sessionToken = await fetchAccessToken(heygenApiKey);

        if (!active) return;

        // 2. Inicializar HeyGen con el Token
        avatarRef.current = new StreamingAvatar({
          token: sessionToken,
        });

        avatarRef.current.on('stream_ready', (event: any) => {
          if (mediaStreamRef.current && event.detail) {
            mediaStreamRef.current.srcObject = event.detail;
            mediaStreamRef.current.onloadedmetadata = () => {
              mediaStreamRef.current?.play().catch(console.error);
              if (active) setIsInitializing(false);
            };
          }
        });

        avatarRef.current.on('avatar_start_talking', () => setIsSpeaking(true));
        avatarRef.current.on('avatar_stop_talking', () => setIsSpeaking(false));
        avatarRef.current.on('stream_disconnected', () => {
          console.warn("Avatar stream disconnected");
        });

        // 3. Inicializar Gemini para la inteligencia
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        chatRef.current = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: { systemInstruction }
        });

        setLoadingStep("Invocando a Arturo...");

        // 4. Iniciar Sesión de Avatar
        // Corregido: Algunos SDKs de HeyGen requieren avatar_id y voice_id en snake_case para evitar el error 400.
        // También incluimos avatarName por si acaso para mayor robustez.
        await avatarRef.current.createStartAvatar({
          avatarName: AVATAR_ID, 
          quality: 'medium',
          voice: {
            voiceId: VOICE_ID,
          },
        } as any);

      } catch (err: any) {
        console.error("Arturo Init Error Details:", err);
        if (active) {
          setInitError(err.message || "Error al inicializar la sesión de Arturo. Revise la consola para más detalles.");
        }
      }
    };

    initArturo();

    return () => {
      active = false;
      if (avatarRef.current) {
        avatarRef.current.stopAvatar().catch(console.error);
      }
    };
  }, []);

  const handleUserInput = async (text: string) => {
    if (!chatRef.current || !avatarRef.current || isSpeaking) return;
    
    setTranscript("");
    setInputValue("");
    try {
      const result = await chatRef.current.sendMessageStream({ message: text });
      let fullResponse = "";
      
      for await (const chunk of result) {
        const textChunk = chunk.text || "";
        fullResponse += textChunk;
        setTranscript(prev => prev + textChunk);
      }
      
      if (fullResponse.trim()) {
        await avatarRef.current.speak({
          text: fullResponse,
          task_type: "TALK"
        } as any);
      }
    } catch (err) {
      console.error("Interaction error:", err);
      setTranscript("Mil disculpas, caballero. He tenido un breve desliz mental. ¿Podría repetirme su consulta?");
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden px-4">
      {/* Fondo cinemático */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
         <video autoPlay muted loop playsInline className="w-full h-full object-cover grayscale brightness-50">
            <source src="https://assets.mixkit.co/videos/preview/mixkit-close-up-of-burning-coals-in-a-fire-40244-large.mp4" type="video/mp4" />
         </video>
         <div className="absolute inset-0 bg-gradient-to-t from-[#0c0a09] via-transparent to-[#0c0a09]"></div>
      </div>

      <div className="relative z-10 w-full max-w-5xl h-[75vh] md:h-[85vh] flex flex-col items-center">
        {(isInitializing || initError) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-[#0c0a09]/98 backdrop-blur-3xl rounded-[40px] md:rounded-[80px] border border-white/5 text-center p-8">
             {initError ? (
               <div className="animate-fade-in space-y-6">
                 <div className="w-20 h-20 bg-red-950/20 border border-red-500/30 rounded-full flex items-center justify-center mx-auto shadow-2xl">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                   </svg>
                 </div>
                 <div className="space-y-2">
                   <h3 className="serif text-2xl text-stone-100 uppercase tracking-widest">Aviso de Protocolo</h3>
                   <p className="text-stone-500 text-sm max-w-md mx-auto leading-relaxed">
                     {initError}
                   </p>
                 </div>
                 <button onClick={onEnd} className="px-8 py-3 bg-stone-800 text-stone-300 text-[10px] tracking-[0.3em] uppercase font-black rounded-full hover:bg-stone-700 transition-all">
                   Regresar
                 </button>
               </div>
             ) : (
               <div className="space-y-8">
                 <div className="relative w-20 h-20 mx-auto">
                    <div className="absolute inset-0 border-t-2 border-amber-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-3 border border-stone-800 rounded-full animate-pulse"></div>
                 </div>
                 <div className="space-y-1">
                    <p className="serif text-3xl text-stone-200 tracking-[0.1em] uppercase">Arturo</p>
                    <p className="text-amber-600 text-[8px] tracking-[0.5em] uppercase font-black animate-pulse">{loadingStep}</p>
                 </div>
               </div>
             )}
          </div>
        )}

        <div className="relative w-full h-full group overflow-hidden rounded-[40px] md:rounded-[80px] bg-stone-900/30 border border-white/5 shadow-[0_0_150px_rgba(0,0,0,0.9)]">
          <video 
            ref={mediaStreamRef}
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-[1.01]"
            playsInline
          />
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>

          <div className="absolute bottom-12 left-12 md:bottom-20 md:left-20 right-12 text-left pointer-events-none">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-[1px] bg-amber-700"></div>
              <span className="text-amber-700 text-[10px] tracking-[0.6em] uppercase font-black">Private Selection</span>
            </div>
            <h2 className="serif text-7xl md:text-9xl text-stone-50 font-bold tracking-tighter leading-none mb-2">Arturo</h2>
            <p className="text-stone-400 text-[10px] tracking-[0.3em] uppercase font-light">Sommelier Senior & Founder</p>
          </div>
        </div>

        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6">
           <div className="bg-[#12100e]/98 backdrop-blur-3xl border border-white/10 p-6 md:p-8 rounded-[3rem] shadow-2xl flex flex-col gap-6">
              
              {transcript && (
                <div className="px-8 py-3 text-stone-300 text-sm md:text-base italic serif border-l border-amber-900/40 animate-fade-in">
                  "{transcript}"
                </div>
              )}

              <div className="flex items-center gap-5">
                <input 
                  type="text"
                  placeholder="Consulte a Arturo sobre el maridaje ideal..."
                  className="flex-1 bg-black/40 border border-white/5 rounded-full px-8 py-5 text-stone-200 focus:outline-none focus:border-amber-900/30 transition-all text-sm md:text-base placeholder:text-stone-800"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inputValue.trim()) handleUserInput(inputValue);
                  }}
                  disabled={isSpeaking || isInitializing}
                />
                <button 
                  onClick={() => inputValue.trim() && handleUserInput(inputValue)}
                  disabled={isSpeaking || isInitializing}
                  className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${isSpeaking ? 'bg-amber-900/5' : 'bg-stone-100 hover:bg-white active:scale-95 shadow-xl'}`}
                >
                  {isSpeaking ? (
                    <div className="flex gap-1">
                      <div className="w-1 h-4 bg-amber-600 animate-bounce" style={{animationDelay: '0s'}}></div>
                      <div className="w-1 h-6 bg-amber-600 animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-1 h-4 bg-amber-600 animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-stone-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  )}
                </button>
              </div>
           </div>
        </div>
      </div>

      <div className="mt-40 mb-10">
         <button onClick={onEnd} className="text-stone-700 hover:text-amber-900 transition-all uppercase tracking-[1.2em] text-[8px] font-black">
           Abandonar Cava
         </button>
      </div>
    </div>
  );
};

export default SommelierUI;
