'use client';

import { createContext, useContext, useState } from 'react';

const AnalysisContext = createContext();

export function AnalysisProvider({ children }) {
  const [isGenerating, setIsGenerating] = useState(false);

  return (
    <AnalysisContext.Provider value={{ isGenerating, setIsGenerating }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error('useAnalysis must be used within AnalysisProvider');
  }
  return context;
}

