import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { Calendar } from 'lucide-react';
import api from '../api/client';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/analytics/dashboard');
      setData(response.data);
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando analytics...</div>;

  const categoryData = data?.byCategory.map(item => ({
    name: item.categoria,
    value: parseInt(item.clicks)
  })) || [];

  return (
    <div>
      <div className="header">
        <h1>Analytics</h1>
        <div className="header-actions">
          <button className="btn btn-secondary">
            <Calendar size={18} /> Últimos 30 días
          </button>
        </div>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Clicks Totales</h3>
          <div className="stat-value">{data?.totalClicks?.toLocaleString() || 0}</div>
          <div className="stat-change positive">+23% vs mes anterior</div>
        </div>
        
        <div className="stat-card">
          <h3>Tasa Real/Bot</h3>
          <div className="stat-value">87%</div>
          <div className="stat-change positive">Tráfico legítimo</div>
        </div>
        
        <div className="stat-card">
          <h3>CTR Promedio</h3>
          <div className="stat-value">12.4%</div>
          <div className="stat-change positive">+2.1% vs anterior</div>
        </div>
        
        <div className="stat-card">
          <h3>Enlaces Activos</h3>
          <div className="stat-value">{data?.totalLinks || 0}</div>
          <div className="stat-change positive">En uso</div>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div className="card">
          <div className="card-header">
            <h3>Tendencia de Clicks</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={[
                { name: 'Lun', clicks: 120 },
                { name: 'Mar', clicks: 180 },
                { name: 'Mié', clicks: 150 },
                { name: 'Jue', clicks: 220 },
                { name: 'Vie', clicks: 280 },
                { name: 'Sáb', clicks: 320 },
                { name: 'Dom', clicks: 290 }
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="clicks" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="card">
          <div className="card-header">
            <h3>Por Categoría</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 16 }}>
              {categoryData.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                  <span style={{ fontSize: 13 }}>{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>Distribución por Dispositivo</h3>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[
              { name: 'Mobile', clicks: 4500, percentage: 65 },
              { name: 'Desktop', clicks: 1800, percentage: 26 },
              { name: 'Tablet', clicks: 620, percentage: 9 }
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Bar dataKey="clicks" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
