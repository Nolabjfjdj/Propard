import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import socket from '../socket';
import FriendList from '../components/FriendList';
import Chat from '../components/Chat';
import AddFriend from '../components/AddFriend';
import VoiceCall from '../components/VoiceCall';

export default function AppPage({ initialFriendId }) {
  const { user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [hideIp, setHideIp] = useState(() => localStorage.getItem('propard_hideIp') === 'true');
  const [hideFriendIps, setHideFriendIps] = useState(() => localStorage.getItem('propard_hideFriendIps') === 'true');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [friendNotFound, setFriendNotFound] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // null | 'anonymize' | 'delete'
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const authenticate = () => socket.emit('authenticate', token);
    socket.on('connect', authenticate);
    socket.connect();
    if (socket.connected) authenticate();
    return () => {
      socket.off('connect', authenticate);
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!initialFriendId || !token) return;
    const loadInitialFriend = async () => {
      try {
        const res = await axios.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const friends = res.data.friends || [];
        const match = friends.find(f => f.userId?._id === initialFriendId);
        if (match) {
          setSelectedFriend(match.userId);
        } else {
          setFriendNotFound(true);
        }
      } catch (err) { console.error(err); }
    };
    loadInitialFriend();
  }, [initialFriendId, token]);

  useEffect(() => {
    socket.on('incomingCall', async ({ callerId, offer }) => {
      try {
        const res = await axios.get(
          `/api/auth/user/${callerId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setIncomingCall({ friend: { ...res.data, _id: callerId }, offer });
      } catch (err) { console.error(err); }
    });
    return () => socket.off('incomingCall');
  }, [token]);

  const handleSelectFriend = (friend) => {
    setSelectedFriend(friend);
    window.history.pushState({}, '', `/chat/${friend._id}`);
    if (isMobile) setShowSidebar(false);
  };

  const handleBack = () => {
    setSelectedFriend(null);
    setFriendNotFound(false);
    window.history.pushState({}, '', '/');
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setConfirmAction(null);
    setDeleteError('');
  };

  const handleAnonymize = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await axios.delete('/api/auth/anonymize', {
        headers: { Authorization: `Bearer ${token}` }
      });
      logout();
    } catch (e) {
      setDeleteError(e.response?.data?.error || 'Erreur serveur');
      setDeleteLoading(false);
    }
  };

  const handleDeleteTotal = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await axios.delete('/api/auth/delete', {
        headers: { Authorization: `Bearer ${token}` }
      });
      logout();
    } catch (e) {
      setDeleteError(e.response?.data?.error || 'Erreur serveur');
      setDeleteLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    setCancelLoading(true);
    setCancelError('');
    try {
      await axios.post('/api/auth/cancel-deletion', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Le plus simple et le plus fiable pour resynchroniser tout l'état
      // (user, friends, etc.) après une restauration de compte.
      window.location.reload();
    } catch (e) {
      setCancelError(e.response?.data?.error || 'Erreur serveur');
      setCancelLoading(false);
    }
  };

  return (
    <div style={styles.layout}>

      {isMobile && showSidebar && (
        <div style={styles.overlay} onClick={() => setShowSidebar(false)} />
      )}

      <div style={{
        ...styles.sidebar,
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : 'auto',
        left: isMobile ? 0 : 'auto',
        bottom: isMobile ? 0 : 'auto',
        transform: isMobile
          ? (showSidebar ? 'translateX(0)' : 'translateX(-100%)')
          : 'translateX(0)'
      }}>
        <div style={styles.sidebarHeader}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <a href="/help" style={styles.helpLink}>help</a>
            <span style={styles.appName}>
              Propard<span style={{ color: 'var(--accent)' }}>.</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <a href="https://discord.gg/hsMdJQz6EY" target="_blank" rel="noreferrer" style={styles.discordLink}>
              Discord
            </a>
            <button onClick={toggleTheme} style={styles.iconBtn}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            {isMobile && (
              <button onClick={() => setShowSidebar(false)} style={styles.iconBtn}>✕</button>
            )}
          </div>
        </div>

        {user?.pendingDeletion && (
          <div style={styles.pendingBanner}>
            <p style={styles.pendingBannerText}>
              ⏳ Compte en cours de suppression
              {user.deletionExpiresAt
                ? ` — restaurable jusqu'au ${new Date(user.deletionExpiresAt).toLocaleDateString('fr-FR')}`
                : ''}
            </p>
            <button style={styles.pendingBannerBtn} onClick={handleCancelDeletion} disabled={cancelLoading}>
              {cancelLoading ? '...' : '↩️ Annuler la suppression'}
            </button>
            {cancelError && <p style={styles.pendingBannerError}>{cancelError}</p>}
          </div>
        )}

        <div style={styles.ipCard}>
          <p style={styles.ipLabel}>Ton adresse</p>
          <p style={styles.ipValue}>
            {hideIp ? '███.███.███.███' : user?.ipAlias}
          </p>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <button style={styles.copyBtn} onClick={() => navigator.clipboard.writeText(user?.ipAlias)}>
              📋 Copier
            </button>
            <button style={styles.copyBtn} onClick={() => {
              const next = !hideIp;
              setHideIp(next);
              localStorage.setItem('propard_hideIp', next);
            }}>
              {hideIp ? '👁️ Afficher' : '🙈 Masquer'}
            </button>
          </div>
        </div>

        <button style={styles.addBtn} onClick={() => setShowAddFriend(true)}>
          + Ajouter un ami
        </button>

        <FriendList
          token={token}
          selectedFriend={selectedFriend}
          onSelectFriend={handleSelectFriend}
          hideFriendIps={hideFriendIps}
          setHideFriendIps={(val) => {
            setHideFriendIps(val);
            localStorage.setItem('propard_hideFriendIps', val);
          }}
        />

        <button style={styles.logoutBtn} onClick={logout}>Déconnexion</button>
        <button style={styles.deleteAccountBtn} onClick={() => setShowDeleteModal(true)}>
          🗑️ Supprimer mon compte
        </button>
      </div>

      <div style={styles.main}>
        {isMobile && !selectedFriend && !friendNotFound && (
          <div style={styles.mobileHeader}>
            <button style={styles.hamburger} onClick={() => setShowSidebar(true)}>☰</button>
            <span style={styles.mobileTitle}>Propard</span>
            <div style={{ width: '36px' }} />
          </div>
        )}

        {isMobile && (selectedFriend || friendNotFound) && (
          <div style={styles.mobileHeader}>
            <button style={styles.hamburger} onClick={handleBack}>←</button>
            <div style={{ width: '36px' }} />
          </div>
        )}

        {selectedFriend ? (
          <Chat
            friend={selectedFriend}
            token={token}
            userId={user?.id}
            hideFriendIps={hideFriendIps}
            isMobile={isMobile}
          />
        ) : friendNotFound ? (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px' }}>🚫</p>
            <p style={styles.emptyText}>Tu n'as pas cet ami</p>
            <button style={styles.backBtn} onClick={handleBack}>Retour</button>
          </div>
        ) : (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px' }}>💬</p>
            <p style={styles.emptyText}>
              {isMobile ? 'Appuie sur ☰ pour voir tes amis' : 'Sélectionne un ami pour chatter'}
            </p>
          </div>
        )}
      </div>

      {showAddFriend && (
        <AddFriend token={token} onClose={() => setShowAddFriend(false)} />
      )}

      {incomingCall && (
        <VoiceCall
          friend={incomingCall.friend}
          userId={user?.id}
          onClose={() => setIncomingCall(null)}
          incomingOffer={incomingCall.offer}
        />
      )}

      {/* Modal suppression de compte — étape 1 : choix de l'option */}
      {showDeleteModal && !confirmAction && (
        <div style={styles.modalOverlay} onClick={closeDeleteModal}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Supprimer mon compte</h2>
            <p style={styles.modalText}>Choisis une option :</p>

            <div style={styles.modalOption}>
              <h3 style={styles.modalOptionTitle}>Option A — Anonymisation (réversible 30 jours)</h3>
              <p style={styles.modalOptionDesc}>
                Ton pseudo est masqué immédiatement (affiché <strong>"Utilisateur supprimé"</strong>) mais tes messages et tes amitiés restent intacts. Tu peux te reconnecter avec ton pseudo et mot de passe actuels pendant <strong>30 jours</strong> pour tout annuler. Passé ce délai, c'est définitif.
              </p>
              <button
                style={styles.modalBtnWarn}
                onClick={() => setConfirmAction('anonymize')}
                disabled={deleteLoading}
              >
                🙈 Anonymiser mon compte
              </button>
            </div>

            <div style={styles.modalDivider} />

            <div style={styles.modalOption}>
              <h3 style={styles.modalOptionTitle}>Option B — Suppression totale (immédiate)</h3>
              <p style={styles.modalOptionDesc}>
                Ton compte <strong>et tous tes messages</strong> sont définitivement supprimés tout de suite. Cette action est irréversible, aucun délai de grâce.
              </p>
              <button
                style={styles.modalBtnDanger}
                onClick={() => setConfirmAction('delete')}
                disabled={deleteLoading}
              >
                💀 Tout supprimer définitivement
              </button>
            </div>

            <button style={styles.modalBtnCancel} onClick={closeDeleteModal}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modal suppression de compte — étape 2 : confirmation explicite */}
      {showDeleteModal && confirmAction && (
        <div style={styles.modalOverlay} onClick={() => { setConfirmAction(null); setDeleteError(''); }}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {confirmAction === 'anonymize' ? 'Confirmer l\'anonymisation ?' : 'Confirmer la suppression définitive ?'}
            </h2>
            <p style={styles.modalOptionDesc}>
              {confirmAction === 'anonymize'
                ? "Ton pseudo sera masqué tout de suite pour tout le monde. Tu pourras te reconnecter avec ton pseudo et mot de passe actuels pendant 30 jours pour annuler."
                : "Cette action supprime immédiatement et irréversiblement ton compte et tous tes messages. Aucun moyen de revenir en arrière."}
            </p>

            {deleteError && <p style={styles.modalError}>{deleteError}</p>}

            <button
              style={confirmAction === 'anonymize' ? styles.modalBtnWarn : styles.modalBtnDanger}
              onClick={confirmAction === 'anonymize' ? handleAnonymize : handleDeleteTotal}
              disabled={deleteLoading}
            >
              {deleteLoading ? '...' : 'Oui, je confirme'}
            </button>
            <button
              style={styles.modalBtnCancel}
              onClick={() => { setConfirmAction(null); setDeleteError(''); }}
              disabled={deleteLoading}
            >
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  layout: { display: 'flex', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 },
  sidebar: { width: '280px', flexShrink: 0, zIndex: 100, display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', overflowY: 'auto', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', transition: 'transform 0.25s ease' },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  appName: { fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: '700' },
  helpLink: { fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '2px' },
  discordLink: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center' },
  iconBtn: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '16px' },
  pendingBanner: { background: 'rgba(240, 180, 60, 0.12)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' },
  pendingBannerText: { fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.4' },
  pendingBannerBtn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  pendingBannerError: { color: 'var(--danger)', fontSize: '12px' },
  ipCard: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' },
  ipLabel: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' },
  ipValue: { fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: '700', color: 'var(--accent)', marginBottom: '10px' },
  copyBtn: { background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: '600' },
  addBtn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '600' },
  logoutBtn: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '8px', fontSize: '13px' },
  deleteAccountBtn: { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', fontSize: '12px', marginTop: 'auto', cursor: 'pointer' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  mobileHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' },
  hamburger: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '18px' },
  mobileTitle: { fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  emptyText: { color: 'var(--text-secondary)', fontSize: '15px' },
  backBtn: { background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', border: 'none', cursor: 'pointer', marginTop: '8px' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '16px' },
  modal: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '16px' },
  modalTitle: { fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' },
  modalText: { fontSize: '14px', color: 'var(--text-secondary)' },
  modalOption: { display: 'flex', flexDirection: 'column', gap: '8px' },
  modalOptionTitle: { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' },
  modalOptionDesc: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' },
  modalDivider: { height: '1px', background: 'var(--border)' },
  modalBtnWarn: { background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  modalBtnDanger: { background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  modalBtnCancel: { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', fontSize: '13px', cursor: 'pointer' },
  modalError: { color: 'var(--danger)', fontSize: '13px', textAlign: 'center' }
};
