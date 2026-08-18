import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import VoiceCall from './VoiceCall';
import {
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  getStoredPrivateKeyJwk
} from '../utils/crypto';

export default function Chat({
  friend,
  token,
  userId,
  hideFriendIps,
  isMobile
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [input, setInput] = useState('');
  const [spamWarning, setSpamWarning] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [friendPublicKey, setFriendPublicKey] = useState(null);
  const [sharedKey, setSharedKey] = useState(null);

  const bottomRef = useRef(null);
  const lastMessageTime = useRef(0);
  const messageCount = useRef(0);
  const messageCountTimer = useRef(null);
  const longPressTimer = useRef(null);

  const SPAM_DELAY = 1000;
  const SPAM_LIMIT = 15;

  const normalize = id => id?.toString();
  const myId = normalize(userId);

  useEffect(() => {
    return () => {
      clearTimeout(messageCountTimer.current);
    };
  }, []);

  if (!friend || !friend._id) {
    return <div style={styles.container} />;
  }

  useEffect(() => {
    let cancelled = false;

    const loadFriendKey = async () => {
      try {
        let publicKey = friend.publicKey;

        if (!publicKey) {
          const res = await axios.get(
            `/api/auth/user/${friend._id}`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          );

          publicKey = res.data?.publicKey;
        }

        if (cancelled) return;

        if (publicKey) {
          try {
            setFriendPublicKey(
              typeof publicKey === 'string'
                ? JSON.parse(publicKey)
                : publicKey
            );
          } catch {
            setFriendPublicKey(null);
          }
        } else {
          setFriendPublicKey(null);
        }
      } catch (err) {
        console.error(
          "Impossible de récupérer la clé publique de l'ami:",
          err
        );

        if (!cancelled) {
          setFriendPublicKey(null);
        }
      }
    };

    loadFriendKey();

    return () => {
      cancelled = true;
    };
  }, [friend._id, friend.publicKey, token]);

  useEffect(() => {
    let cancelled = false;

    const createSharedKey = async () => {
      setSharedKey(null);

      if (!friendPublicKey || !userId) {
        return;
      }

      try {
        const privateKeyJwk =
          getStoredPrivateKeyJwk(userId);

        if (!privateKeyJwk) {
          throw new Error(
            'Aucune clé privée locale trouvée.'
          );
        }

        const key = await deriveSharedKey(
          privateKeyJwk,
          friendPublicKey
        );

        if (!cancelled) {
          setSharedKey(key);
        }
      } catch (err) {
        console.error(
          'Erreur génération clé partagée ECDH:',
          err
        );

        if (!cancelled) {
          setSharedKey(null);
        }
      }
    };

    createSharedKey();

    return () => {
      cancelled = true;
    };
  }, [friendPublicKey, userId]);

  const decryptMessages = async (rawMessages, key) => {
    if (!key) {
      return rawMessages.map(msg => ({
        ...msg,
        content: null,
        decryptionError: true
      }));
    }

    return Promise.all(
      rawMessages.map(async msg => {
        if (!msg.content || msg.deleted) {
          return msg;
        }

        const plaintext = await decryptMessage(
          key,
          msg.content
        );

        return plaintext === null
          ? {
              ...msg,
              content: null,
              decryptionError: true
            }
          : {
              ...msg,
              content: plaintext,
              decryptionError: false
            };
      })
    );
  };

  useEffect(() => {
    let cancelled = false;

    const fetchMessages = async () => {
      if (!sharedKey) return;

      setLoading(true);
      setLoadError(null);

      try {
        const res = await axios.get(
          `/api/friends/messages/${friend._id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (cancelled) return;

        const rawMessages = Array.isArray(res.data)
          ? res.data
          : [];

        const decrypted = await decryptMessages(
          rawMessages,
          sharedKey
        );

        if (!cancelled) {
          setMessages(decrypted);
        }

        // La conversation vient d'être ouverte :
        // tous les messages reçus sont lus.
        await axios.patch(
          `/api/friends/messages/read/${friend._id}`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        ).catch(() => {});
      } catch (err) {
        console.error('fetchMessages error:', err);

        if (!cancelled) {
          setLoadError(
            'Impossible de charger les messages.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchMessages();

    return () => {
      cancelled = true;
    };
  }, [friend._id, token, sharedKey]);

  /*
   * Réception des nouveaux messages.
   *
   * Si le message reçu vient de l'ami actuellement affiché,
   * on le marque immédiatement comme lu côté serveur.
   */
  useEffect(() => {
    const handleNewMessage = async msg => {
      const senderId = (
        msg.sender?._id ||
        msg.sender
      )?.toString();

      const receiverId = (
        msg.receiver?._id ||
        msg.receiver
      )?.toString();

      const friendId = normalize(friend._id);

      const belongsToConversation =
        (
          senderId === myId ||
          senderId === friendId
        ) &&
        (
          receiverId === myId ||
          receiverId === friendId
        );

      if (!belongsToConversation) {
        return;
      }

      let decryptedMessage = {
        ...msg,
        content: null,
        decryptionError: true
      };

      if (sharedKey && msg.content) {
        const plaintext = await decryptMessage(
          sharedKey,
          msg.content
        );

        if (plaintext !== null) {
          decryptedMessage = {
            ...msg,
            content: plaintext,
            decryptionError: false
          };
        }
      }

      setMessages(prev =>
        msg._id &&
        prev.some(
          x =>
            x._id?.toString() ===
            msg._id?.toString()
        )
          ? prev
          : [...prev, decryptedMessage]
      );

      /*
       * IMPORTANT :
       * Si le message vient de l'ami et qu'on est actuellement
       * dans sa conversation, il est immédiatement considéré
       * comme lu.
       */
      if (
        senderId === friendId &&
        receiverId === myId
      ) {
        try {
          await axios.patch(
            `/api/friends/messages/read/${friendId}`,
            {},
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          );
        } catch (err) {
          console.error(
            'Erreur marquage message comme lu:',
            err
          );
        }
      }
    };

    const handleDeleted = ({ messageId }) => {
      setMessages(prev =>
        prev.filter(
          m =>
            m._id?.toString() !==
            messageId?.toString()
        )
      );
    };

    socket.on(
      'newMessage',
      handleNewMessage
    );

    socket.on(
      'messageSent',
      handleNewMessage
    );

    socket.on(
      'messageDeleted',
      handleDeleted
    );

    return () => {
      socket.off(
        'newMessage',
        handleNewMessage
      );

      socket.off(
        'messageSent',
        handleNewMessage
      );

      socket.off(
        'messageDeleted',
        handleDeleted
      );
    };
  }, [
    friend._id,
    myId,
    sharedKey,
    token
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [messages]);

  useEffect(() => {
    const close = () => {
      setContextMenu(null);
    };

    window.addEventListener(
      'click',
      close
    );

    window.addEventListener(
      'touchstart',
      close
    );

    return () => {
      window.removeEventListener(
        'click',
        close
      );

      window.removeEventListener(
        'touchstart',
        close
      );
    };
  }, []);

  const sendMessage = async () => {
    const plaintext = input.trim();

    if (!plaintext) return;

    if (!sharedKey) {
      setLoadError(
        'Chiffrement indisponible : la clé de chiffrement de votre ami n’est pas disponible.'
      );

      setTimeout(() => {
        setLoadError(null);
      }, 4000);

      return;
    }

    const now = Date.now();

    if (
      now - lastMessageTime.current <
      SPAM_DELAY
    ) {
      return;
    }

    lastMessageTime.current = now;

    messageCount.current += 1;

    clearTimeout(
      messageCountTimer.current
    );

    messageCountTimer.current =
      setTimeout(() => {
        messageCount.current = 0;
      }, 10000);

    if (
      messageCount.current >
      SPAM_LIMIT
    ) {
      setSpamWarning(true);

      setTimeout(() => {
        setSpamWarning(false);
      }, 3000);

      return;
    }

    try {
      const encryptedContent =
        await encryptMessage(
          sharedKey,
          plaintext
        );

      socket.emit('sendMessage', {
        receiverId: friend._id,
        content: encryptedContent
      });

      setInput('');
    } catch (err) {
      console.error(err);

      setLoadError(
        'Impossible de chiffrer le message.'
      );
    }
  };

  const deleteMessage = async msgId => {
    setMessages(prev =>
      prev.filter(m => m._id !== msgId)
    );

    setContextMenu(null);

    try {
      await axios.delete(
        `/api/friends/messages/${msgId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = msg => {
    if (
      msg.decryptionError ||
      typeof msg.content !== 'string'
    ) {
      return;
    }

    setEditingId(msg._id);
    setEditContent(msg.content);
    setContextMenu(null);
  };

  const saveEdit = async msgId => {
    const plaintext = editContent.trim();

    if (!plaintext || !sharedKey) {
      return;
    }

    try {
      const encryptedContent =
        await encryptMessage(
          sharedKey,
          plaintext
        );

      await axios.patch(
        `/api/friends/messages/${msgId}`,
        {
          content: encryptedContent
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setMessages(prev =>
        prev.map(m =>
          m._id === msgId
            ? {
                ...m,
                content: plaintext,
                edited: true
              }
            : m
        )
      );

      setEditingId(null);
      setEditContent('');
    } catch (err) {
      console.error(
        'Erreur modification message:',
        err
      );
    }
  };

  const getMenuPosition = (
    x,
    y,
    isTouch = false
  ) => {
    const menuWidth = 160;
    const menuHeight = 90;
    const margin = 8;

    let left = isTouch
      ? x - menuWidth / 2
      : x - menuWidth - margin;

    let top = isTouch
      ? y - menuHeight - 16
      : y;

    left = Math.max(
      margin,
      Math.min(
        left,
        window.innerWidth -
          menuWidth -
          margin
      )
    );

    top = Math.max(
      margin,
      Math.min(
        top,
        window.innerHeight -
          menuHeight -
          margin
      )
    );

    return {
      left,
      top
    };
  };

  const handleRightClick = (
    e,
    msg
  ) => {
    const senderId = (
      msg.sender?._id ||
      msg.sender
    )?.toString();

    if (
      senderId !== myId ||
      msg.deleted
    ) {
      return;
    }

    e.preventDefault();

    setContextMenu({
      ...getMenuPosition(
        e.clientX,
        e.clientY
      ),
      msg
    });
  };

  const handleTouchStart = (
    e,
    msg
  ) => {
    const senderId = (
      msg.sender?._id ||
      msg.sender
    )?.toString();

    if (
      senderId !== myId ||
      msg.deleted
    ) {
      return;
    }

    const touch = e.touches[0];

    longPressTimer.current =
      setTimeout(() => {
        setContextMenu({
          ...getMenuPosition(
            touch.clientX,
            touch.clientY,
            true
          ),
          msg
        });
      }, 500);
  };

  const handleTouchEnd = () => {
    clearTimeout(
      longPressTimer.current
    );
  };

  const handleTouchMove = () => {
    clearTimeout(
      longPressTimer.current
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerAvatar}>
          {friend.username
            ? friend.username[0].toUpperCase()
            : '?'}
        </div>

        <div>
          <p style={styles.headerName}>
            {friend.username || 'Ami'}
          </p>

          <p style={styles.headerIp}>
            {hideFriendIps
              ? '███.███.███.███'
              : friend.ipAlias}
          </p>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <button
            style={styles.callBtn}
            onClick={() =>
              setInCall(true)
            }
          >
            📞
          </button>

          <div
            style={{
              ...styles.onlineDot,
              background:
                friend.isOnline
                  ? 'var(--success)'
                  : 'var(--text-muted)'
            }}
          />
        </div>
      </div>

      <div style={styles.messages}>
        {loading && (
          <p style={styles.infoText}>
            Chargement des messages...
          </p>
        )}

        {!loading && loadError && (
          <p
            style={{
              ...styles.infoText,
              color: 'var(--danger)'
            }}
          >
            {loadError}
          </p>
        )}

        {!loading &&
          !loadError &&
          messages
            .filter(msg => !msg.deleted)
            .map((msg, i) => {
              const senderId = (
                msg.sender?._id ||
                msg.sender
              )?.toString();

              const isMe =
                senderId === myId;

              const content =
                msg.decryptionError
                  ? '🔒 Message impossible à déchiffrer'
                  : typeof msg.content ===
                    'string'
                  ? msg.content
                  : '';

              return (
                <div
                  key={
                    msg._id || i
                  }
                  style={{
                    display: 'flex',
                    justifyContent:
                      isMe
                        ? 'flex-end'
                        : 'flex-start'
                  }}
                >
                  <div
                    style={{
                      ...styles.bubble,
                      background: isMe
                        ? 'var(--accent)'
                        : 'var(--bg-tertiary)'
                    }}
                    onContextMenu={e =>
                      handleRightClick(
                        e,
                        msg
                      )
                    }
                    onTouchStart={e =>
                      handleTouchStart(
                        e,
                        msg
                      )
                    }
                    onTouchEnd={
                      handleTouchEnd
                    }
                    onTouchMove={
                      handleTouchMove
                    }
                  >
                    {editingId ===
                    msg._id ? (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection:
                            'column',
                          gap: 6
                        }}
                      >
                        <input
                          style={
                            styles.editInput
                          }
                          value={
                            editContent
                          }
                          onChange={e =>
                            setEditContent(
                              e.target.value
                            )
                          }
                          onKeyDown={e => {
                            if (
                              e.key ===
                              'Enter'
                            ) {
                              saveEdit(
                                msg._id
                              );
                            }

                            if (
                              e.key ===
                              'Escape'
                            ) {
                              setEditingId(
                                null
                              );
                            }
                          }}
                          autoFocus
                        />

                        <div
                          style={{
                            display: 'flex',
                            gap: 4,
                            justifyContent:
                              'flex-end'
                          }}
                        >
                          <button
                            style={
                              styles.editBtn
                            }
                            onClick={() =>
                              saveEdit(
                                msg._id
                              )
                            }
                          >
                            ✓
                          </button>

                          <button
                            style={
                              styles.cancelBtn
                            }
                            onClick={() =>
                              setEditingId(
                                null
                              )
                            }
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p
                          style={
                            styles.text
                          }
                        >
                          {content}
                        </p>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent:
                              'flex-end',
                            alignItems:
                              'center',
                            gap: 4
                          }}
                        >
                          {msg.edited && (
                            <p
                              style={
                                styles.editedLabel
                              }
                            >
                              modifié
                            </p>
                          )}

                          <p
                            style={
                              styles.msgTime
                            }
                          >
                            {msg.createdAt
                              ? new Date(
                                  msg.createdAt
                                ).toLocaleTimeString(
                                  'fr-FR',
                                  {
                                    hour: '2-digit',
                                    minute:
                                      '2-digit'
                                  }
                                )
                              : ''}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

        <div ref={bottomRef} />
      </div>

      {contextMenu && (
        <div
          style={{
            ...styles.contextMenu,
            top: contextMenu.top,
            left: contextMenu.left
          }}
          onClick={e =>
            e.stopPropagation()
          }
          onTouchStart={e =>
            e.stopPropagation()
          }
        >
          <button
            style={styles.contextItem}
            onClick={() =>
              startEdit(
                contextMenu.msg
              )
            }
          >
            ✏️ Modifier
          </button>

          <button
            style={{
              ...styles.contextItem,
              color: 'var(--danger)'
            }}
            onClick={() =>
              deleteMessage(
                contextMenu.msg._id
              )
            }
          >
            🗑️ Supprimer
          </button>
        </div>
      )}

      {spamWarning && (
        <div style={styles.spamAlert}>
          ⚠️ Envoie moins vite !
        </div>
      )}

      <div style={styles.inputBar}>
        <input
          value={input}
          onChange={e =>
            setInput(e.target.value)
          }
          onKeyDown={e =>
            e.key === 'Enter' &&
            sendMessage()
          }
          placeholder={`Message à ${
            friend.username || ''
          }...`}
          style={styles.input}
        />

        <button
          onClick={sendMessage}
          style={styles.btn}
        >
          ➤
        </button>
      </div>

      {inCall && (
        <VoiceCall
          friend={friend}
          userId={userId}
          onClose={() =>
            setInCall(false)
          }
          incomingOffer={null}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'relative'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    background: 'var(--bg-secondary)',
    borderBottom:
      '1px solid var(--border)',
    flexShrink: 0
  },

  headerAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--accent)',
    flexShrink: 0
  },

  headerName: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },

  headerIp: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)'
  },

  onlineDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0
  },

  callBtn: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '16px',
    cursor: 'pointer'
  },

  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },

  infoText: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px',
    padding: '20px 0'
  },

  bubble: {
    maxWidth: '65%',
    padding: '10px 14px',
    borderRadius: '12px',
    cursor: 'context-menu',
    userSelect: 'none',
    WebkitUserSelect: 'none'
  },

  text: {
    color: '#fff',
    fontSize: '14px',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere'
  },

  editedLabel: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic'
  },

  msgTime: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.4)',
    marginTop: '4px'
  },

  editInput: {
    background:
      'rgba(255,255,255,0.1)',
    border:
      '1px solid rgba(255,255,255,0.3)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#fff',
    fontSize: '14px',
    width: '100%'
  },

  editBtn: {
    background: 'var(--success)',
    color: '#fff',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '13px'
  },

  cancelBtn: {
    background:
      'rgba(255,255,255,0.2)',
    color: '#fff',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '13px'
  },

  contextMenu: {
    position: 'fixed',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '4px',
    zIndex: 200,
    boxShadow: 'var(--shadow)',
    display: 'flex',
    flexDirection: 'column',
    minWidth: '150px'
  },

  contextItem: {
    background: 'transparent',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    borderRadius: '6px',
    fontSize: '14px',
    textAlign: 'left',
    cursor: 'pointer'
  },

  spamAlert: {
    textAlign: 'center',
    padding: '8px',
    color: 'var(--danger)',
    fontSize: '13px',
    fontWeight: '600',
    background:
      'rgba(240,91,91,0.1)',
    borderTop:
      '1px solid var(--danger)'
  },

  inputBar: {
    display: 'flex',
    padding: '16px',
    gap: '8px',
    borderTop:
      '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0
  },

  input: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border:
      '1px solid var(--border)',
    background:
      'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '14px'
  },

  btn: {
    padding: '10px 14px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '8px',
    fontSize: '16px'
  }
};