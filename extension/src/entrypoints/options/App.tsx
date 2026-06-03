import { Routes, Route, NavLink } from 'react-router-dom';
import CaptureList from './pages/CaptureList';
import CaptureDetail from './pages/CaptureDetail';
import ReviewInbox from './pages/ReviewInbox';
import Settings from './pages/Settings';
import '../../assets/tokens.css';

const NAV = [
  { to: '/', label: 'Captures', exact: true },
  { to: '/review', label: 'Review Inbox' },
  { to: '/settings', label: '设置' },
];

export default function App() {
  return (
    <div className="scr" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={{ width: 210, flex: '0 0 auto', background: 'var(--paper-2)', borderRight: '1px solid var(--line)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px 18px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>AI Memory</div>
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.exact}
            style={({ isActive }) => ({
              display: 'block', padding: '9px 11px', borderRadius: 7,
              fontSize: 13, fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--ink)' : 'var(--ink-2)',
              background: isActive ? 'var(--surface)' : 'transparent',
              border: isActive ? '1px solid var(--line-2)' : '1px solid transparent',
              textDecoration: 'none',
            })}
          >{n.label}</NavLink>
        ))}
      </aside>
      <main style={{ flex: 1, overflow: 'auto', padding: 26 }}>
        <Routes>
          <Route path="/" element={<CaptureList />} />
          <Route path="/capture/:id" element={<CaptureDetail />} />
          <Route path="/review" element={<ReviewInbox />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
