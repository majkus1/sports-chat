'use client';

import { createContext, useContext, useState } from 'react';
import Alert from '@/components/Alert';

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const [alert, setAlert] = useState({
    isOpen: false,
    message: '',
    type: 'info',
  });

  const showAlert = (message, type = 'info', duration = 4000) => {
    setAlert({
      isOpen: true,
      message,
      type,
      duration,
    });
  };

  const closeAlert = () => {
    setAlert((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Alert
        message={alert.message}
        type={alert.type}
        isOpen={alert.isOpen}
        onClose={closeAlert}
        duration={alert.duration}
      />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return context;
}

