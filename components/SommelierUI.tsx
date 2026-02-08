
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import Visualizer from './Visualizer';

// Audio Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
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
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

interface SommelierUIProps {
  onEnd: () => void;
}

const SommelierUI: React.FC<SommelierUIProps> = ({ onEnd }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcription, setTranscription] = useState<string>('');
  
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  const systemInstruction = `
    You are 'Arturo', a world-class Meat Sommelier at 'The Prime Cut' artisanal butcher shop. 
    You are standing at a digital totem in front of the store to welcome clients.
    Your tone is sophisticated, passionate, yet welcoming. 
    You are an expert in:
    - Beef cuts (Ribeye, Picanha, Tomahawk, Filet Mignon, etc.)
    - Marbling scores (BMS) and Wagyu grades.
    - Dry-aging techniques and their impact on flavor profiles.
    - Cooking methods (Reverse sear, sous vide, cast iron pan).
    - Wine and side dish pairings.
    
    Greet the customer warmly. Ask them what they are planning to cook or if they'd like to hear about today's special dry-aged selection.
    Keep your responses elegant but punchy. If they are undecided, suggest a cut based on their preference for tenderness vs. intense beefy flavor.
    Speak as if you are a high-end sommelier in a luxury steakhouse.
  `;

  useEffect(() => {
    let active = true;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    const setupSession = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const outputNode = audioContextOutRef.current.createGain();
        outputNode.connect(audioContextOutRef.current.destination);

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              console.log('Gemini Live session opened');
              setIsListening(true);
              
              const source = audioContextInRef.current!.createMediaStreamSource(stream);
              const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
              
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };
              
              source.connect(scriptProcessor);
              scriptProcessor.connect(audioContextInRef.current!.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
              
              if (base64Audio && audioContextOutRef.current) {
                setIsSpeaking(true);
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContextOutRef.current.currentTime);
                const audioBuffer = await decodeAudioData(
                  decode(base64Audio),
                  audioContextOutRef.current,
                  24000,
                  1
                );
                
                const source = audioContextOutRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContextOutRef.current.destination);
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
            onclose: () => {
              console.log('Session closed');
              if (active) onEnd();
            },
            onerror: (e) => {
              console.error('Session error:', e);
            }
          }
        });

        sessionRef.current = await sessionPromise;
      } catch (err) {
        console.error('Failed to setup session:', err);
        onEnd();
      }
    };

    setupSession();

    return () => {
      active = false;
      if (sessionRef.current) {
        // No close method directly accessible via type but assumed to exist or connection drops
      }
      audioContextInRef.current?.close();
      audioContextOutRef.current?.close();
    };
  }, [onEnd]);

  return (
    <div className="w-full max-w-4xl flex flex-col items-center space-y-12 animate-fade-in-up">
      {/* Avatar Visual Section */}
      <div className="relative w-64 h-64 md:w-96 md:h-96">
        {/* Glow Effects */}
        <div className={`absolute inset-0 rounded-full transition-all duration-1000 blur-3xl ${isSpeaking ? 'bg-amber-600/30 scale-125' : 'bg-stone-800/20'}`}></div>
        
        {/* Arturo's Image (Placeholder Sommelier) */}
        <div className="relative w-full h-full rounded-full border-4 border-stone-800 p-2 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <img 
            src="https://images.unsplash.com/photo-1541614101331-1a5a3a194e90?auto=format&fit=crop&q=80&w=800" 
            alt="Arturo Sommelier" 
            className={`w-full h-full object-cover grayscale transition-all duration-500 ${isSpeaking ? 'grayscale-0 brightness-110' : 'brightness-75'}`}
          />
          
          {/* Speaking Waveform Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             {isSpeaking && <Visualizer active={true} />}
          </div>
        </div>

        {/* Status Indicator */}
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-stone-900 px-6 py-2 rounded-full border border-stone-700 shadow-xl flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
          <span className="text-stone-300 text-xs uppercase tracking-widest font-bold">
            {isSpeaking ? 'Arturo Speaking' : 'Listening for Guest'}
          </span>
        </div>
      </div>

      {/* Interaction Feedback */}
      <div className="w-full text-center space-y-4 px-6">
        <h3 className="serif text-3xl md:text-5xl text-stone-100">
          {isSpeaking ? "Expert Advice..." : "I'm listening, ask me anything."}
        </h3>
        <p className="text-stone-500 text-lg md:text-xl font-light">
          Try: "What's the best way to cook a Picanha?" or "Tell me about dry-aged beef."
        </p>
      </div>

      {/* Control Actions */}
      <button 
        onClick={onEnd}
        className="text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-[0.3em] text-[10px] font-bold mt-8 border-b border-transparent hover:border-stone-700 pb-1"
      >
        End Interaction
      </button>
    </div>
  );
};

export default SommelierUI;
