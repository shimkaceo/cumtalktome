import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Link2, 
  BarChart3, 
  LogOut, 
  Plus,
  Users
} from 'lucide-react';
import InfluencerList from './InfluencerList';
import InfluencerForm from './InfluencerForm';
import Analytics from './Analytics';

function Dashboard({ setToken }) {
  const location = useLocation();
  const [showForm, setShowForm] = useState(false);

  const handleLogout = () => {
    setToken(null);
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/links', icon: Link2, label: 'Enlaces' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  ];

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2><Link2 size={24} /> BioLink Pro</h2>
        </div>
        
        <nav>
          {navItems.map(item => (
            <Link 
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          ))}
          
          <div 
            className="nav-item"
            onClick={() => setShowForm(true)}
            style={{ marginTop: 16, background: '#3b82f6' }}
          >
            <Plus size={20} />
            Nuevo Influencer
          </div>
        </nav>
        
        <div style={{ marginTop: 'auto', paddingTop: 32 }}>
          <div className="nav-item" onClick={handleLogout}>
            <LogOut size={20} />
            Cerrar Sesión
          </div>
        </div>
      </aside>
      
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Overview setShowForm={setShowForm} />} />
          <Route path="/links" element={<InfluencerList />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </main>
      
      {showForm && (
        <InfluencerForm onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}

function Overview({ setShowForm }) {
  const [stats, setStats] = React.useState({
    totalInfluencers: 0,
    totalLinks: 0,
    totalClicks: 0,
    recentActivity: []
  });

  React.useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const api = (await import('../api/client')).default;
      const response = await api.get('/analytics/dashboard');
      setStats(response.data);
    } catch (e) {
      console.error('Error fetching stats:', e);
    }
  };

  return (
    <div>
      <div className="header">
        <h1>Dashboard</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} /> Nuevo Influencer
          </button>
        </div>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Influencers</h3>
          <div className="stat-value">{stats.totalInfluencers}</div>
          <div className="stat-change positive">Activos</div>
        </div>
        
        <div className="stat-card">
          <h3>Enlaces Generados</h3>
          <div className="stat-value">{stats.totalLinks}</div>
          <div className="stat-change positive">Variantes únicas</div>
        </div>
        
        <div className="stat-card">
          <h3>Clicks Totales</h3>
          <div className="stat-value">{stats.totalClicks.toLocaleString()}</div>
          <div className="stat-change positive">+12% este mes</div>
        </div>
        
        <div className="stat-card">
          <h3>Tasa de Conversión</h3>
          <div className="stat-value">87%</div>
          <div className="stat-change positive">Usuarios reales</div>
        </div>
      </div>
      
      <div className="card">
        <div className="card-header">
          <h3>Actividad Reciente</h3>
        </div>
        <div className="card-body">
          {stats.recentActivity.length === 0 ? (
            <p style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>
              No hay actividad reciente
            </p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Influencer</th>
                    <th>Slug</th>
                    <th>IP</th>
                    <th>Tipo</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentActivity.map((log, i) => (
                    <tr key={i}>
                      <td>{log.variant?.influencer?.nombre || 'N/A'}</td>
                      <td><code>{log.variant?.slug || 'N/A'}</code></td>
                      <td>{log.ipAddress}</td>
                      <td>
                        <span className={`badge ${log.isBot ? 'badge-warning' : 'badge-success'}`}>
                          {log.isBot ? 'Bot' : 'Humano'}
                        </span>
                      </td>
                      <td>{new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
