import React from 'react';

export function Button({ children, className, variant = 'default', size = 'default', ...props }) {
  const baseStyle = "font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500";
  const variants = {
    default: "bg-purple-500 text-white hover:bg-purple-600",
    outline: "border border-purple-500 text-purple-500 hover:bg-purple-500 hover:text-white",
    ghost: "text-gray-400 hover:text-white",
  };
  const sizes = {
    default: "px-4 py-2",
    sm: "px-2 py-1 text-sm",
    lg: "px-6 py-3 text-lg",
    icon: "p-2",
  };

  const classes = `${baseStyle} ${variants[variant]} ${sizes[size]} ${className || ''}`;

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

