import React, { useState, useEffect } from 'react';
import { 
  Copy, 
  RefreshCw, 
  Trash2, 
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import api from '../api/client';

function InfluencerList() {
  const [influencers, setInfluencers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchInfluencers();
  }, []);

  const fetchInfluencers = async () => {
    try {
      const response = await api.get('/links');
      setInfluencers(response.data);
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Enlace copiado', 'success');
  };

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const regenerateVariants = async (id) => {
    try {
      await api.post(`/links/${id}/regenerate`);
      showToast('Variantes regeneradas', 'success');
      fetchInfluencers();
    } catch (e) {
      showToast('Error al regenerar', 'error');
    }
  };

  const deleteInfluencer = async (id) => {
    if (!confirm('¿Eliminar este influencer?')) return;
    
    try {
      await api.delete(`/links/${id}`);
      showToast('Influencer eliminado', 'success');
      fetchInfluencers();
    } catch (e) {
      showToast('Error al eliminar', 'error');
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando...</div>;

  return (
    <div>
      <div className="header">
        <h1>Gestión de Enlaces</h1>
      </div>
      
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.message}</div>
      )}
      
      <div className="card">
        <div className="card-body">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Influencer</th>
                  <th>Categoría</th>
                  <th>Variantes</th>
                  <th>Clicks</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {influencers.map(influencer => (
                  <React.Fragment key={influencer.id}>
                    <tr>
                      <td>
                        <div style={{ fontWeight: 500 }}>{influencer.nombre}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          {influencer.urlDestino.substring(0, 40)}...
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {influencer.categoria}
                        </span>
                      </td>
                      <td>{influencer._count?.linkVariants || 0}</td>
                      <td>
                        {influencer.linkVariants?.reduce((sum, v) => sum + v.clickCount, 0).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => setExpandedId(expandedId === influencer.id ? null : influencer.id)}
                          >
                            {expandedId === influencer.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Ver
                          </button>
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => regenerateVariants(influencer.id)}
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button 
                            className="btn btn-sm btn-danger"
                            onClick={() => deleteInfluencer(influencer.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === influencer.id && (
                      <tr>
                        <td colSpan={5} style={{ background: '#f9fafb', padding: 20 }}>
                          <div className="variants-list">
                            {influencer.linkVariants?.map(variant => (
                              <div key={variant.id} className="variant-item">
                                <div>
                                  <span className="variant-url">
                                    /{variant.slug}
                                  </span>
                                  <span style={{ marginLeft: 12, fontSize: 12, color: '#6b7280' }}>
                                    {variant.clickCount} clicks
                                  </span>
                                  {!variant.isActive && (
                                    <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                                      Inactivo
                                    </span>
                                  )}
                                </div>
                                <div className="variant-actions">
                                  <button 
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => copyToClipboard(`${window.location.origin}/${variant.slug}`)}
                                  >
                                    <Copy size={14} />
                                  </button>
                                  <a 
                                    href={`/${variant.slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-sm btn-secondary"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfluencerList;
