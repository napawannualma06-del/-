/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore, isUserAdmin } from './store/useStore';
import { Login } from './components/Login';
import { Queue } from './components/Queue';
import { AdminDashboard } from './components/AdminDashboard';
import { Layout } from './components/Layout';

export default function App() {
  const { initAuth, user, loading } = useStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        
        <Route element={user ? <Layout /> : <Navigate to="/login" />}>
          <Route path="/" element={<Queue />} />
          <Route path="/admin" element={isUserAdmin(user) ? <AdminDashboard /> : <Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
