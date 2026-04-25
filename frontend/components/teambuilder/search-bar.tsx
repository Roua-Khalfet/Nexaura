'use client';

import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function SearchBar({ value, onChange, placeholder = "Search...", style = {} }: SearchBarProps) {
  return (
    <div style={{
      position: 'relative',
      ...style
    }}>
      <Search 
        size={18} 
        style={{
          position: 'absolute',
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none'
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '12px 40px 12px 44px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          fontSize: '14px',
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'all 0.2s',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--accent-primary)';
          e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1), 0 1px 2px rgba(0, 0, 0, 0.04)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--border-color)';
          e.target.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
