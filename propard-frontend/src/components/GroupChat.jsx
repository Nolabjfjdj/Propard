import {
  useEffect,
  useRef,
  useState
} from 'react';

import axios from 'axios';
import socket from '../socket';

import {
  getStoredPrivateKeyJwk,
  encryptMessage,
  decryptMessage
} from '../utils/crypto';

import {
  decryptGroupKeyPackage,
  encryptGroupKeyForMember,
  generateGroupKey,
  getStoredGroupKey,
  storeGroupKey
} from '../utils/groupCrypto';

export default function GroupChat({
  group: initialGroup,
  token,
  userId,
  onBack,
  onDeleted
}) {
  const [
    group,
    setGroup
  ] = useState(initialGroup);

  const [
    messages,
    setMessages
  ] = useState([]);

  const [
    key,
    setKey
  ] = useState(null);

  const [
    input,
    setInput
  ] = useState('');

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    error,
    setError
  ] = useState('');

  const [
    resolvedUserId,
    setResolvedUserId
  ] = useState(
    userId?.toString() || null
  );

  const bottomRef =
    useRef(null);

  /*
   * Si AppPage ne fournit pas userId,
   * on le récupère directement depuis
   * /api/auth/me.
   */
  useEffect(() => {
    if (
      userId !== undefined &&
      userId !== null
    ) {
      setResolvedUserId(
        userId.toString()
      );

      return;
    }

    let cancelled = false;

    const loadMe = async () => {
      try {
        const res =
          await axios.get(
            '/api/auth/me',
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        if (cancelled) {
          return;
        }

        const me =
          res.data;

        const id =
          me?._id ||
          me?.id;

        if (id) {
          setResolvedUserId(
            id.toString()
          );
        }
      } catch (e) {
        console.error(
          'Impossible de récupérer l’utilisateur connecté:',
          e
        );
      }
    };

    loadMe();

    return () => {
      cancelled = true;
    };
  }, [token, userId]);


  const myId =
    resolvedUserId?.toString();


  const load = async () => {
    try {
      setLoading(true);
      setError('');

      if (!myId) {
        throw new Error(
          'Utilisateur connecté introuvable.'
        );
      }

      const groupRes =
        await axios.get(
          `/api/groups/${initialGroup._id}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const g =
        groupRes.data;

      setGroup(g);

      /*
       * On essaie d'abord de récupérer
       * la clé déjà présente en local.
       */
      let groupKey =
        await getStoredGroupKey(
          g._id,
          g.keyVersion
        );

      /*
       * Si elle n'existe pas, on utilise
       * le paquet destiné à l'utilisateur.
       */
      if (!groupKey) {
        const packageForMe =
          g.keyPackage;

        if (!packageForMe) {
          throw new Error(
            'Paquet de clé du groupe indisponible.'
          );
        }

        const sender =
          g.members.find(
            member =>
              member._id?.toString() ===
              packageForMe.senderId?.toString()
          );

        if (
          !sender?.publicKey
        ) {
          throw new Error(
            'Clé publique du distributeur indisponible.'
          );
        }

        const privateKey =
          getStoredPrivateKeyJwk(
            myId
          );

        if (!privateKey) {
          throw new Error(
            'Clé privée locale introuvable.'
          );
        }

        const senderPublicKey =
          typeof sender.publicKey ===
          'string'
            ? JSON.parse(
                sender.publicKey
              )
            : sender.publicKey;

        groupKey =
          await decryptGroupKeyPackage(
            packageForMe.encryptedKey,
            privateKey,
            senderPublicKey
          );

        if (!groupKey) {
          throw new Error(
            'Impossible de déchiffrer la clé du groupe.'
          );
        }

        await storeGroupKey(
          g._id,
          g.keyVersion,
          groupKey
        );
      }

      setKey(groupKey);

      const messagesRes =
        await axios.get(
          `/api/groups/${g._id}/messages`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const raw =
        messagesRes.data;

      const decrypted =
        await Promise.all(
          raw.map(
            async message => {
              if (
                message.deleted
              ) {
                return message;
              }

              const text =
                await decryptMessage(
                  groupKey,
                  message.content
                );

              if (
                text === null
              ) {
                return {
                  ...message,
                  content: null,
                  decryptionError:
                    true
                };
              }

              return {
                ...message,
                content: text,
                decryptionError:
                  false
              };
            }
          )
        );

      setMessages(decrypted);

      await axios.patch(
        `/api/groups/${g._id}/read`,
        {},
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      ).catch(() => {});
    } catch (e) {
      console.error(
        'Erreur chargement groupe:',
        e
      );

      setError(
        e.response?.data?.error ||
        e.message ||
        'Impossible de charger le groupe.'
      );
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (
      !initialGroup?._id ||
      !token ||
      !myId
    ) {
      return;
    }

    load();
  }, [
    initialGroup?._id,
    token,
    myId
  ]);


  useEffect(() => {
    const onMsg =
      async message => {
        if (
          message.group
            ?.toString() !==
          initialGroup._id.toString()
        ) {
          return;
        }

        if (!key) {
          return;
        }

        const text =
          await decryptMessage(
            key,
            message.content
          );

        const decryptedMessage =
          text === null
            ? {
                ...message,
                content: null,
                decryptionError:
                  true
              }
            : {
                ...message,
                content: text,
                decryptionError:
                  false
              };

        setMessages(
          previous =>
            previous.some(
              item =>
                item._id?.toString() ===
                message._id?.toString()
            )
              ? previous
              : [
                  ...previous,
                  decryptedMessage
                ]
        );

        if (
          message.sender?.toString() !==
          myId
        ) {
          axios.patch(
            `/api/groups/${initialGroup._id}/read`,
            {},
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          ).catch(() => {});
        }
      };


    const refresh =
      ({ groupId }) => {
        if (
          groupId?.toString() ===
          initialGroup._id.toString()
        ) {
          load();
        }
      };


    const deleted =
      ({ groupId }) => {
        if (
          groupId?.toString() !==
          initialGroup._id.toString()
        ) {
          return;
        }

        setGroup(null);
        setMessages([]);
        setKey(null);

        onDeleted?.();

        if (!onDeleted) {
          onBack?.();
        }
      };


    const messageDeleted =
      ({
        groupId,
        messageId
      }) => {
        if (
          groupId?.toString() !==
          initialGroup._id.toString()
        ) {
          return;
        }

        setMessages(
          previous =>
            previous.filter(
              message =>
                message._id?.toString() !==
                messageId?.toString()
            )
        );
      };


    socket.on(
      'newGroupMessage',
      onMsg
    );

    socket.on(
      'groupMessageSent',
      onMsg
    );

    socket.on(
      'groupUpdated',
      refresh
    );

    socket.on(
      'groupDeleted',
      deleted
    );

    socket.on(
      'groupMessageDeleted',
      messageDeleted
    );

    return () => {
      socket.off(
        'newGroupMessage',
        onMsg
      );

      socket.off(
        'groupMessageSent',
        onMsg
      );

      socket.off(
        'groupUpdated',
        refresh
      );

      socket.off(
        'groupDeleted',
        deleted
      );

      socket.off(
        'groupMessageDeleted',
        messageDeleted
      );
    };
  }, [
    initialGroup?._id,
    key,
    myId,
    token,
    onDeleted,
    onBack
  ]);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [messages]);


  const send = async () => {
    const text =
      input.trim();

    if (
      !text ||
      !key ||
      !group
    ) {
      return;
    }

    try {
      const encrypted =
        await encryptMessage(
          key,
          text
        );

      socket.emit(
        'sendGroupMessage',
        {
          groupId:
            group._id,
          content:
            encrypted
        }
      );

      setInput('');
    } catch (e) {
      console.error(e);

      setError(
        'Impossible de chiffrer le message.'
      );
    }
  };


  const leave = async () => {
    if (!group) {
      return;
    }

    /*
     * Propriétaire :
     * suppression définitive du groupe.
     */
    if (
      group.owner?.toString() ===
      myId
    ) {
      if (
        !window.confirm(
          'Supprimer définitivement ce groupe ?'
        )
      ) {
        return;
      }

      try {
        await axios.delete(
          `/api/groups/${group._id}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

        onDeleted?.();

        if (!onDeleted) {
          onBack?.();
        }
      } catch (e) {
        setError(
          e.response?.data?.error ||
          e.message ||
          'Impossible de supprimer le groupe.'
        );
      }

      return;
    }


    /*
     * Membre normal :
     * création d'une nouvelle clé
     * pour les membres restants.
     */
    try {
      const privateKey =
        getStoredPrivateKeyJwk(
          myId
        );

      if (!privateKey) {
        throw new Error(
          'Clé privée locale introuvable.'
        );
      }

      const nextGroupKey =
        await generateGroupKey();

      const remaining =
        group.members.filter(
          member =>
            member._id?.toString() !==
            myId
        );

      const packages = [];

      for (
        const member of remaining
      ) {
        if (
          !member.publicKey
        ) {
          throw new Error(
            'Clé publique d’un membre indisponible.'
          );
        }

        const publicKey =
          typeof member.publicKey ===
          'string'
            ? JSON.parse(
                member.publicKey
              )
            : member.publicKey;

        packages.push({
          userId:
            member._id.toString(),

          senderId:
            myId,

          version:
            group.keyVersion + 1,

          encryptedKey:
            await encryptGroupKeyForMember(
              nextGroupKey,
              privateKey,
              publicKey
            )
        });
      }

      await axios.post(
        `/api/groups/${group._id}/leave`,
        {
          keyPackages:
            packages
        },
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      );

      localStorage.removeItem(
        `propard_groupkey_${group._id}_v${group.keyVersion}`
      );

      onDeleted?.();

      if (!onDeleted) {
        onBack?.();
      }
    } catch (e) {
      console.error(
        'Erreur sortie groupe:',
        e
      );

      setError(
        e.response?.data?.error ||
        e.message ||
        'Impossible de quitter le groupe.'
      );
    }
  };


  if (!group) {
    return null;
  }


  return (
    <div style={s.container}>

      <div style={s.header}>

        <div style={s.avatar}>
          {(group.name || '?')
            .charAt(0)
            .toUpperCase()}
        </div>

        <div>
          <p style={s.name}>
            {group.name}
          </p>

          <p style={s.sub}>
            {group.memberCount ||
              group.members?.length ||
              0}{' '}
            membre(s)
          </p>
        </div>

        <button
          onClick={leave}
          style={s.leave}
        >
          {group.owner?.toString() ===
          myId
            ? '🗑️'
            : '🚪'}
        </button>

      </div>


      <div style={s.messages}>

        {loading && (
          <p style={s.info}>
            Chargement...
          </p>
        )}

        {!loading && error && (
          <p
            style={{
              ...s.info,
              color:
                'var(--danger)'
            }}
          >
            {error}
          </p>
        )}

        {!loading &&
          !error &&
          messages.map(
            message => {
              const sender =
                message.senderInfo ||
                message.sender ||
                {};

              const senderId =
                sender?._id
                  ?.toString() ||
                (
                  typeof sender ===
                  'string'
                    ? sender
                    : null
                ) ||
                message.sender
                  ?.toString();

              const isMe =
                senderId === myId;

              return (
                <div
                  key={
                    message._id
                  }
                  style={{
                    ...s.row,
                    justifyContent:
                      isMe
                        ? 'flex-end'
                        : 'flex-start'
                  }}
                >
                  <div
                    style={{
                      ...s.bubble,
                      background:
                        isMe
                          ? 'var(--accent)'
                          : 'var(--bg-tertiary)',
                      color:
                        isMe
                          ? '#fff'
                          : 'var(--text-primary)'
                    }}
                  >

                    {!isMe && (
                      <div
                        style={
                          s.sender
                        }
                      >
                        {sender.displayName ||
                          sender.username ||
                          'Membre'}
                      </div>
                    )}

                    {message.decryptionError
                      ? '🔒 Message impossible à déchiffrer'
                      : message.content}

                  </div>
                </div>
              );
            }
          )}

        <div
          ref={bottomRef}
        />

      </div>


      <div style={s.inputRow}>

        <input
          value={input}
          onChange={e =>
            setInput(
              e.target.value
            )
          }
          onKeyDown={e => {
            if (
              e.key === 'Enter'
            ) {
              send();
            }
          }}
          placeholder="Écrire un message..."
          style={s.input}
          disabled={!key}
        />

        <button
          onClick={send}
          style={s.send}
          disabled={
            !key ||
            !input.trim()
          }
        >
          ➤
        </button>

      </div>

    </div>
  );
}


