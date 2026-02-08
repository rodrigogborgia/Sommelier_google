
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';

// Audio & Binary Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const int16 = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
  return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
}

interface SommelierUIProps {
  onEnd: () => void;
}

const SommelierUI: React.FC<SommelierUIProps> = ({ onEnd }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  
  // Puppet States
  const [movement, setMovement] = useState({
    lipScale: 0,
    headTilt: 0,
    headY: 0,
    shoulderY: 0,
    intensity: 0
  });
  
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const systemInstruction = `
    Eres 'Arturo', un Sommelier de Carnes de 60 años y dueño de 'The Prime Cut'.
    Eres la máxima autoridad en carnes de exportación.

    CARÁCTER:
    - Distinguido, serio, apasionado pero sumamente educado.
    - ACENTO ARGENTINO (Buenos Aires) ELEGANTE.
    - TRATO DE 'USTED' SIEMPRE.
    - No eres un vendedor, eres un mentor gastronómico.
    
    ESTRUCTURA DE RESPUESTA:
    - Saluda con clase: "Buen día. Es un placer recibirlo en mi boutique. Soy Arturo."
    - Explica el porqué de tus recomendaciones (genética, alimentación a pasto, días de maduración).
  `;

  // Advanced Puppet Engine Loop
  useEffect(() => {
    let animationId: number;
    let blinkTimeout: any;

    const updatePuppet = () => {
      if (analyserRef.current && isSpeaking) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        const normalized = Math.min(1, average / 45); // Sensibilidad del volumen
        
        setMovement(prev => ({
          lipScale: normalized,
          headTilt: Math.sin(Date.now() / 200) * (normalized * 2.5),
          headY: normalized * 5,
          shoulderY: normalized * 2,
          intensity: normalized
        }));
      } else {
        // Idle living state
        const idleSway = Math.sin(Date.now() / 2000) * 0.5;
        setMovement(prev => ({
          ...prev,
          lipScale: 0,
          headTilt: idleSway,
          headY: 0,
          shoulderY: Math.cos(Date.now() / 2500) * 1,
          intensity: 0
        }));
      }
      animationId = requestAnimationFrame(updatePuppet);
    };

    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 180);
      blinkTimeout = setTimeout(triggerBlink, 2500 + Math.random() * 4000);
    };

    updatePuppet();
    triggerBlink();

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(blinkTimeout);
    };
  }, [isSpeaking]);

  useEffect(() => {
    let active = true;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    const setupSession = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        analyserRef.current = audioContextOutRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(audioContextOutRef.current.destination);

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              const source = audioContextInRef.current!.createMediaStreamSource(stream);
              const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
              scriptProcessor.onaudioprocess = (e) => {
                sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) }));
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(audioContextInRef.current!.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
              if (base64Audio && audioContextOutRef.current && analyserRef.current) {
                setIsSpeaking(true);
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContextOutRef.current.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), audioContextOutRef.current, 24000, 1);
                const source = audioContextOutRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(analyserRef.current);
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) setIsSpeaking(false);
                });
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }
              if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setIsSpeaking(false);
              }
            },
            onclose: () => active && onEnd(),
          }
        });
      } catch (err) { onEnd(); }
    };
    setupSession();
    return () => { active = false; audioContextInRef.current?.close(); audioContextOutRef.current?.close(); };
  }, [onEnd]);

  return (
    <div className="w-full max-w-7xl flex flex-col items-center space-y-16 animate-fade-in-up">
      {/* ARTURO: The Living Presence */}
      <div className="relative w-[340px] h-[550px] md:w-[680px] md:h-[820px] perspective-[1000px]">
        {/* Glow & Atmosphere */}
        <div className={`absolute inset-0 rounded-[60px] blur-[140px] transition-all duration-[3000ms] ${isSpeaking ? 'bg-amber-800/50 scale-110' : 'bg-stone-900/30'}`}></div>
        
        {/* Living Puppet Container */}
        <div className="relative w-full h-full rounded-[60px] border-[1px] border-stone-800/40 overflow-hidden shadow-[0_0_150px_rgba(0,0,0,1)] bg-black animate-camera-sway">
          
          {/* Main Avatar Layers */}
          <div className="relative w-full h-full">
             
             {/* Torso & Shoulders Layer */}
             <div 
               className="absolute inset-0 transition-transform duration-500 ease-out"
               style={{ transform: `translateY(${movement.shoulderY}px)` }}
             >
               <img 
                 src="https://images.unsplash.com/photo-1544168190-79c17527004f?auto=format&fit=crop&q=95&w=1500" 
                 alt="Arturo" 
                 className={`w-full h-full object-cover transition-all duration-[2000ms] ${isSpeaking ? 'brightness-110' : 'brightness-75 contrast-110 grayscale-[10%]'}`}
               />
             </div>

             {/* Living Face & Expressions Filter Overlay */}
             <div 
               className="absolute inset-0 pointer-events-none transition-all duration-300"
               style={{ 
                 transform: `rotate(${movement.headTilt}deg) translateY(${movement.headY}px) scale(${1 + movement.intensity * 0.01})`,
                 transformOrigin: '50% 40%'
               }}
             >
               {/* Eye Micro-expressions (Shadows) */}
               <div 
                 className={`absolute top-[28%] left-[35%] w-[30%] h-[5%] bg-black/30 blur-xl transition-opacity duration-300 ${isSpeaking ? 'opacity-60' : 'opacity-0'}`}
               />

               {/* Jaw & Mouth Puppet Layer */}
               <div 
                 className="absolute bottom-[35%] left-1/2 -translate-x-1/2 w-[24%] h-[14%] rounded-[100%]"
                 style={{
                   transform: `translateX(-50%) translateY(${movement.lipScale * 14}px) scaleX(${1 + movement.lipScale * 0.15}) scaleY(${1 + movement.lipScale * 0.4})`,
                   background: 'radial-gradient(circle at center, rgba(0,0,0,0.85) 0%, transparent 75%)',
                   opacity: 0.1 + movement.lipScale * 0.9,
                   filter: 'blur(10px)',
                   mixBlendMode: 'multiply'
                 }}
               />

               {/* Blink Layer */}
               <div className={`absolute top-[27.5%] left-1/2 -translate-x-1/2 w-[38%] h-[6%] bg-[#0c0a09] blur-md transition-opacity duration-[150ms] ${isBlinking ? 'opacity-100' : 'opacity-0'}`}></div>

               {/* Eye Sparkle (The "Soul" effect) */}
               <div className={`absolute top-[27.8%] left-1/2 -translate-x-1/2 w-[35%] h-[2%] flex justify-around px-4 transition-all duration-500 ${isSpeaking ? 'opacity-100 scale-110' : 'opacity-40'}`}>
                  <div className="w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                  <div className="w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
               </div>
             </div>

             {/* Volumetric Smoke & Embers */}
             <div className="absolute inset-0 pointer-events-none mix-blend-screen opacity-10">
               <div className="absolute inset-0 bg-[url('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z0d3Qzd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3JpZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26AHG5KBaZ3D3X7G0/giphy.gif')] bg-cover scale-150 rotate-180"></div>
             </div>

             {/* Dramatic Cinematic Gradients */}
             <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20 opacity-90"></div>
             <div className={`absolute inset-0 bg-gradient-to-r from-amber-900/10 via-transparent to-black/40 transition-opacity duration-[3000ms] ${isSpeaking ? 'opacity-100' : 'opacity-50'}`}></div>
          </div>

          {/* Luxury Branding */}
          <div className="absolute bottom-20 left-16 right-16 flex flex-col items-start space-y-4">
             <div className="flex items-center gap-4 group">
                <div className="h-[1px] w-12 bg-amber-600 transition-all group-hover:w-20"></div>
                <span className="text-amber-600 text-[10px] tracking-[0.6em] uppercase font-black">Sommelier Titular</span>
             </div>
             <div>
               <h2 className="serif text-7xl md:text-9xl text-stone-100 font-bold tracking-tighter leading-[0.8]">Arturo</h2>
               <p className="text-stone-400 text-sm tracking-[0.3em] font-light mt-6 italic opacity-80">Selección de Hacienda Privada</p>
             </div>
          </div>
        </div>

        {/* Live Status Totem Interface */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[450px] px-8">
          <div className="bg-stone-900/90 backdrop-blur-3xl border border-stone-800/50 p-6 rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="relative flex h-3 w-3">
                 <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSpeaking ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                 <span className={`relative inline-flex rounded-full h-3 w-3 ${isSpeaking ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
               </div>
               <span className="text-stone-200 text-[11px] uppercase tracking-[0.4em] font-black">
                 {isSpeaking ? 'Escuchando & Asesorando' : 'A la espera de su consulta'}
               </span>
            </div>
            
            {isSpeaking && (
              <div className="flex gap-1 h-4 items-end">
                 {[...Array(5)].map((_, i) => (
                   <div key={i} className="w-1 bg-amber-600 animate-pulse" style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i*0.1}s` }}></div>
                 ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructional Quote */}
      <div className="text-center space-y-6 max-w-2xl px-6 animate-fade-in">
        <p className="text-stone-500 text-3xl font-light italic leading-relaxed serif tracking-tight">
          "Hábleme de la ocasión que celebra hoy... <br/>
          <span className="text-stone-400">Encontraremos la pieza exacta para su mesa."</span>
        </p>
      </div>

      <button 
        onClick={onEnd} 
        className="group relative text-stone-700 hover:text-amber-800 transition-all uppercase tracking-[0.7em] text-[10px] font-black"
      >
        <span className="relative z-10">Finalizar Audiencia</span>
        <div className="absolute -bottom-2 left-0 w-0 h-[1px] bg-amber-900 transition-all group-hover:w-full"></div>
      </button>
    </div>
  );
};

export default SommelierUI;
