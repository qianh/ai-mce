import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <div className="scr" style={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={<div>Login (coming)</div>} />
        <Route path="/" element={<div>List (coming)</div>} />
        <Route path="/capture/:id" element={<div>Detail (coming)</div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
