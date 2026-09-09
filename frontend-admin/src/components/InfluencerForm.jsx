import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../api/client';

const CATEGORIAS = [
  { value: 'FOTOGRAFIA', label: 'Fotografía' },
  { value: 'ARTE', label: 'Arte' },
  { value: 'LIFESTYLE', label: 'Lifestyle' },
  { value: 'MODA', label: 'Moda' },
  { value: 'FITNESS', label: 'Fitness' },
  { value: 'MUSICA', label: 'Música' },
  { value: 'OTROS', label: 'Otros' }
];

function InfluencerForm({ onClose }) {
  const [formData, setFormData] = useState({
    nombre: '',
    urlDestino: '',
    categoria: 'FOTOGRAFIA'
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/links', formData);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear influencer');
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    if (!result) return;
    const urls = result.variants.map(v => `${window.location.origin}/${v.slug}`).join('\n');
    navigator.clipboard.writeText(urls);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo Influencer</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
        
        <div className="modal-body">
          {!result ? (
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{ 
                  background: '#fee2e2', 
                  color: '#991b1b', 
                  padding: 12, 
                  borderRadius: 6, 
                  marginBottom: 16 
                }}>
                  {error}
                </div>
              )}
              
              <div className="form-group">
                <label>Nombre del Influencer</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej: Venice"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>URL de Destino</label>
                <input
                  type="url"
                  value={formData.urlDestino}
                  onChange={e => setFormData({...formData, urlDestino: e.target.value})}
                  placeholder="https://..."
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Categoría de Contenido</label>
                <select
                  value={formData.categoria}
                  onChange={e => setFormData({...formData, categoria: e.target.value})}
                >
                  {CATEGORIAS.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="modal-footer" style={{ padding: 0, border: 'none' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><Loader2 size={18} className="spin" /> Creando...</> : 'Crear Enlaces'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div style={{ 
                background: '#dcfce7', 
                color: '#166534', 
                padding: 16, 
                borderRadius: 8, 
                marginBottom: 20 
              }}>
                <strong>¡Influencer creado!</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: 14 }}>
                  Se generaron {result.totalGenerated} variantes de enlace
                </p>
              </div>
              
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600 }}>Enlaces generados:</h4>
                  <button className="btn btn-sm btn-secondary" onClick={copyAll}>
                    Copiar todos
                  </button>
                </div>
                
                <div style={{ 
                  maxHeight: 300, 
                  overflowY: 'auto', 
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 12
                }}>
                  {result.variants.map((variant, i) => (
                    <div 
                      key={variant.id} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: i < result.variants.length - 1 ? '1px solid #e5e7eb' : 'none'
                      }}
                    >
                      <code style={{ fontSize: 13, color: '#374151' }}>
                        /{variant.slug}
                      </code>
                      <span style={{ fontSize: 12, color: '#22c55e' }}>
                        Activo
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="modal-footer" style={{ padding: 0, border: 'none' }}>
                <button className="btn btn-primary" onClick={onClose}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InfluencerForm;
