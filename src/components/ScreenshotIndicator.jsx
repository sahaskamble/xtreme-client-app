import React, { useState, useEffect } from 'react';

/**
 * A visual indicator that appears briefly when a screenshot is taken
 * Only visible in development mode
 */
const ScreenshotIndicator = ({ isVisible, message = "Taking screenshot..." }) => {
  const [fadeOut, setFadeOut] = useState(false);
  
  useEffect(() => {
    if (isVisible) {
      // Reset fade out state when becoming visible
      setFadeOut(false);
      
      // Start fade out after 1 second
      const timer = setTimeout(() => {
        setFadeOut(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible]);
  
  // Don't render anything if not visible
  if (!isVisible) return null;
  
  // Check if we're in development mode
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                        window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1';
  
  // Only show in development mode
  if (!isDevelopment) return null;
  
  return (
    <div 
      className={`fixed top-0 left-0 w-full h-full flex items-center justify-center z-50 pointer-events-none ${
        fadeOut ? 'animate-fade-out' : 'animate-fade-in'
      }`}
      style={{
        animation: fadeOut 
          ? 'fadeOut 0.5s forwards' 
          : 'fadeIn 0.3s forwards',
      }}
    >
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>
      
      <div className="bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center">
        <div className="mr-3 animate-pulse">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" 
            />
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" 
            />
          </svg>
        </div>
        <div>
          <div className="font-bold">{message}</div>
          <div className="text-sm">Development Mode Indicator</div>
        </div>
      </div>
    </div>
  );
};

export default ScreenshotIndicator;
