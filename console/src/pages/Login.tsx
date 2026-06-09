import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/dev-creds')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ email, password }: { email: string; password: string }) =>
        login(email, password).then(() => navigate('/', { replace: true }))
      )
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--paper)' }}>
      <div className="card" style={{ width: 360, padding: 32 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, fontFamily: 'var(--font-display)' }}>
          AI Memory Console
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--ink-2)' }}>
              邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--ink-2)' }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          {error && (
            <div style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 14 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block"
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
