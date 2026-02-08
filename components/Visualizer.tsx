
import React from 'react';

interface VisualizerProps {
  active: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ active }) => {
  return (
    <div className="flex items-center justify-center gap-1 h-24">
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className={`w-1.5 bg-amber-500/80 rounded-full transition-all duration-300 ${active ? 'animate-bounce' : 'h-2 opacity-20'}`}
          style={{
            animationDelay: `${i * 0.1}s`,
            height: active ? `${Math.random() * 60 + 20}%` : '8px',
            animationDuration: '0.6s'
          }}
        ></div>
      ))}
    </div>
  );
};

export default Visualizer;
