'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  const handleGoogleLogin = async () => {
    try {
      // Get the OAuth URL from backend
      const response = await fetch('http://localhost:8001/api/v1/auth/google/login', {
        credentials: 'include',
        headers: {
          'X-API-Key': 'your_api_key',
        },
      });
      
      const data = await response.json();
      
      if (data.auth_url) {
        // Redirect to Google OAuth
        window.location.href = data.auth_url;
      } else {
        console.error('No auth_url in response:', data);
        alert('Failed to initiate login. Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to initiate login. Please try again.');
    }
  };

  useEffect(() => {
    // Check if already logged in
    fetch('http://localhost:8001/api/v1/auth/user', {
      credentials: 'include',
      headers: {
        'X-API-Key': 'your_api_key',
      },
    })
      .then(res => res.json())
      .then(data => {
        if (data.email) {
          // Already logged in, redirect to home
          router.push('/');
        }
      })
      .catch(() => {
        // Not logged in, stay on login page
      });
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        padding: '40px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{
          width: '60px',
          height: '60px',
          margin: '0 auto 24px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
        }}>
          🚀
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '24px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}>
          Welcome to Startify
        </h1>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '14px',
          marginBottom: '32px',
        }}>
          Sign in to access TeamBuilder features
        </p>

        {/* Google Login Button */}
        <button
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '12px 24px',
            background: 'white',
            color: '#1f2937',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f9fafb';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.17.282-1.709V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.335z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>

        {/* Info */}
        <p style={{
          marginTop: '24px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: '1.5',
        }}>
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
