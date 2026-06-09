import { Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './lib/auth';
import Login from './pages/Login';

function RequireAuth({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <div className="scr" style={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><div>List (coming)</div></RequireAuth>} />
        <Route path="/capture/:id" element={<RequireAuth><div>Detail (coming)</div></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
