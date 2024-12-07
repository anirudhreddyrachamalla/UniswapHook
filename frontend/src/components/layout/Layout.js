import React from 'react';
import { Header } from './Header';

export function Layout({ children }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}

