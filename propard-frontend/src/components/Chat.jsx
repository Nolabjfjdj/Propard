import React, { useEffect, useState, useRef } from 'react';
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
  isMobile,
  onGrabStart,
  grabbedMessageId
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

  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  const bottomRef = useRef(null);
  const lastMessageTime = useRef(0);
  const messageCount = useRef(0);
  const messageCountTimer = useRef(null);
  const longPressTimer = useRef(null);

  // --- Grab & Send : détection double-tap puis maintien du 2e tap ---
  // Fonctionne identiquement en souris (PC) et tactile (mobile) grâce aux
  // Pointer Events, qui unifient les deux sans code séparé.
  const lastTapRef = useRef({ id: null, time: 0 });
  const grabHoldTimerRef = useRef(null);
  const grabCandidateRef = useRef(null);
  const DOUBLE_TAP_WINDOW_MS = 300;
  const HOLD_TO_GRAB_MS = 180;
  const MOVE_CANCEL_PX = 12;

  const SPAM_DELAY = 1000;
  const SPAM_LIMIT = 15;

  const normalize = id => id?.toString();
  const myId = normalize(userId);

  useEffect(() => {
    return () => {
      clearTimeout(messageCountTimer.current);
      clearTimeout(grabHoldTimerRef.current);
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
          'Impossible de récupérer la clé publique de l’ami:',
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

  const openReport = msg => {
    setReportTarget(msg);
    setReportReason('');
    setReportError('');
    setReportSuccess(false);
    setContextMenu(null);
  };

  const closeReport = () => {
    setReportTarget(null);
    setReportReason('');
    setReportError('');
    setReportSuccess(false);
  };

  // Le client déchiffre déjà le message pour l'afficher — c'est ce texte
  // en clair qui est envoyé, une seule fois, uniquement pour ce
  // signalement précis. Le serveur ne peut techniquement pas déchiffrer
  // lui-même un message E2E.
  const submitReport = async () => {
    if (!reportTarget || reportTarget.decryptionError) return;

    const senderId = (
      reportTarget.sender?._id ||
      reportTarget.sender
    )?.toString();

    setReportLoading(true);
    setReportError('');

    try {
      await axios.post(
        '/api/reports',
        {
          messageId: reportTarget._id,
          reportedUserId: senderId,
          content: reportTarget.content,
          reason: reportReason.trim() || undefined
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setReportSuccess(true);

      setTimeout(() => {
        closeReport();
      }, 1800);
    } catch (err) {
      setReportError(
        err.response?.data?.error ||
        'Erreur lors de l’envoi du signalement.'
      );
    } finally {
      setReportLoading(false);
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
    if (msg.deleted) {
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
    if (msg.deleted) {
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

  // --- Grab & Send : handlers additifs, n'interfèrent pas avec le
  // menu contextuel existant (clic droit / appui long classique) ---

  const clearGrabHold = () => {
    clearTimeout(grabHoldTimerRef.current);
    grabHoldTimerRef.current = null;
    grabCandidateRef.current = null;
  };

  const handleBubblePointerDown = (e, msg) => {
    if (msg.deleted || msg.decryptionError) return;

    const now = Date.now();
    const wasDoubleTap =
      lastTapRef.current.id === msg._id &&
      now - lastTapRef.current.time < DOUBLE_TAP_WINDOW_MS;

    if (wasDoubleTap) {
      // Le 2e tap démarre le geste potentiel : on bloque le comportement
      // natif du navigateur pour éviter sélection de texte (iOS) et scroll
      // parasite (Android), sans empêcher le scroll normal du 1er tap.
      e.preventDefault();
      if (typeof window !== 'undefined' && window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }

      lastTapRef.current = { id: null, time: 0 };

      const rect = e.currentTarget.getBoundingClientRect();

      grabCandidateRef.current = {
        msg,
        startX: e.clientX,
        startY: e.clientY,
        rect
      };

      grabHoldTimerRef.current = setTimeout(() => {
        const c = grabCandidateRef.current;
        if (c) {
          // On annule le menu contextuel (appui long) qui aurait pu être
          // programmé par ce même 2e tap, pour éviter qu'il s'ouvre
          // par-dessus le glisser.
          clearTimeout(longPressTimer.current);

          if (onGrabStart) {
            onGrabStart({
              msg: c.msg,
              clientX: c.startX,
              clientY: c.startY,
              rect: c.rect
            });
          }
        }
        grabCandidateRef.current = null;
      }, HOLD_TO_GRAB_MS);
    } else {
      lastTapRef.current = { id: msg._id, time: now };
    }
  };

  const handleBubblePointerMoveGrabCheck = e => {
    const c = grabCandidateRef.current;
    if (!c) return;

    const dx = e.clientX - c.startX;
    const dy = e.clientY - c.startY;

    if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) {
      clearGrabHold();
    }
  };

  const handleBubblePointerUpCancel = () => {
    clearGrabHold();
  };

  const formatDateSeparator = date => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date();

    yesterday.setDate(
      yesterday.getDate() - 1
    );

    if (
      d.toDateString() ===
      today.toDateString()
    ) {
      return "Aujourd'hui";
    }

    if (
      d.toDateString() ===
      yesterday.toDateString()
    ) {
      return 'Hier';
    }

    return d.toLocaleDateString(
      'fr-FR',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }
    );
  };

  const shouldShowDateSeparator = (
    messages,
    index
  ) => {
    if (index === 0) return true;

    const curr = new Date(
      messages[index].createdAt
    );

    const prev = new Date(
      messages[index - 1].createdAt
    );

    return (
      curr.toDateString() !==
      prev.toDateString()
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
            .map((msg, i, arr) => {
              const senderId = (
                msg.sender?._id ||
                msg.sender
              )?.toString();

              const isMe =
                senderId === myId;

              const isBeingGrabbed =
                grabbedMessageId &&
                msg._id &&
                grabbedMessageId.toString() ===
                  msg._id.toString();

              const content =
                msg.decryptionError
                  ? '🔒 Message impossible à déchiffrer'
                  : typeof msg.content ===
                    'string'
                  ? msg.content
                  : '';

              const showSeparator =
                msg.createdAt &&
                shouldShowDateSeparator(
                  arr,
                  i
                );

              return (
                <React.Fragment
                  key={msg._id || i}
                >
                  {showSeparator && (
                    <div
                      style={
                        styles.dateSeparator
                      }
                    >
                      <div
                        style={
                          styles.dateLine
                        }
                      />

                      <span
                        style={
                          styles.dateText
                        }
                      >
                        {formatDateSeparator(
                          msg.createdAt
                        )}
                      </span>

                      <div
                        style={
                          styles.dateLine
                        }
                      />
                    </div>
                  )}

                  <div
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
                          : 'var(--bg-tertiary)',
                        opacity: isBeingGrabbed ? 0 : 1
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
                      onPointerDown={e =>
                        handleBubblePointerDown(e, msg)
                      }
                      onPointerMove={e => {
                        if (grabCandidateRef.current) e.preventDefault();
                        handleBubblePointerMoveGrabCheck(e);
                      }}
                      onPointerUp={
                        handleBubblePointerUpCancel
                      }
                      onPointerCancel={
                        handleBubblePointerUpCancel
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
                </React.Fragment>
              );
            })}

        <div ref={bottomRef} />
      </div>

      {contextMenu && (() => {
        const senderId = (
          contextMenu.msg.sender?._id ||
          contextMenu.msg.sender
        )?.toString();
        const isMe = senderId === myId;

        return (
          <div
            style={{
              ...styles.contextMenu,
              top: contextMenu.top,
              left: contextMenu.left
            }}
            onClick={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            {isMe ? (
              <>
                <button
                  style={styles.contextItem}
                  onClick={() => startEdit(contextMenu.msg)}
                >
                  ✏️ Modifier
                </button>
                <button
                  style={{ ...styles.contextItem, color: 'var(--danger)' }}
                  onClick={() => deleteMessage(contextMenu.msg._id)}
                >
                  🗑️ Supprimer
                </button>
              </>
            ) : (
              <button
                style={{ ...styles.contextItem, color: 'var(--danger)' }}
                onClick={() => openReport(contextMenu.msg)}
              >
                🚩 Signaler
              </button>
            )}
          </div>
        );
      })()}

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

      {reportTarget && (
        <div style={styles.modalOverlay} onClick={closeReport}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🚩 Signaler ce message</h2>
            <p style={styles.modalDesc}>
              Ce message, uniquement celui-ci, en clair, sera envoyé à l'équipe Propard pour modération. Le reste de ta conversation reste privé.
            </p>

            <p style={styles.reportedContent}>
              {reportTarget.decryptionError
                ? '🔒 Message impossible à déchiffrer'
                : reportTarget.content}
            </p>

            <textarea
              style={styles.reportTextarea}
              placeholder="Motif (optionnel)"
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              rows={3}
              disabled={reportLoading || reportSuccess}
            />

            {reportError && (
              <p style={styles.modalError}>{reportError}</p>
            )}

            {reportSuccess ? (
              <p style={styles.reportSuccess}>✓ Signalement envoyé, merci.</p>
            ) : (
              <>
                <button
                  style={styles.modalBtnDanger}
                  onClick={submitReport}
                  disabled={reportLoading || reportTarget.decryptionError}
                >
                  {reportLoading ? '...' : 'Envoyer le signalement'}
                </button>
                <button
                  style={styles.modalBtnCancel}
                  onClick={closeReport}
                  disabled={reportLoading}
                >
                  Annuler
                </button>
              </>
            )}
          </div>
        </div>
      )}

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

  dateSeparator: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '8px 0'
  },

  dateLine: {
    flex: 1,
    height: '1px',
    background: 'var(--border)'
  },

  dateText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    padding: '0 4px'
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
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    touchAction: 'pan-y'
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
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },

  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)'
  },

  modalDesc: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.5'
  },

  reportedContent: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: '120px',
    overflowY: 'auto'
  },

  reportTextarea: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    resize: 'vertical',
    fontFamily: 'inherit'
  },

  reportSuccess: {
    color: 'var(--success)',
    fontSize: '13px',
    textAlign: 'center',
    fontWeight: '600'
  },

  modalBtnDanger: {
    background: 'var(--danger)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  modalBtnCancel: {
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '13px',
    cursor: 'pointer'
  },

  modalError: {
    color: 'var(--danger)',
    fontSize: '13px',
    textAlign: 'center'
  }
};
