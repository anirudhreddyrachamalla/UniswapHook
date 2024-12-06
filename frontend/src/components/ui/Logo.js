import React from 'react';
import { Link } from 'react-router-dom';

export function Logo() {
  return (
    <Link to="/" className="flex items-center space-x-2">
      <span className="text-2xl">🦄</span>
      <span className="text-xl font-bold text-white">Uniswap</span>
    </Link>
  );
}
