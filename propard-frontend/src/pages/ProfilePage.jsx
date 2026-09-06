import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function ProfilePage({
  userId,
  isMobile,
  onBack,
  onOpenChat,
  onRelationshipChanged
}) {
  const {
    user: currentUser,
    token,
    updateUser
  } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarPreview, setEditAvatarPreview] = useState(null);
  const [editAvatarData, setEditAvatarData] = useState(undefined);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState('');

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);

  const fetchProfile = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await axios.get(
        `/api/auth/user/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setProfile(res.data);
      setNicknameValue(
        res.data.friendNickname || ''
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Impossible de charger ce profil'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId || !token) return;

    fetchProfile();

    setIsEditing(false);
    setMenuOpen(false);
    setConfirmAction(null);
    setEditingNickname(false);
  }, [userId, token]);

  useEffect(() => {
    const close = () => setMenuOpen(false);

    window.addEventListener(
      'click',
      close
    );

    return () =>
      window.removeEventListener(
        'click',
        close
      );
  }, []);

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.infoText}>
          Chargement du profil...
        </p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={styles.container}>
        <p
          style={{
            ...styles.infoText,
            color: 'var(--danger)'
          }}
        >
          {error || 'Profil introuvable'}
        </p>
      </div>
    );
  }

  const displayLabel =
    profile.displayName ||
    profile.username ||
    '';

  const initial =
    (displayLabel[0] || '?').toUpperCase();

  const startEditing = () => {
    setEditDisplayName(
      profile.displayName || ''
    );

    setEditAvatarPreview(
      profile.avatar || null
    );

    setEditAvatarData(undefined);
    setSaveError('');
    setIsEditing(true);
  };

  const handleAvatarPick = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setSaveError(
        'Image trop lourde (2 Mo max avant compression)'
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const MAX = 256;

        const scale = Math.min(
          1,
          MAX /
            Math.max(
              img.width,
              img.height
            )
        );

        const canvas =
          document.createElement('canvas');

        canvas.width =
          Math.round(
            img.width * scale
          );

        canvas.height =
          Math.round(
            img.height * scale
          );

        const ctx =
          canvas.getContext('2d');

        ctx.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        );

        const dataUrl =
          canvas.toDataURL(
            'image/jpeg',
            0.85
          );

        setEditAvatarPreview(dataUrl);
        setEditAvatarData(dataUrl);
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    setSaving(true);
    setSaveError('');

    try {
      const body = {
        displayName: editDisplayName
      };

      if (editAvatarData !== undefined) {
        body.avatar = editAvatarData;
      }

      const res = await axios.patch(
        '/api/auth/me',
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setProfile(prev => ({
        ...prev,
        ...res.data.user,
        isOwnProfile: true
      }));

      updateUser({
        displayName:
          res.data.user.displayName,
        avatar:
          res.data.user.avatar
      });

      setIsEditing(false);
    } catch (err) {
      setSaveError(
        err.response?.data?.error ||
        'Erreur serveur'
      );
    } finally {
      setSaving(false);
    }
  };

  const saveNickname = async () => {
    try {
      const nickname =
        nicknameValue.trim() || null;

      await axios.patch(
        '/api/friends/nickname',
        {
          friendId: userId,
          nickname
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setProfile(prev => ({
        ...prev,
        friendNickname: nickname
      }));

      setEditingNickname(false);

      onRelationshipChanged?.(
        'nicknameChanged',
        userId,
        nickname
      );
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
        'Erreur serveur'
      );
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(
        userId
      );

      setCopied(true);

      setTimeout(
        () => setCopied(false),
        1500
      );
    } catch {
      setActionError(
        'Impossible de copier l’ID'
      );
    }
  };

  const sendFriendRequest = async () => {
    setActionLoading(true);
    setActionError('');

    try {
      await axios.post(
        '/api/friends/add',
        { userId },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      await fetchProfile();

      onRelationshipChanged?.(
        'added',
        userId
      );
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
        'Erreur serveur'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const respondRequest = async (accept) => {
    setActionLoading(true);
    setActionError('');

    try {
      await axios.post(
        `/api/friends/${
          accept ? 'accept' : 'decline'
        }`,
        {
          fromUserId: userId
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      await fetchProfile();

      onRelationshipChanged?.(
        accept ? 'accepted' : 'declined',
        userId
      );
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
        'Erreur serveur'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const removeFriend = async () => {
    setActionLoading(true);
    setActionError('');

    try {
      await axios.delete(
        `/api/friends/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setConfirmAction(null);

      await fetchProfile();

      onRelationshipChanged?.(
        'removed',
        userId
      );
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
        'Erreur serveur'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const blockUser = async () => {
    setActionLoading(true);
    setActionError('');

    try {
      await axios.post(
        `/api/friends/block/${userId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setConfirmAction(null);

      await fetchProfile();

      onRelationshipChanged?.(
        'blocked',
        userId
      );
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
        'Erreur serveur'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const unblockUser = async () => {
    setActionLoading(true);
    setActionError('');

    try {
      await axios.post(
        `/api/friends/unblock/${userId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      await fetchProfile();

      onRelationshipChanged?.(
        'unblocked',
        userId
      );
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
        'Erreur serveur'
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.avatarWrap}>
          {isEditing ? (
            <>
              <div
                style={styles.avatarLarge}
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                {editAvatarPreview ? (
                  <img
                    src={editAvatarPreview}
                    alt=""
                    style={styles.avatarImg}
                  />
                ) : (
                  initial
                )}
              </div>

              <button
                type="button"
                style={styles.avatarEditHint}
                onClick={() =>
                  fileInputRef.current?.click()
                }
                aria-label="Modifier la photo de profil"
              >
                ✏
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{
                  display: 'none'
                }}
                onChange={handleAvatarPick}
              />
            </>
          ) : (
            <div style={styles.avatarLarge}>
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt=""
                  style={styles.avatarImg}
                />
              ) : (
                initial
              )}
            </div>
          )}

          {!isEditing && (
            <div
              style={{
                ...styles.onlineDot,
                background:
                  profile.isOnline
                    ? 'var(--success)'
                    : 'var(--text-muted)'
              }}
            />
          )}
        </div>

        {isEditing ? (
          <input
            style={styles.editNameInput}
            value={editDisplayName}
            maxLength={32}
            placeholder={profile.username}
            onChange={e =>
              setEditDisplayName(
                e.target.value
              )
            }
          />
        ) : (
          <>
            <p style={styles.displayName}>
              {profile.isFriend &&
              profile.friendNickname
                ? profile.friendNickname
                : displayLabel}
            </p>

            <p style={styles.username}>
              @{profile.username}
            </p>
          </>
        )}

        <div style={styles.idRow}>
          <span style={styles.idValue}>
            {userId}
          </span>

          <button
            style={styles.copyBtn}
            onClick={copyId}
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>

        {saveError && (
          <p style={styles.errorText}>
            {saveError}
          </p>
        )}

        {actionError && (
          <p style={styles.errorText}>
            {actionError}
          </p>
        )}

        {isEditing ? (
          <div style={styles.actionsRow}>
            <button
              style={styles.primaryBtn}
              onClick={saveProfile}
              disabled={saving}
            >
              {saving
                ? '...'
                : 'Enregistrer'}
            </button>

            <button
              style={styles.secondaryBtn}
              onClick={() =>
                setIsEditing(false)
              }
              disabled={saving}
            >
              Annuler
            </button>
          </div>
        ) : profile.isOwnProfile ? (
          <div style={styles.actionsRow}>
            <button
              style={styles.primaryBtn}
              onClick={startEditing}
            >
              Modifier le profil
            </button>
          </div>
        ) : profile.isBlockedByMe ? (
          <div style={styles.actionsRow}>
            <button
              style={styles.secondaryBtn}
              onClick={unblockUser}
              disabled={actionLoading}
            >
              {actionLoading
                ? '...'
                : 'Débloquer'}
            </button>
          </div>
        ) : profile.isFriend ? (
          <div style={styles.actionsRow}>
            <button
              style={styles.primaryBtn}
              onClick={() =>
                onOpenChat({
                  _id: profile._id,
                  username:
                    profile.username,
                  displayName:
                    profile.displayName,
                  avatar:
                    profile.avatar,
                  ipAlias:
                    profile.ipAlias,
                  isOnline:
                    profile.isOnline,
                  publicKey:
                    profile.publicKey,
                  nickname:
                    profile.friendNickname ||
                    null
                })
              }
            >
              💬 Message
            </button>

            <div
              style={{
                position: 'relative'
              }}
            >
              <button
                style={styles.secondaryBtn}
                onClick={e => {
                  e.stopPropagation();
                  setMenuOpen(
                    v => !v
                  );
                }}
              >
                ⋯
              </button>

              {menuOpen && (
                <div
                  style={styles.dropdown}
                  onClick={e =>
                    e.stopPropagation()
                  }
                >
                  <button
                    style={
                      styles.dropdownItem
                    }
                    onClick={() => {
                      setEditingNickname(
                        true
                      );
                      setNicknameValue(
                        profile.friendNickname ||
                        ''
                      );
                      setMenuOpen(false);
                    }}
                  >
                    ✏ Modifier le surnom
                  </button>

                  <button
                    style={{
                      ...styles.dropdownItem,
                      color: 'var(--danger)'
                    }}
                    onClick={() => {
                      setConfirmAction(
                        'removeFriend'
                      );
                      setMenuOpen(false);
                    }}
                  >
                    🗑 Supprimer l'ami
                  </button>

                  <button
                    style={{
                      ...styles.dropdownItem,
                      color: 'var(--danger)'
                    }}
                    onClick={() => {
                      setConfirmAction(
                        'block'
                      );
                      setMenuOpen(false);
                    }}
                  >
                    🚫 Bloquer
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : profile.requestReceivedByMe ? (
          <div style={styles.actionsRow}>
            <button
              style={styles.primaryBtn}
              onClick={() =>
                respondRequest(true)
              }
              disabled={actionLoading}
            >
              ✓ Accepter
            </button>

            <button
              style={styles.secondaryBtn}
              onClick={() =>
                respondRequest(false)
              }
              disabled={actionLoading}
            >
              ✕ Refuser
            </button>
          </div>
        ) : profile.requestSentByMe ? (
          <div style={styles.actionsRow}>
            <button
              style={styles.secondaryBtn}
              disabled
            >
              Demande envoyée
            </button>
          </div>
        ) : (
          <div style={styles.actionsRow}>
            <button
              style={styles.primaryBtn}
              onClick={sendFriendRequest}
              disabled={actionLoading}
            >
              {actionLoading
                ? '...'
                : '+ Ajouter comme ami'}
            </button>

            <button
              style={styles.secondaryBtn}
              onClick={() =>
                setConfirmAction('block')
              }
            >
              🚫 Bloquer
            </button>
          </div>
        )}

        {editingNickname && (
          <div
            style={styles.nicknameEditRow}
          >
            <input
              style={styles.nicknameInput}
              value={nicknameValue}
              maxLength={32}
              placeholder={profile.username}
              onChange={e =>
                setNicknameValue(
                  e.target.value
                )
              }
              onKeyDown={e =>
                e.key === 'Enter' &&
                saveNickname()
              }
              autoFocus
            />

            <button
              style={styles.copyBtn}
              onClick={saveNickname}
            >
              ✓
            </button>

            <button
              style={styles.copyBtn}
              onClick={() =>
                setEditingNickname(false)
              }
            >
              ✕
            </button>
          </div>
        )}

        {!profile.isOwnProfile &&
          !profile.isBlockedByMe &&
          typeof profile.mutualFriendsCount ===
            'number' && (
            <div
              style={styles.mutualBlock}
            >
              <p
                style={
                  styles.mutualTitle
                }
              >
                {profile.mutualFriendsCount ===
                0
                  ? 'Aucun ami en commun'
                  : `${
                      profile.mutualFriendsCount
                    } ami${
                      profile.mutualFriendsCount >
                      1
                        ? 's'
                        : ''
                    } en commun`}
              </p>

              {profile.mutualFriends
                ?.length > 0 && (
                <div
                  style={
                    styles.mutualList
                  }
                >
                  {profile.mutualFriends.map(
                    f => (
                      <div
                        key={f._id}
                        style={
                          styles.mutualItem
                        }
                      >
                        <div
                          style={
                            styles.mutualAvatar
                          }
                        >
                          {f.avatar ? (
                            <img
                              src={f.avatar}
                              alt=""
                              style={
                                styles.avatarImg
                              }
                            />
                          ) : (
                            (
                              f.displayName ||
                              f.username ||
                              '?'
                            )[0].toUpperCase()
                          )}
                        </div>

                        <span
                          style={
                            styles.mutualName
                          }
                        >
                          {f.displayName ||
                            f.username}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}
      </div>

      {confirmAction && (
        <div
          style={styles.modalOverlay}
          onClick={() =>
            setConfirmAction(null)
          }
        >
          <div
            style={styles.modal}
            onClick={e =>
              e.stopPropagation()
            }
          >
            <h3
              style={styles.modalTitle}
            >
              {confirmAction ===
              'removeFriend'
                ? 'Supprimer cet ami ?'
                : 'Bloquer cet utilisateur ?'}
            </h3>

            <p
              style={styles.modalDesc}
            >
              {confirmAction ===
              'removeFriend'
                ? "Vous ne serez plus amis. Vos messages existants ne seront pas supprimés."
                : "Il ne pourra plus vous envoyer de demande d'ami ni de message. Vos messages existants ne seront pas supprimés."}
            </p>

            {actionError && (
              <p
                style={
                  styles.errorText
                }
              >
                {actionError}
              </p>
            )}

            <div
              style={
                styles.actionsRow
              }
            >
              <button
                style={
                  styles.dangerBtn
                }
                onClick={
                  confirmAction ===
                  'removeFriend'
                    ? removeFriend
                    : blockUser
                }
                disabled={
                  actionLoading
                }
              >
                {actionLoading
                  ? '...'
                  : 'Confirmer'}
              </button>

              <button
                style={
                  styles.secondaryBtn
                }
                onClick={() =>
                  setConfirmAction(
                    null
                  )
                }
                disabled={
                  actionLoading
                }
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflowY: 'auto'
  },

  infoText: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '14px',
    padding: '40px 20px'
  },

  card: {
    maxWidth: '440px',
    width: '100%',
    margin: '32px auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '0 20px 40px'
  },

  avatarWrap: {
    position: 'relative',
    marginBottom: '8px'
  },

  avatarLarge: {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    background: 'var(--accent-glow)',
    border: '2px solid var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--accent)',
    overflow: 'hidden',
    cursor: 'pointer',
    position: 'relative'
  },

  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },

  avatarEditHint: {
    position: 'absolute',
    bottom: '0px',
    right: '0px',
    zIndex: 10,
    background: 'var(--bg-secondary)',
    border: '2px solid var(--bg-primary)',
    borderRadius: '50%',
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    lineHeight: 1,
    padding: 0,
    cursor: 'pointer',
    color: 'var(--text-primary)',
    boxShadow: 'var(--shadow)'
  },

  onlineDot: {
    position: 'absolute',
    bottom: '4px',
    right: '4px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '2px solid var(--bg-primary)'
  },

  displayName: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-primary)'
  },

  username: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)'
  },

  editNameInput: {
    fontSize: '18px',
    fontWeight: '600',
    textAlign: 'center',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: 'var(--text-primary)',
    width: '100%'
  },

  idRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '6px 10px',
    maxWidth: '100%'
  },

  idValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  copyBtn: {
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    flexShrink: 0
  },

  errorText: {
    color: 'var(--danger)',
    fontSize: '13px',
    textAlign: 'center'
  },

  actionsRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%'
  },

  primaryBtn: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  secondaryBtn: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    cursor: 'pointer'
  },

  dangerBtn: {
    background: 'var(--danger)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  dropdown: {
    position: 'absolute',
    top: '110%',
    right: 0,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
    minWidth: '180px',
    zIndex: 50,
    boxShadow: 'var(--shadow)'
  },

  dropdownItem: {
    background: 'transparent',
    color: 'var(--text-primary)',
    padding: '10px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },

  nicknameEditRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    marginTop: '4px',
    width: '100%'
  },

  nicknameInput: {
    flex: 1,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 10px',
    color: 'var(--text-primary)',
    fontSize: '13px'
  },

  mutualBlock: {
    marginTop: '16px',
    width: '100%',
    borderTop: '1px solid var(--border)',
    paddingTop: '16px'
  },

  mutualTitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  },

  mutualList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px'
  },

  mutualItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    width: '64px'
  },

  mutualAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--accent)',
    overflow: 'hidden'
  },

  mutualName: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%'
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
    padding: '16px'
  },

  modal: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '28px',
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },

  modalTitle: {
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--text-primary)'
  },

  modalDesc: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.5'
  }
};