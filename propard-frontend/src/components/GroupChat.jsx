import React, {
  useEffect,
  useState,
  useRef,
  useMemo
} from 'react';

import axios from 'axios';
import socket from '../socket';

import GroupProfile from './GroupProfile';

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
  onDeleted,
  onGrabStart,
  grabbedMessageId
}) {
  const [group, setGroup] =
    useState(initialGroup);

  const [messages, setMessages] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState(null);

  const [input, setInput] =
    useState('');

  const [spamWarning, setSpamWarning] =
    useState(false);

  const [key, setKey] =
    useState(null);

  const [showProfile, setShowProfile] =
    useState(false);

  const [friends, setFriends] =
    useState([]);

  const [mentionQuery, setMentionQuery] =
    useState(null);

  const [mentionStart, setMentionStart] =
    useState(-1);

  const [editingId, setEditingId] =
    useState(null);

  const [editContent, setEditContent] =
    useState('');

  const [contextMenu, setContextMenu] =
    useState(null);

  const [reportTarget, setReportTarget] =
    useState(null);

  const [reportReason, setReportReason] =
    useState('');

  const [reportLoading, setReportLoading] =
    useState(false);

  const [reportError, setReportError] =
    useState('');

  const [reportSuccess, setReportSuccess] =
    useState(false);

  /*
   * L'ID utilisateur peut être fourni par
   * AppPage, mais si ce n'est pas le cas,
   * on le récupère automatiquement via
   * /api/auth/me.
   */
  const [currentUserId, setCurrentUserId] =
    useState(
      userId?.toString() || null
    );

  const bottomRef =
    useRef(null);

  const lastMessageTime =
    useRef(0);

  const messageCount =
    useRef(0);

  const messageCountTimer =
    useRef(null);

  const longPressTimer =
    useRef(null);

  const lastTapRef =
    useRef({
      id: null,
      time: 0
    });

  const grabHoldTimerRef =
    useRef(null);

  const grabCandidateRef =
    useRef(null);

  const DOUBLE_TAP_WINDOW_MS = 300;
  const HOLD_TO_GRAB_MS = 180;
  const MOVE_CANCEL_PX = 12;

  const SPAM_DELAY = 1000;
  const SPAM_LIMIT = 15;

  const normalize = id =>
    id?.toString();

  const myId =
    normalize(currentUserId);

  /*
   * Si AppPage fournit userId, on l'utilise.
   * Sinon on récupère l'utilisateur courant
   * depuis l'API.
   */
  useEffect(() => {
    let cancelled = false;

    if (userId) {
      setCurrentUserId(
        userId.toString()
      );

      return () => {
        cancelled = true;
      };
    }

    if (!token) {
      setCurrentUserId(null);
      return () => {
        cancelled = true;
      };
    }

    const loadCurrentUser = async () => {
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

        const id =
          res.data?._id ||
          res.data?.id ||
          res.data?.userId;

        if (!id) {
          throw new Error(
            'ID utilisateur introuvable.'
          );
        }

        setCurrentUserId(
          id.toString()
        );
      } catch (err) {
        console.error(
          'Impossible de récupérer l’utilisateur courant:',
          err
        );

        if (!cancelled) {
          setCurrentUserId(null);
          setLoadError(
            err.response?.data?.error ||
            'Impossible de récupérer votre compte.'
          );
          setLoading(false);
        }
      }
    };

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    token
  ]);

  /*
   * Récupération des surnoms d'amis.
   *
   * Les surnoms sont stockés dans User.friends,
   * pas dans Group.members.
   */
  useEffect(() => {
    let cancelled = false;

    const loadFriends = async () => {
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

        if (!cancelled) {
          setFriends(
            Array.isArray(res.data?.friends)
              ? res.data.friends
              : []
          );
        }
      } catch (err) {
        console.error(
          'Impossible de charger les surnoms:',
          err
        );
      }
    };

    if (token) {
      loadFriends();
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  /*
   * Nettoyage des timers.
   */
  useEffect(() => {
    return () => {
      clearTimeout(
        messageCountTimer.current
      );

      clearTimeout(
        grabHoldTimerRef.current
      );

      clearTimeout(
        longPressTimer.current
      );
    };
  }, []);

  /*
   * Recharge le groupe.
   */
  const loadGroup = async () => {
    if (!initialGroup?._id) {
      return;
    }

    try {
      setLoading(true);
      setLoadError(null);

      const res =
        await axios.get(
          `/api/groups/${initialGroup._id}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      setGroup(res.data);

      return res.data;
    } catch (err) {
      console.error(
        'Erreur chargement groupe:',
        err
      );

      setLoadError(
        err.response?.data?.error ||
        'Impossible de charger le groupe.'
      );

      return null;
    } finally {
      setLoading(false);
    }
  };

  /*
   * Charge le groupe et récupère sa clé.
   */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      /*
       * IMPORTANT :
       * on attend maintenant que currentUserId
       * soit récupéré avant de charger la clé.
       */
      if (
        !initialGroup?._id ||
        !token ||
        !myId
      ) {
        return;
      }

      try {
        setLoading(true);
        setLoadError(null);

        const res =
          await axios.get(
            `/api/groups/${initialGroup._id}`,
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

        const loadedGroup =
          res.data;

        setGroup(
          loadedGroup
        );

        let groupKey =
          await getStoredGroupKey(
            loadedGroup._id,
            loadedGroup.keyVersion
          );

        /*
         * Si la clé n'est pas encore
         * présente localement, on utilise
         * le keyPackage personnel.
         */
        if (!groupKey) {
          const packageData =
            loadedGroup.keyPackage;

          if (!packageData) {
            throw new Error(
              'Paquet de clé du groupe indisponible.'
            );
          }

          const senderId =
            packageData.senderId
              ? packageData.senderId.toString()
              : null;

          const sender =
            loadedGroup.members?.find(
              member =>
                member._id?.toString() ===
                senderId
            );

          if (!sender?.publicKey) {
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
              packageData.encryptedKey,
              privateKey,
              senderPublicKey
            );

          if (!groupKey) {
            throw new Error(
              'Impossible de déchiffrer la clé du groupe.'
            );
          }

          await storeGroupKey(
            loadedGroup._id,
            loadedGroup.keyVersion,
            groupKey
          );
        }

        if (cancelled) {
          return;
        }

        setKey(groupKey);

        const messagesRes =
          await axios.get(
            `/api/groups/${loadedGroup._id}/messages`,
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

        const rawMessages =
          Array.isArray(
            messagesRes.data
          )
            ? messagesRes.data
            : [];

        const decrypted =
          await Promise.all(
            rawMessages.map(
              async message => {
                if (
                  message.deleted ||
                  !message.content
                ) {
                  return message;
                }

                const plaintext =
                  await decryptMessage(
                    groupKey,
                    message.content
                  );

                if (
                  plaintext === null
                ) {
                  return {
                    ...message,
                    content: null,
                    decryptionError: true
                  };
                }

                return {
                  ...message,
                  content: plaintext,
                  decryptionError: false
                };
              }
            )
          );

        if (!cancelled) {
          setMessages(
            decrypted
          );
        }

        await axios.patch(
          `/api/groups/${loadedGroup._id}/read`,
          {},
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        ).catch(() => {});

      } catch (err) {
        console.error(
          'Erreur chargement GroupChat:',
          err
        );

        if (!cancelled) {
          setLoadError(
            err.response?.data?.error ||
            err.message ||
            'Impossible de charger le groupe.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [
    initialGroup?._id,
    token,
    myId
  ]);

  /*
   * Messages en temps réel.
   */
  useEffect(() => {
    if (!initialGroup?._id) {
      return;
    }

    const groupId =
      initialGroup._id.toString();

    const handleNewGroupMessage =
      async message => {
        if (
          message.group?.toString() !==
          groupId
        ) {
          return;
        }

        let decryptedMessage = {
          ...message,
          content: null,
          decryptionError: true
        };

        if (
          key &&
          message.content
        ) {
          const plaintext =
            await decryptMessage(
              key,
              message.content
            );

          if (plaintext !== null) {
            decryptedMessage = {
              ...message,
              content: plaintext,
              decryptionError: false
            };
          }
        }

        setMessages(prev =>
          message._id &&
          prev.some(
            current =>
              current._id?.toString() ===
              message._id?.toString()
          )
            ? prev
            : [
                ...prev,
                decryptedMessage
              ]
        );

        const senderId =
          (
            message.sender?._id ||
            message.sender
          )?.toString();

        if (
          senderId &&
          senderId !== myId
        ) {
          await axios.patch(
            `/api/groups/${groupId}/read`,
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

    const handleGroupUpdated =
      async data => {
        if (
          data?.groupId?.toString() !==
          groupId
        ) {
          return;
        }

        await loadGroup();
      };

    const handleGroupDeleted =
      data => {
        if (
          data?.groupId?.toString() !==
          groupId
        ) {
          return;
        }

        onDeleted?.();
      };

    const handleGroupMessageDeleted =
      data => {
        if (
          data?.groupId?.toString() !==
          groupId
        ) {
          return;
        }

        setMessages(prev =>
          prev.filter(
            message =>
              message._id?.toString() !==
              data.messageId?.toString()
          )
        );
      };

    socket.on(
      'newGroupMessage',
      handleNewGroupMessage
    );

    socket.on(
      'groupMessageSent',
      handleNewGroupMessage
    );

    socket.on(
      'groupUpdated',
      handleGroupUpdated
    );

    socket.on(
      'groupDeleted',
      handleGroupDeleted
    );

    socket.on(
      'groupMessageDeleted',
      handleGroupMessageDeleted
    );

    socket.on(
      'groupMessageEdited',
      handleGroupMessageEdited
    );

    return () => {
      socket.off(
        'newGroupMessage',
        handleNewGroupMessage
      );

      socket.off(
        'groupMessageSent',
        handleNewGroupMessage
      );

      socket.off(
        'groupUpdated',
        handleGroupUpdated
      );

      socket.off(
        'groupDeleted',
        handleGroupDeleted
      );

      socket.off(
        'groupMessageDeleted',
        handleGroupMessageDeleted
      );

      socket.off(
        'groupMessageEdited',
        handleGroupMessageEdited
      );
    };
  }, [
    initialGroup?._id,
    key,
    myId,
    token
  ]);

  /*
   * Scroll automatique.
   */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [messages]);

  /*
   * Fermer les menus / suggestions.
   */
  useEffect(() => {
    const close = () => {
      setContextMenu(null);
    };

    window.addEventListener(
      'click',
      close
    );

    return () => {
      window.removeEventListener(
        'click',
        close
      );
    };
  }, []);

  /*
   * Retourne le nom affiché d'un membre.
   */
  const getMemberNickname = member => {
    const memberId =
      member?._id?.toString();

    const friend =
      friends.find(
        item =>
          item.userId?._id?.toString() ===
            memberId ||
          item.userId?.toString() ===
            memberId
      );

    return (
      friend?.nickname?.trim() ||
      member?.displayName?.trim() ||
      member?.username ||
      'Membre'
    );
  };

  /*
   * Liste des membres utilisable
   * pour les mentions.
   */
  const mentionMembers =
    useMemo(() => {
      if (!group?.members) {
        return [];
      }

      return group.members
        .map(member => ({
          ...member,
          mentionName:
            getMemberNickname(member)
        }))
        .filter(
          member =>
            member._id &&
            member._id.toString() !==
              myId
        );
    }, [
      group?.members,
      friends,
      myId
    ]);

  /*
   * Suggestions @mention.
   */
  const mentionSuggestions =
    useMemo(() => {
      if (
        mentionQuery === null
      ) {
        return [];
      }

      const query =
        mentionQuery
          .trim()
          .toLowerCase();

      if (!query) {
        return mentionMembers
          .slice(0, 8);
      }

      return mentionMembers
        .filter(member => {
          const nickname =
            (
              member.mentionName ||
              ''
            ).toLowerCase();

          const username =
            (
              member.username ||
              ''
            ).toLowerCase();

          const displayName =
            (
              member.displayName ||
              ''
            ).toLowerCase();

          return (
            nickname.includes(query) ||
            username.includes(query) ||
            displayName.includes(query)
          );
        })
        .slice(0, 8);
    }, [
      mentionQuery,
      mentionMembers
    ]);

  /*
   * Analyse du texte pour savoir si
   * le curseur est actuellement après @xxx.
   */
  const updateMentionState =
    (value, cursorPosition) => {
      const beforeCursor =
        value.slice(
          0,
          cursorPosition
        );

      const atIndex =
        beforeCursor.lastIndexOf('@');

      if (atIndex === -1) {
        setMentionQuery(null);
        setMentionStart(-1);
        return;
      }

      const previous =
        beforeCursor[
          atIndex - 1
        ];

      if (
        previous &&
        !/\s/.test(previous)
      ) {
        setMentionQuery(null);
        setMentionStart(-1);
        return;
      }

      const query =
        beforeCursor.slice(
          atIndex + 1
        );

      if (
        /\s/.test(query)
      ) {
        setMentionQuery(null);
        setMentionStart(-1);
        return;
      }

      if (query.length > 40) {
        setMentionQuery(null);
        setMentionStart(-1);
        return;
      }

      setMentionStart(
        atIndex
      );

      setMentionQuery(
        query
      );
    };

  /*
   * Sélection d'une personne dans
   * la liste des mentions.
   */
  const selectMention =
    member => {
      const name =
        member.mentionName ||
        member.displayName ||
        member.username ||
        'Membre';

      const start =
        mentionStart;

      if (start < 0) {
        return;
      }

      const inputBefore =
        input.slice(
          0,
          start
        );

      const cursorEnd =
        start +
        1 +
        (
          mentionQuery?.length ||
          0
        );

      const inputAfter =
        input.slice(
          cursorEnd
        );

      const newValue =
        `${inputBefore}@${name} ${inputAfter}`;

      setInput(
        newValue
      );

      setMentionQuery(
        null
      );

      setMentionStart(
        -1
      );

      requestAnimationFrame(() => {
        const inputElement =
          document.querySelector(
            '[data-group-message-input="true"]'
          );

        if (!inputElement) {
          return;
        }

        const cursor =
          inputBefore.length +
          name.length +
          2;

        inputElement.focus();

        inputElement.setSelectionRange(
          cursor,
          cursor
        );
      });
    };


  /*
   * Menu contextuel / édition /
   * suppression / signalement.
   */
  const getContextMenuPosition =
    (x, y) => ({
      x: Math.min(
        Math.max(8, x),
        Math.max(8, window.innerWidth - 178)
      ),
      y: Math.min(
        Math.max(8, y),
        Math.max(8, window.innerHeight - 125)
      )
    });

  const openContextMenu =
    (message, x, y) => {
      if (
        !message ||
        message.deleted ||
        message.decryptionError
      ) {
        return;
      }

      const position =
        getContextMenuPosition(
          x,
          y
        );

      setContextMenu({
        message,
        x:
          position.x,
        y:
          position.y
      });
    };

  const handleBubbleContextMenu =
    (e, message) => {
      e.preventDefault();

      openContextMenu(
        message,
        e.clientX,
        e.clientY
      );
    };

  /*
   * Appui long : ouvre le même menu
   * que le clic droit sur desktop.
   *
   * Le grab reste indépendant :
   * double-tap + maintien continue
   * d'appeler onGrabStart.
   */
  const handleBubbleLongPressStart =
    (e, message) => {
      if (
        e.pointerType === 'mouse' ||
        message.deleted ||
        message.decryptionError
      ) {
        return;
      }

      clearTimeout(
        longPressTimer.current
      );

      const clientX =
        e.clientX ??
        (e.touches?.[0]?.clientX || 0);

      const clientY =
        e.clientY ??
        (e.touches?.[0]?.clientY || 0);

      longPressTimer.current =
        setTimeout(() => {
          openContextMenu(
            message,
            clientX,
            clientY
          );
        }, 500);
    };

  const cancelBubbleLongPress =
    () => {
      clearTimeout(
        longPressTimer.current
      );

      longPressTimer.current =
        null;
    };

  const isOwnGroupMessage =
    message => {
      const senderId =
        (
          message?.sender?._id ||
          message?.sender
        )?.toString();

      return (
        senderId &&
        senderId === myId
      );
    };

  const startEditGroupMessage =
    message => {
      if (
        !isOwnGroupMessage(message) ||
        message.deleted ||
        message.decryptionError ||
        typeof message.content !==
          'string'
      ) {
        return;
      }

      setEditingId(
        message._id
      );

      setEditContent(
        message.content
      );

      setContextMenu(
        null
      );
    };

  const cancelEditGroupMessage =
    () => {
      setEditingId(
        null
      );

      setEditContent('');
    };

  const saveEditGroupMessage =
    async messageId => {
      const plaintext =
        editContent.trim();

      if (
        !plaintext ||
        !key
      ) {
        return;
      }

      try {
        const encryptedContent =
          await encryptMessage(
            key,
            plaintext
          );

        await axios.patch(
          `/api/groups/${group._id}/messages/${messageId}`,
          {
            content:
              encryptedContent
          },
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

        /*
         * Le socket groupMessageEdited
         * mettra aussi à jour les autres
         * clients. On met le nôtre à jour
         * immédiatement.
         */
        setMessages(prev =>
          prev.map(message =>
            message._id?.toString() ===
            messageId?.toString()
              ? {
                  ...message,
                  content:
                    plaintext,
                  edited:
                    true
                }
              : message
          )
        );

        cancelEditGroupMessage();
      } catch (err) {
        console.error(
          'Group message edit error:',
          err
        );

        setLoadError(
          err.response?.data?.error ||
          'Impossible de modifier le message.'
        );

        setTimeout(() => {
          setLoadError(null);
        }, 4000);
      }
    };

  const deleteGroupMessage =
    async messageId => {
      setContextMenu(
        null
      );

      try {
        await axios.delete(
          `/api/groups/${group._id}/messages/${messageId}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

        setMessages(prev =>
          prev.filter(
            message =>
              message._id?.toString() !==
              messageId?.toString()
          )
        );
      } catch (err) {
        console.error(
          'Group message delete error:',
          err
        );

        setLoadError(
          err.response?.data?.error ||
          'Impossible de supprimer le message.'
        );

        setTimeout(() => {
          setLoadError(null);
        }, 4000);
      }
    };

  const openReport =
    message => {
      if (
        isOwnGroupMessage(message)
      ) {
        return;
      }

      setContextMenu(
        null
      );

      setReportTarget(
        message
      );

      setReportReason('');
      setReportError('');
      setReportSuccess(
        false
      );
    };

  const closeReport =
    () => {
      if (reportLoading) {
        return;
      }

      setReportTarget(
        null
      );

      setReportReason('');
      setReportError('');
      setReportSuccess(
        false
      );
    };

  const submitReport =
    async () => {
      if (
        !reportTarget ||
        reportLoading
      ) {
        return;
      }

      const reportedUserId =
        (
          reportTarget.sender?._id ||
          reportTarget.sender
        )?.toString();

      if (
        !reportedUserId ||
        reportedUserId === myId
      ) {
        return;
      }

      setReportLoading(
        true
      );

      setReportError('');

      try {
        await axios.post(
          '/api/reports',
          {
            messageId:
              reportTarget._id,
            reportedUserId,
            content:
              reportTarget.content,
            reason:
              reportReason.trim() ||
              undefined,
            groupMessage:
              true,
            groupId:
              group._id
          },
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

        setReportSuccess(
          true
        );
      } catch (err) {
        console.error(
          'Group message report error:',
          err
        );

        setReportError(
          err.response?.data?.error ||
          'Impossible d’envoyer le signalement.'
        );
      } finally {
        setReportLoading(
          false
        );
      }
    };

  /*
   * Message de groupe modifié
   * en temps réel.
   */
  const handleGroupMessageEdited =
    async data => {
      if (
        data?.groupId?.toString() !==
        initialGroup?._id?.toString()
      ) {
        return;
      }

      if (
        !key ||
        !data.content
      ) {
        return;
      }

      const plaintext =
        await decryptMessage(
          key,
          data.content
        );

      if (
        plaintext === null
      ) {
        return;
      }

      setMessages(prev =>
        prev.map(message =>
          message._id?.toString() ===
          data.messageId?.toString()
            ? {
                ...message,
                content:
                  plaintext,
                edited:
                  true,
                decryptionError:
                  false
              }
            : message
        )
      );
    };

  /*
   * Envoi du message.
   */
  const sendMessage =
    async () => {
      const plaintext =
        input.trim();

      if (!plaintext) {
        return;
      }

      if (!key) {
        setLoadError(
          'Chiffrement indisponible : la clé du groupe n’est pas disponible.'
        );

        setTimeout(() => {
          setLoadError(null);
        }, 4000);

        return;
      }

      const now =
        Date.now();

      if (
        now -
          lastMessageTime.current <
        SPAM_DELAY
      ) {
        return;
      }

      lastMessageTime.current =
        now;

      messageCount.current +=
        1;

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
            key,
            plaintext
          );

        socket.emit(
          'sendGroupMessage',
          {
            groupId:
              group._id,
            content:
              encryptedContent
          }
        );

        setInput('');
        setMentionQuery(null);
        setMentionStart(-1);
      } catch (err) {
        console.error(err);

        setLoadError(
          'Impossible de chiffrer le message.'
        );
      }
    };

  /*
   * Format des dates.
   */
  const formatDateSeparator =
    date => {
      const d =
        new Date(date);

      const today =
        new Date();

      const yesterday =
        new Date();

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

  const shouldShowDateSeparator =
    (
      messageList,
      index
    ) => {
      if (index === 0) {
        return true;
      }

      const curr =
        new Date(
          messageList[index]
            .createdAt
        );

      const prev =
        new Date(
          messageList[index - 1]
            .createdAt
        );

      return (
        curr.toDateString() !==
        prev.toDateString()
      );
    };

  /*
   * Double-tap / grab.
   */
  const clearGrabHold =
    () => {
      clearTimeout(
        grabHoldTimerRef.current
      );

      grabHoldTimerRef.current =
        null;

      grabCandidateRef.current =
        null;
    };

  const handleBubblePointerDown =
    (e, message) => {
      if (
        message.deleted ||
        message.decryptionError
      ) {
        return;
      }

      e.preventDefault();

      const now =
        Date.now();

      const wasDoubleTap =
        lastTapRef.current.id ===
          message._id &&
        now -
          lastTapRef.current.time <
          DOUBLE_TAP_WINDOW_MS;

      if (wasDoubleTap) {
        lastTapRef.current = {
          id: null,
          time: 0
        };

        const rect =
          e.currentTarget
            .getBoundingClientRect();

        grabCandidateRef.current = {
          msg: message,
          startX: e.clientX,
          startY: e.clientY,
          rect,
          pointerId:
            e.pointerId
        };

        grabHoldTimerRef.current =
          setTimeout(() => {
            const candidate =
              grabCandidateRef.current;

            if (candidate) {
              if (onGrabStart) {
                onGrabStart({
                  msg:
                    candidate.msg,
                  clientX:
                    candidate.startX,
                  clientY:
                    candidate.startY,
                  rect:
                    candidate.rect,
                  pointerId:
                    candidate.pointerId
                });
              }
            }

            grabCandidateRef.current =
              null;
          }, HOLD_TO_GRAB_MS);
      } else {
        lastTapRef.current = {
          id: message._id,
          time: now
        };
      }
    };

  const handleBubblePointerMoveGrabCheck =
    e => {
      const candidate =
        grabCandidateRef.current;

      if (!candidate) {
        return;
      }

      const dx =
        e.clientX -
        candidate.startX;

      const dy =
        e.clientY -
        candidate.startY;

      if (
        Math.sqrt(
          dx * dx +
          dy * dy
        ) > MOVE_CANCEL_PX
      ) {
        clearGrabHold();
      }
    };

  const handleBubblePointerUpCancel =
    () => {
      clearGrabHold();
    };

  /*
   * Quitter le groupe / supprimer si propriétaire.
   */
  const leaveGroup =
    async () => {
      if (!group) {
        return;
      }

      const isOwner =
        group.owner?.toString() ===
        myId;

      if (isOwner) {
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
        } catch (err) {
          console.error(err);

          setLoadError(
            err.response?.data?.error ||
            'Impossible de supprimer le groupe.'
          );
        }

        return;
      }

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

        const nextVersion =
          group.keyVersion + 1;

        const keyPackages = [];

        for (
          const member of remaining
        ) {
          if (!member.publicKey) {
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

          keyPackages.push({
            userId:
              member._id.toString(),

            senderId:
              myId,

            version:
              nextVersion,

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
            keyPackages
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

      } catch (err) {
        console.error(err);

        setLoadError(
          err.response?.data?.error ||
          err.message ||
          'Impossible de quitter le groupe.'
        );
      }
    };

  if (!group) {
    return null;
  }

  /*
   * Profil du groupe.
   */
  if (showProfile) {
    return (
      <GroupProfile
        group={group}
        token={token}
        userId={myId}
        onBack={() =>
          setShowProfile(false)
        }
        onUpdated={async () => {
          await loadGroup();
        }}
      />
    );
  }

  return (
    <div style={styles.container}>

      <div
        style={{
          ...styles.header,
          cursor: 'pointer'
        }}
        onClick={() =>
          setShowProfile(true)
        }
      >

        <div
          style={
            styles.headerAvatar
          }
        >
          {group.avatar ? (
            <img
              src={group.avatar}
              alt=""
              style={
                styles.headerAvatarImage
              }
            />
          ) : (
            (
              group.name ||
              '?'
            )[0].toUpperCase()
          )}
        </div>

        <div>
          <p
            style={
              styles.headerName
            }
          >
            {group.name}
          </p>

          <p
            style={
              styles.headerIp
            }
          >
            {group.memberCount ||
              group.members?.length ||
              0}{' '}
            membre(s)
          </p>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <button
            style={
              styles.leaveBtn
            }
            onClick={e => {
              e.stopPropagation();
              leaveGroup();
            }}
          >
            {group.owner?.toString() ===
            myId
              ? '🗑️'
              : '🚪'}
          </button>
        </div>

      </div>

      <div
        style={
          styles.messages
        }
      >

        {loading && (
          <p
            style={
              styles.infoText
            }
          >
            Chargement des messages...
          </p>
        )}

        {!loading &&
          loadError && (
            <p
              style={{
                ...styles.infoText,
                color:
                  'var(--danger)'
              }}
            >
              {loadError}
            </p>
          )}

        {!loading &&
          !loadError &&
          messages
            .filter(
              message =>
                !message.deleted
            )
            .map(
              (
                message,
                index,
                messageArray
              ) => {
                const senderId =
                  (
                    message.sender?._id ||
                    message.sender
                  )?.toString();

                const isMe =
                  senderId === myId;

                const isBeingGrabbed =
                  grabbedMessageId &&
                  message._id &&
                  grabbedMessageId.toString() ===
                    message._id.toString();

                const content =
                  message.decryptionError
                    ? '🔒 Message impossible à déchiffrer'
                    : typeof message.content ===
                      'string'
                    ? message.content
                    : '';

                const showSeparator =
                  message.createdAt &&
                  shouldShowDateSeparator(
                    messageArray,
                    index
                  );

                const senderInfo =
                  message.senderInfo ||
                  (
                    typeof message.sender ===
                    'object'
                      ? message.sender
                      : null
                  );

                const senderName =
                  senderInfo?.displayName ||
                  senderInfo?.username ||
                  'Membre';

                return (
                  <React.Fragment
                    key={
                      message._id ||
                      index
                    }
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
                            message.createdAt
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
                          background:
                            isMe
                              ? 'var(--accent)'
                              : 'var(--bg-tertiary)',
                          opacity:
                            isBeingGrabbed
                              ? 0
                              : 1
                        }}
                        onContextMenu={e =>
                          handleBubbleContextMenu(
                            e,
                            message
                          )
                        }
                        onPointerDown={e => {
                          handleBubbleLongPressStart(
                            e,
                            message
                          );

                          handleBubblePointerDown(
                            e,
                            message
                          );
                        }}
                        onPointerMove={e => {
                          cancelBubbleLongPress();

                          handleBubblePointerMoveGrabCheck(
                            e
                          );
                        }}
                        onPointerUp={e => {
                          cancelBubbleLongPress();

                          handleBubblePointerUpCancel(
                            e
                          );
                        }}
                        onPointerCancel={() => {
                          cancelBubbleLongPress();

                          handleBubblePointerUpCancel();
                        }}
                      >

                        {!isMe && (
                          <p
                            style={
                              styles.senderName
                            }
                          >
                            {senderName}
                          </p>
                        )}

                        {editingId ===
                        message._id ? (
                          <div
                            style={
                              styles.editContainer
                            }
                            onPointerDown={e =>
                              e.stopPropagation()
                            }
                          >
                            <textarea
                              autoFocus
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
                                    'Enter' &&
                                  !e.shiftKey
                                ) {
                                  e.preventDefault();

                                  saveEditGroupMessage(
                                    message._id
                                  );
                                }

                                if (
                                  e.key ===
                                  'Escape'
                                ) {
                                  cancelEditGroupMessage();
                                }
                              }}
                              style={
                                styles.editInput
                              }
                              rows={2}
                            />

                            <div
                              style={
                                styles.editActions
                              }
                            >
                              <button
                                type="button"
                                style={
                                  styles.editBtn
                                }
                                onClick={() =>
                                  saveEditGroupMessage(
                                    message._id
                                  )
                                }
                              >
                                ✓
                              </button>

                              <button
                                type="button"
                                style={
                                  styles.cancelBtn
                                }
                                onClick={
                                  cancelEditGroupMessage
                                }
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p
                            style={
                              styles.text
                            }
                          >
                            {content}
                          </p>
                        )}

                        <div
                          style={{
                            display:
                              'flex',
                            justifyContent:
                              'flex-end',
                            alignItems:
                              'center',
                            gap: 4
                          }}
                        >

                          {message.edited && (
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
                            {message.createdAt
                              ? new Date(
                                  message.createdAt
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

                      </div>

                    </div>

                  </React.Fragment>
                );
              }
            )}

        <div
          ref={bottomRef}
        />

      </div>


      {contextMenu && (
        <div
          style={{
            ...styles.contextMenu,
            left:
              contextMenu.x,
            top:
              contextMenu.y
          }}
          onClick={e =>
            e.stopPropagation()
          }
          onPointerDown={e =>
            e.stopPropagation()
          }
        >
          {isOwnGroupMessage(
            contextMenu.message
          ) ? (
            <>
              <button
                type="button"
                style={
                  styles.contextItem
                }
                onClick={() =>
                  startEditGroupMessage(
                    contextMenu.message
                  )
                }
              >
                ✏️ Modifier
              </button>

              <button
                type="button"
                style={
                  styles.contextItemDanger
                }
                onClick={() =>
                  deleteGroupMessage(
                    contextMenu.message._id
                  )
                }
              >
                🗑️ Supprimer
              </button>
            </>
          ) : (
            <button
              type="button"
              style={
                styles.contextItem
              }
              onClick={() =>
                openReport(
                  contextMenu.message
                )
              }
            >
              🚩 Signaler
            </button>
          )}
        </div>
      )}

      {reportTarget && (
        <div
          style={
            styles.modalOverlay
          }
          onClick={e => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closeReport();
            }
          }}
        >
          <div
            style={
              styles.modal
            }
          >
            <h3
              style={
                styles.modalTitle
              }
            >
              Signaler ce message
            </h3>

            {!reportSuccess ? (
              <>
                <p
                  style={
                    styles.modalDesc
                  }
                >
                  Uniquement ce message sera
                  transmis à la modération de
                  Propard. Le reste de la
                  conversation reste privé.
                </p>

                <div
                  style={
                    styles.reportedContent
                  }
                >
                  {reportTarget.content}
                </div>

                <textarea
                  value={
                    reportReason
                  }
                  onChange={e =>
                    setReportReason(
                      e.target.value
                    )
                  }
                  placeholder="Motif du signalement (facultatif)"
                  maxLength={500}
                  style={
                    styles.reportTextarea
                  }
                  disabled={
                    reportLoading
                  }
                />

                {reportError && (
                  <p
                    style={
                      styles.modalError
                    }
                  >
                    {reportError}
                  </p>
                )}

                <div
                  style={
                    styles.modalActions
                  }
                >
                  <button
                    type="button"
                    style={
                      styles.modalBtnCancel
                    }
                    onClick={
                      closeReport
                    }
                    disabled={
                      reportLoading
                    }
                  >
                    Annuler
                  </button>

                  <button
                    type="button"
                    style={
                      styles.modalBtnDanger
                    }
                    onClick={
                      submitReport
                    }
                    disabled={
                      reportLoading
                    }
                  >
                    {reportLoading
                      ? 'Envoi...'
                      : 'Signaler'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p
                  style={
                    styles.reportSuccess
                  }
                >
                  ✓ Signalement envoyé.
                </p>

                <button
                  type="button"
                  style={
                    styles.modalBtnCancel
                  }
                  onClick={
                    closeReport
                  }
                >
                  Fermer
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {spamWarning && (
        <div
          style={
            styles.spamAlert
          }
        >
          ⚠️ Envoie moins vite !
        </div>
      )}

      <div
        style={
          styles.inputBar
        }
      >

        <div
          style={
            styles.inputWrapper
          }
        >

          {mentionQuery !== null &&
            mentionSuggestions.length >
              0 && (
              <div
                style={
                  styles.mentionBox
                }
                onClick={e =>
                  e.stopPropagation()
                }
              >

                {mentionSuggestions.map(
                  member => {
                    const name =
                      member.mentionName ||
                      member.displayName ||
                      member.username ||
                      'Membre';

                    return (
                      <button
                        key={
                          member._id
                        }
                        type="button"
                        style={
                          styles.mentionItem
                        }
                        onMouseDown={e =>
                          e.preventDefault()
                        }
                        onClick={() =>
                          selectMention(
                            member
                          )
                        }
                      >

                        <div
                          style={
                            styles.mentionAvatar
                          }
                        >
                          {member.avatar ? (
                            <img
                              src={
                                member.avatar
                              }
                              alt=""
                              style={
                                styles.mentionAvatarImage
                              }
                            />
                          ) : (
                            name[0]
                              ? name[0].toUpperCase()
                              : '?'
                          )}
                        </div>

                        <div
                          style={
                            styles.mentionInfo
                          }
                        >
                          <span
                            style={
                              styles.mentionName
                            }
                          >
                            {name}
                          </span>

                          {member.username &&
                            name !==
                              member.username && (
                              <span
                                style={
                                  styles.mentionUsername
                                }
                              >
                                @{member.username}
                              </span>
                            )}
                        </div>

                      </button>
                    );
                  }
                )}

              </div>
            )}

          <input
            data-group-message-input="true"
            value={input}
            onChange={e => {
              const value =
                e.target.value;

              setInput(value);

              updateMentionState(
                value,
                e.target.selectionStart ??
                  value.length
              );
            }}
            onKeyDown={e => {
              if (
                e.key === 'Escape'
              ) {
                setMentionQuery(null);
                setMentionStart(-1);
                return;
              }

              if (
                e.key === 'Enter'
              ) {
                if (
                  mentionQuery !== null &&
                  mentionSuggestions.length >
                    0
                ) {
                  e.preventDefault();

                  selectMention(
                    mentionSuggestions[0]
                  );

                  return;
                }

                sendMessage();
              }
            }}
            onClick={e => {
              updateMentionState(
                e.target.value,
                e.target.selectionStart ??
                  e.target.value.length
              );
            }}
            onKeyUp={e => {
              updateMentionState(
                e.target.value,
                e.target.selectionStart ??
                  e.target.value.length
              );
            }}
            placeholder="Écrire un message..."
            style={
              styles.input
            }
            disabled={!key}
          />

        </div>

        <button
          onClick={sendMessage}
          style={
            styles.btn
          }
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
    background:
      'var(--bg-secondary)',
    borderBottom:
      '1px solid var(--border)',
    flexShrink: 0
  },

  headerAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background:
      'var(--accent-glow)',
    border:
      '1px solid var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: '700',
    color:
      'var(--accent)',
    flexShrink: 0,
    overflow: 'hidden'
  },

  headerAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block'
  },

  headerName: {
    fontSize: '15px',
    fontWeight: '600',
    color:
      'var(--text-primary)',
    margin: 0
  },

  headerIp: {
    fontSize: '11px',
    color:
      'var(--text-muted)',
    fontFamily:
      'var(--font-mono)',
    margin: 0
  },

  leaveBtn: {
    background:
      'var(--bg-tertiary)',
    border:
      '1px solid var(--border)',
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
    background:
      'var(--border)'
  },

  dateText: {
    fontSize: '11px',
    color:
      'var(--text-muted)',
    whiteSpace: 'nowrap',
    padding: '0 4px'
  },

  infoText: {
    textAlign: 'center',
    color:
      'var(--text-muted)',
    fontSize: '13px',
    padding: '20px 0'
  },

  bubble: {
    maxWidth: '65%',
    padding: '10px 14px',
    borderRadius: '12px',
    cursor: 'default',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    touchAction: 'none'
  },

  senderName: {
    fontSize: '11px',
    fontWeight: '700',
    color:
      'var(--accent)',
    margin:
      '0 0 4px'
  },

  text: {
    color: '#fff',
    fontSize: '14px',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: 0
  },

  editedLabel: {
    fontSize: '10px',
    color:
      'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
    margin: 0
  },

  msgTime: {
    fontSize: '10px',
    color:
      'rgba(255,255,255,0.4)',
    marginTop: '4px',
    marginBottom: 0
  },


  editContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    minWidth: '190px'
  },

  editInput: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '58px',
    resize: 'vertical',
    padding: '8px',
    borderRadius: '8px',
    border:
      '1px solid var(--border)',
    background:
      'var(--bg-secondary)',
    color:
      'var(--text-primary)',
    outline: 'none',
    fontSize: '14px',
    fontFamily:
      'inherit'
  },

  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '6px'
  },

  editBtn: {
    border: 0,
    borderRadius: '7px',
    padding: '5px 9px',
    background:
      'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '700'
  },

  cancelBtn: {
    border:
      '1px solid var(--border)',
    borderRadius: '7px',
    padding: '5px 9px',
    background:
      'var(--bg-tertiary)',
    color:
      'var(--text-primary)',
    cursor: 'pointer'
  },

  contextMenu: {
    position: 'fixed',
    width: '160px',
    background:
      'var(--bg-secondary)',
    border:
      '1px solid var(--border)',
    borderRadius: '10px',
    boxShadow:
      'var(--shadow)',
    padding: '5px',
    zIndex: 1000
  },

  contextItem: {
    width: '100%',
    border: 0,
    background:
      'transparent',
    color:
      'var(--text-primary)',
    borderRadius: '7px',
    padding: '9px 10px',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '13px'
  },

  contextItemDanger: {
    width: '100%',
    border: 0,
    background:
      'transparent',
    color:
      'var(--danger)',
    borderRadius: '7px',
    padding: '9px 10px',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '13px'
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background:
      'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1100
  },

  modal: {
    width: '100%',
    maxWidth: '430px',
    boxSizing: 'border-box',
    background:
      'var(--bg-secondary)',
    border:
      '1px solid var(--border)',
    borderRadius: '14px',
    padding: '20px',
    boxShadow:
      'var(--shadow)'
  },

  modalTitle: {
    margin:
      '0 0 8px',
    color:
      'var(--text-primary)',
    fontSize: '18px'
  },

  modalDesc: {
    margin:
      '0 0 12px',
    color:
      'var(--text-muted)',
    fontSize: '13px',
    lineHeight: '1.45'
  },

  reportedContent: {
    padding: '10px',
    borderRadius: '8px',
    background:
      'var(--bg-tertiary)',
    color:
      'var(--text-primary)',
    fontSize: '13px',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: '150px',
    overflowY: 'auto',
    marginBottom: '10px'
  },

  reportTextarea: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '90px',
    resize: 'vertical',
    padding: '10px',
    borderRadius: '8px',
    border:
      '1px solid var(--border)',
    background:
      'var(--bg-tertiary)',
    color:
      'var(--text-primary)',
    outline: 'none',
    fontSize: '13px',
    fontFamily:
      'inherit'
  },

  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '12px'
  },

  modalBtnDanger: {
    border: 0,
    borderRadius: '8px',
    padding: '9px 13px',
    background:
      'var(--danger)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '600'
  },

  modalBtnCancel: {
    border:
      '1px solid var(--border)',
    borderRadius: '8px',
    padding: '9px 13px',
    background:
      'var(--bg-tertiary)',
    color:
      'var(--text-primary)',
    cursor: 'pointer'
  },

  modalError: {
    color:
      'var(--danger)',
    fontSize: '12px',
    margin:
      '8px 0 0'
  },

  reportSuccess: {
    color:
      'var(--text-primary)',
    fontSize: '14px',
    lineHeight: '1.5',
    margin:
      '0 0 16px'
  },

  spamAlert: {
    textAlign: 'center',
    padding: '8px',
    color:
      'var(--danger)',
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
    background:
      'var(--bg-secondary)',
    flexShrink: 0
  },

  inputWrapper: {
    flex: 1,
    position: 'relative',
    minWidth: 0
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px',
    borderRadius: '8px',
    border:
      '1px solid var(--border)',
    background:
      'var(--bg-tertiary)',
    color:
      'var(--text-primary)',
    fontSize: '14px',
    outline: 'none'
  },

  btn: {
    padding: '10px 14px',
    background:
      'var(--accent)',
    color: '#fff',
    borderRadius: '8px',
    fontSize: '16px',
    border: 0,
    cursor: 'pointer'
  },

  mentionBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom:
      'calc(100% + 8px)',
    background:
      'var(--bg-secondary)',
    border:
      '1px solid var(--border)',
    borderRadius: '10px',
    padding: '5px',
    boxShadow:
      'var(--shadow)',
    zIndex: 100,
    maxHeight: '240px',
    overflowY: 'auto'
  },

  mentionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    width: '100%',
    border: 0,
    background:
      'transparent',
    color:
      'var(--text-primary)',
    borderRadius: '7px',
    padding: '7px',
    textAlign: 'left',
    cursor: 'pointer'
  },

  mentionAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background:
      'var(--accent-glow)',
    color:
      'var(--accent)',
    display: 'grid',
    placeItems: 'center',
    fontWeight: '700',
    flexShrink: 0,
    overflow: 'hidden'
  },

  mentionAvatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },

  mentionInfo: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px'
  },

  mentionName: {
    fontSize: '13px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    overflow: 'visible'
  },

  mentionUsername: {
    fontSize: '11px',
    color:
      'var(--text-muted)',
    whiteSpace: 'nowrap'
  }
};