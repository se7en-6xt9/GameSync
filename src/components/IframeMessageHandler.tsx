import { useEffect } from 'react';
import { useUserStore } from '../store/userStore';

export default function IframeMessageHandler() {
  const setUserData = useUserStore((state) => state.setUserData);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // In production, verify event.origin if known!
      // Example: if (event.origin !== import.meta.env.VITE_PARENT_ORIGIN) return;
      
      const { data, origin } = event;
      
      const parentOrigin = import.meta.env.VITE_PARENT_ORIGIN;
      if (parentOrigin && origin !== parentOrigin) {
        console.warn(`Origin ${origin} blocked. Expected ${parentOrigin}`);
        return;
      }

      // We expect data to be { type: 'AUTH_SYNC', username: '...', id: '...' }
      if (data && data.type === 'AUTH_SYNC' && data.id && data.username) {
        console.log('Received auth sync from parent UI:', data);
        setUserData(data.id, data.username);
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Ping parent asking if it exists to send us credentials
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [setUserData]);

  return null;
}
