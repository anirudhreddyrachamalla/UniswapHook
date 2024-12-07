import React from 'react';

export function Input({ className, ...props }) {
  return (
    <input
      className={`w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 ${className}`}
      {...props}
    />
  );
}