const s = {
  container: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    background:
      'var(--bg-primary)'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding:
      '12px 16px',
    background:
      'var(--bg-secondary)',
    borderBottom:
      '1px solid var(--border)'
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    background:
      'var(--accent-glow)',
    color:
      'var(--accent)',
    border:
      '1px solid var(--accent)',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    flexShrink: 0
  },

  name: {
    margin: 0,
    color:
      'var(--text-primary)',
    fontWeight: 700
  },

  sub: {
    margin: 0,
    color:
      'var(--text-muted)',
    fontSize: 11
  },

  leave: {
    marginLeft: 'auto',
    background:
      'transparent',
    border:
      '1px solid var(--border)',
    color:
      'var(--text-primary)',
    borderRadius: 8,
    padding:
      '7px 10px',
    cursor: 'pointer'
  },

  messages: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 16
  },

  info: {
    textAlign: 'center',
    color:
      'var(--text-secondary)'
  },

  row: {
    display: 'flex',
    marginBottom: 8
  },

  bubble: {
    maxWidth: '75%',
    padding:
      '9px 12px',
    borderRadius: 12,
    whiteSpace:
      'pre-wrap',
    overflowWrap:
      'anywhere'
  },

  sender: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 3,
    opacity: 0.8
  },

  inputRow: {
    display: 'flex',
    gap: 8,
    padding: 12,
    borderTop:
      '1px solid var(--border)',
    background:
      'var(--bg-secondary)'
  },

  input: {
    flex: 1,
    minWidth: 0,
    background:
      'var(--bg-tertiary)',
    color:
      'var(--text-primary)',
    border:
      '1px solid var(--border)',
    borderRadius: 9,
    padding:
      '10px 12px',
    outline: 'none'
  },

  send: {
    width: 42,
    border: 0,
    borderRadius: 9,
    background:
      'var(--accent)',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer'
  }
};