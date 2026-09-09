import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  return (
    <div className="app">
      <Routes>
        <Route 
          path="/login" 
          element={token ? <Navigate to="/" /> : <Login setToken={setToken} />} 
        />
        <Route 
          path="/*" 
          element={token ? <Dashboard setToken={setToken} /> : <Navigate to="/login" />} 
        />
      </Routes>
    </div>
  );
}

export default App;
