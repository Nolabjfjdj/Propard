import { useEffect, useState } from 'react';
import axios from 'axios';
import { getStoredPrivateKeyJwk } from '../utils/crypto';
import { generateGroupKey, encryptGroupKeyForMember } from '../utils/groupCrypto';

export default function GroupManager({ token, onCreated, onClose }) {
  const [friends, setFriends] = useState([]), [selected, setSelected] = useState([]), [name, setName] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState('');
  useEffect(() => { axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then(r => setFriends((r.data.friends || []).filter(f => f.userId))).catch(() => setError('Impossible de charger tes amis.')); }, [token]);
  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const create = async () => {
    const clean = name.trim();
    if (!clean) return setError('Donne un nom au groupe.');
    if (!selected.length) return setError('Choisis au moins un ami.');
    setLoading(true); setError('');
    try {
      const meRes = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      const me = meRes.data, meId = (me._id || me.id).toString(), privateKey = getStoredPrivateKeyJwk(meId);
      if (!privateKey) throw new Error('Clé privée locale introuvable.');
      if (!me.publicKey) throw new Error('Ta clé publique est indisponible.');
      const groupKey = await generateGroupKey();
      const members = [{ _id: meId, publicKey: me.publicKey }, ...friends.filter(f => selected.includes(f.userId._id.toString())).map(f => f.userId)];
      const keyPackages = [];
      for (const member of members) {
        if (!member.publicKey) throw new Error('Un membre ne possède pas encore de clé de chiffrement.');
        const publicKey = typeof member.publicKey === 'string' ? JSON.parse(member.publicKey) : member.publicKey;
        keyPackages.push({ userId: member._id.toString(), senderId: meId, version: 1, encryptedKey: await encryptGroupKeyForMember(groupKey, privateKey, publicKey) });
      }
      const res = await axios.post('/api/groups/create', { name: clean, memberIds: selected, keyPackages }, { headers: { Authorization: `Bearer ${token}` } });
      onCreated?.(res.data);
    } catch (e) { console.error(e); setError(e.response?.data?.error || e.message || 'Impossible de créer le groupe.'); }
    finally { setLoading(false); }
  };
  return <div style={s.overlay} onClick={onClose}><div style={s.modal} onClick={e => e.stopPropagation()}>
    <h2 style={s.title}>Créer un groupe</h2><input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du groupe" maxLength={50} style={s.input} autoFocus />
    <p style={s.label}>Membres</p><div style={s.list}>{friends.map(f => { const id=f.userId._id.toString(), checked=selected.includes(id); return <button key={id} onClick={() => toggle(id)} style={{...s.friend,...(checked?s.selected:{})}}><span style={s.avatar}>{(f.userId.displayName||f.userId.username||'?')[0].toUpperCase()}</span><span>{f.nickname||f.userId.displayName||f.userId.username}</span><span style={s.check}>{checked?'✓':''}</span></button>; })}{!friends.length&&<p style={s.empty}>Ajoute d'abord des amis.</p>}</div>
    {error&&<p style={s.error}>{error}</p>}<div style={s.actions}><button onClick={onClose} style={s.cancel}>Annuler</button><button onClick={create} disabled={loading} style={s.create}>{loading?'Création...':'Créer'}</button></div>
  </div></div>;
}
const s={overlay:{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:16},modal:{width:'100%',maxWidth:430,maxHeight:'85vh',overflow:'auto',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:20},title:{margin:'0 0 14px',color:'var(--text-primary)',fontSize:20},input:{width:'100%',boxSizing:'border-box',background:'var(--bg-tertiary)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,padding:10,outline:'none'},label:{color:'var(--text-muted)',fontSize:11,textTransform:'uppercase',margin:'16px 0 7px'},list:{display:'flex',flexDirection:'column',gap:4},friend:{display:'flex',alignItems:'center',gap:9,width:'100%',border:'1px solid transparent',background:'transparent',color:'var(--text-primary)',borderRadius:8,padding:8,textAlign:'left',cursor:'pointer'},selected:{background:'var(--accent-glow)',borderColor:'var(--accent)'},avatar:{width:30,height:30,borderRadius:'50%',background:'var(--accent-glow)',color:'var(--accent)',display:'grid',placeItems:'center',fontWeight:700,flexShrink:0},check:{marginLeft:'auto',color:'var(--success)',fontWeight:800},empty:{color:'var(--text-muted)',fontSize:13},error:{color:'var(--danger)',fontSize:12},actions:{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16},cancel:{background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px'},create:{background:'var(--accent)',color:'#fff',border:0,borderRadius:8,padding:'8px 14px',fontWeight:700}};
