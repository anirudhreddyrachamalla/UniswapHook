import React from 'react';

export function Card({ children, className, ...props }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg ${className}`} {...props}>
      {children}
    </div>
  );
}

