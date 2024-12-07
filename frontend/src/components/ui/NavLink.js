import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export function NavLink({ to, children }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`text-white hover:text-purple-300 ${
        isActive ? 'text-purple-500' : 'opacity-70'
      }`}
    >
      {children}
    </Link>
  );
}

