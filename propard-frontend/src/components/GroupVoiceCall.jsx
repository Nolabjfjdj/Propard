import { useEffect, useRef, useState } from 'react';
import socket from '../socket';
import { API_URL } from '../utils/api';

const POSITION_STORAGE_KEY = 'propard_group_voice_call_position';

const getIceServers = async (token) => {
  const endpoint = `${API_URL}/api/turn-credentials`;

  const stunServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  try {
    const res = await fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const contentType = res.headers.get('content-type') || '';
    const raw = await res.text();

    if (!res.ok || !contentType.includes('application/json')) {
      throw new Error(`Réponse TURN invalide (${res.status})`);
    }

    const data = JSON.parse(raw);
    const iceServers = Array.isArray(data) ? data : (data.iceServers || data);

    if (!Array.isArray(iceServers)) {
      throw new Error('Liste ICE servers invalide');
    }

    return [...stunServers, ...iceServers];
  } catch (err) {
    console.error('Repli sur STUN seul:', err);
    return stunServers;
  }
};

const normalizeId = value => value?.toString();

export default function GroupVoiceCall({
  group,
  userId,
  token,
  onClose,
  incomingCall = false,
  callId: initialCallId = null
}) {
  const myId = normalizeId(userId);
  const groupId = normalizeId(group?._id);

  const [status, setStatus] = useState(
    incomingCall ? 'incoming' : 'calling'
  );
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [windowPosition, setWindowPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const peersRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(new Map());
  const timerRef = useRef(null);
  const timerStartedRef = useRef(false);
  const callStartedAtRef = useRef(null);
  const closedRef = useRef(false);
  const callIdRef = useRef(initialCallId);
  const acceptedRef = useRef(!incomingCall);
  const joinedRef = useRef(false);
  const localReadyRef = useRef(false);
  const iceServersRef = useRef(null);
  const restartingRef = useRef(new Set());
  const cardRef = useRef(null);
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0
  });

  const groupName =
    group?.name?.trim() || 'Appel de groupe';

  const getMember = id =>
    group?.members?.find(
      member => normalizeId(member?._id || member?.userId) === normalizeId(id)
    );

  const getMemberName = id => {
    const member = getMember(id);
    return (
      member?.nickname?.trim() ||
      member?.displayName?.trim() ||
      member?.username ||
      'Membre'
    );
  };

  const getMemberAvatar = id => getMember(id)?.avatar;

  const getMemberIds = () =>
    (group?.members || [])
      .map(member => normalizeId(member?._id || member?.userId))
      .filter(Boolean);

  const startTimer = (serverStartedAt = null) => {
    if (serverStartedAt) {
      const timestamp = Number(serverStartedAt);
      if (Number.isFinite(timestamp)) {
        callStartedAtRef.current = timestamp;
        setDuration(Math.max(0, Math.floor((Date.now() - timestamp) / 1000)));
      }
    }

    if (timerStartedRef.current) return;
    timerStartedRef.current = true;
    timerRef.current = setInterval(() => {
      if (callStartedAtRef.current) {
        setDuration(
          Math.max(0, Math.floor((Date.now() - callStartedAtRef.current) / 1000))
        );
      }
    }, 1000);
  };

  const formatDuration = seconds => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const clampWindowPosition = (left, top) => {
    const card = cardRef.current;
    const width = card?.offsetWidth || 330;
    const height = card?.offsetHeight || 240;
    const margin = 10;

    return {
      x: Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - width - margin)),
      y: Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - height - margin))
    };
  };

  const saveWindowPosition = position => {
    try {
      localStorage.setItem(
        POSITION_STORAGE_KEY,
        JSON.stringify(position)
      );
    } catch {}
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(POSITION_STORAGE_KEY) || 'null'
      );

      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        setWindowPosition(clampWindowPosition(saved.x, saved.y));
        return;
      }
    } catch {}

    const width = cardRef.current?.offsetWidth || 330;
    const height = cardRef.current?.offsetHeight || 240;
    setWindowPosition(
      clampWindowPosition(
        window.innerWidth - width - 20,
        window.innerHeight - height - 20
      )
    );
  }, []);

  useEffect(() => {
    const onResize = () => {
      setWindowPosition(prev => {
        if (!prev) return prev;
        const next = clampWindowPosition(prev.x, prev.y);
        saveWindowPosition(next);
        return next;
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleDragStart = event => {
    if (event.target.closest?.('button') || !windowPosition) return;
    if (!['mouse', 'touch', 'pen'].includes(event.pointerType)) return;

    event.preventDefault();
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: windowPosition.x,
      startTop: windowPosition.y
    };
    setIsDragging(true);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  };

  const handleDragMove = event => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    setWindowPosition(
      clampWindowPosition(
        drag.startLeft + event.clientX - drag.startX,
        drag.startTop + event.clientY - drag.startY
      )
    );
  };

  const handleDragEnd = event => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    dragRef.current.active = false;
    setIsDragging(false);

    setWindowPosition(current => {
      if (current) saveWindowPosition(current);
      return current;
    });

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    if (closedRef.current) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('Appel fermé');
    }

    localStreamRef.current = stream;
    return stream;
  };

  const getIceConfig = async () => {
    if (!iceServersRef.current) {
      iceServersRef.current = await getIceServers(token);
    }

    return {
      iceServers: iceServersRef.current
    };
  };

  const clearPending = peerId => {
    pendingCandidatesRef.current.delete(normalizeId(peerId));
  };

  const addPendingCandidates = async (peerId, peer) => {
    const id = normalizeId(peerId);
    const pending = pendingCandidatesRef.current.get(id) || [];

    for (const candidate of pending) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('ICE candidate en attente invalide:', err);
      }
    }

    clearPending(id);
  };

  const attachRemoteAudio = (peerId, stream) => {
    const id = normalizeId(peerId);
    let audio = remoteAudioRef.current.get(id);

    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      remoteAudioRef.current.set(id, audio);
    }

    audio.srcObject = stream;
    audio.play().catch(() => {});
  };

  const createPeer = async peerId => {
    const id = normalizeId(peerId);
    if (!id || id === myId || closedRef.current) return null;

    const existing = peersRef.current.get(id);
    if (existing) return existing;

    const config = await getIceConfig();
    const peer = new RTCPeerConnection(config);

    peersRef.current.set(id, peer);

    const stream = await ensureLocalStream();
    stream.getTracks().forEach(track => peer.addTrack(track, stream));

    peer.onicecandidate = event => {
      if (!event.candidate || closedRef.current || !callIdRef.current) return;

      socket.emit('groupCallIceCandidate', {
        groupId,
        callId: callIdRef.current,
        receiverId: id,
        candidate: event.candidate
      });
    };

    peer.ontrack = event => {
      if (closedRef.current) return;
      const stream = event.streams?.[0];
      if (stream) attachRemoteAudio(id, stream);
    };

    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState;

      if (state === 'connected' || state === 'completed') {
        startTimer(callStartedAtRef.current);
        setStatus('connected');
      }

      if (
        state === 'failed' &&
        acceptedRef.current &&
        !closedRef.current &&
        !restartingRef.current.has(id)
      ) {
        restartPeerIce(id).catch(err =>
          console.error('ICE restart groupe:', err)
        );
      }
    };

    return peer;
  };

  const startPeerOffer = async peerId => {
    const id = normalizeId(peerId);
    if (!id || id === myId || closedRef.current || !callIdRef.current) return;

    const peer = await createPeer(id);
    if (!peer || closedRef.current) return;

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      if (closedRef.current) return;

      socket.emit('groupCallOffer', {
        groupId,
        callId: callIdRef.current,
        receiverId: id,
        offer
      });
    } catch (err) {
      console.error('Création offer groupe:', err);
    }
  };

  const ensurePeersForParticipants = async list => {
    if (!acceptedRef.current || closedRef.current) return;

    const ids = list
      .map(item => normalizeId(item))
      .filter(id => id && id !== myId);

    for (const id of ids) {
      await createPeer(id);

      /*
       * Une seule extrémité crée l'offer.
       * Cela évite les "glare" WebRTC quand plusieurs
       * membres rejoignent le groupe en même temps.
       */
      if (myId < id) {
        const peer = peersRef.current.get(id);
        if (
          peer &&
          peer.signalingState === 'stable' &&
          !peer.localDescription
        ) {
          await startPeerOffer(id);
        }
      }
    }
  };

  const acceptCall = async () => {
    try {
      setError('');
      acceptedRef.current = true;
      setStatus('calling');

      await ensureLocalStream();
      localReadyRef.current = true;

      if (!callIdRef.current) {
        throw new Error('Appel de groupe invalide.');
      }

      socket.emit('groupCallJoin', {
        groupId,
        callId: callIdRef.current
      });

      joinedRef.current = true;
    } catch (err) {
      console.error('Acceptation appel groupe:', err);
      setError(
        err?.name === 'NotAllowedError'
          ? 'Accès au microphone refusé.'
          : 'Impossible d’accéder au microphone.'
      );
      setStatus('error');
    }
  };

  const declineCall = () => {
    if (callIdRef.current) {
      socket.emit('groupCallLeave', {
        groupId,
        callId: callIdRef.current
      });
    }
    cleanup();
    onClose();
  };

  const cleanup = () => {
    if (closedRef.current) return;
    closedRef.current = true;

    clearInterval(timerRef.current);
    timerRef.current = null;
    timerStartedRef.current = false;

    for (const peer of peersRef.current.values()) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.oniceconnectionstatechange = null;
      try { peer.close(); } catch {}
    }

    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    restartingRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    for (const audio of remoteAudioRef.current.values()) {
      try { audio.pause(); } catch {}
      audio.srcObject = null;
    }

    remoteAudioRef.current.clear();
  };

  const hangUp = () => {
    if (callIdRef.current) {
      socket.emit('groupCallLeave', {
        groupId,
        callId: callIdRef.current
      });
    }
    cleanup();
    onClose();
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    stream.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled;
    });

    setMuted(prev => !prev);
  };

  const restartPeerIce = async peerId => {
    const id = normalizeId(peerId);
    if (
      !id ||
      closedRef.current ||
      !callIdRef.current ||
      restartingRef.current.has(id)
    ) {
      return;
    }

    const peer = peersRef.current.get(id);
    if (!peer) return;

    restartingRef.current.add(id);

    try {
      const offer = await peer.createOffer({
        iceRestart: true
      });

      await peer.setLocalDescription(offer);

      socket.emit('groupCallIceRestartOffer', {
        groupId,
        callId: callIdRef.current,
        receiverId: id,
        offer
      });
    } catch (err) {
      console.error('ICE restart groupe:', err);
    } finally {
      setTimeout(() => restartingRef.current.delete(id), 5000);
    }
  };

  useEffect(() => {
    closedRef.current = false;

    const handleStarted = payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        closedRef.current
      ) {
        return;
      }

      if (payload?.callId) {
        callIdRef.current = payload.callId;

        if (payload.callStartedAt) {
          callStartedAtRef.current = Number(payload.callStartedAt);
          if (acceptedRef.current) {
            startTimer(payload.callStartedAt);
          }
        }

        if (acceptedRef.current && localReadyRef.current && !joinedRef.current) {
          socket.emit('groupCallJoin', {
            groupId,
            callId: payload.callId
          });
          joinedRef.current = true;
        }
      }
    };

    const handleInvite = payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        normalizeId(payload?.callerId) === myId
      ) {
        return;
      }

      if (callIdRef.current && payload?.callId &&
          callIdRef.current !== payload.callId) {
        return;
      }

      callIdRef.current = payload?.callId || callIdRef.current;
    };

    const handleParticipants = async payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        payload?.callId !== callIdRef.current ||
        closedRef.current
      ) {
        return;
      }

      if (payload.callStartedAt) {
        callStartedAtRef.current = Number(payload.callStartedAt);
        startTimer(payload.callStartedAt);
      }

      const ids = Array.isArray(payload.participants)
        ? payload.participants.map(normalizeId).filter(Boolean)
        : [];

      setParticipants(ids);
      await ensurePeersForParticipants(ids);
    };

    const handleOffer = async payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        payload?.callId !== callIdRef.current ||
        normalizeId(payload?.senderId) === myId ||
        !acceptedRef.current ||
        closedRef.current ||
        !payload?.offer
      ) {
        return;
      }

      const senderId = normalizeId(payload.senderId);
      const peer = await createPeer(senderId);

      try {
        await peer.setRemoteDescription(
          new RTCSessionDescription(payload.offer)
        );
        await addPendingCandidates(senderId, peer);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit('groupCallAnswer', {
          groupId,
          callId: callIdRef.current,
          callerId: senderId,
          answer
        });

        setStatus('connected');
        startTimer(callStartedAtRef.current);
      } catch (err) {
        console.error('groupCallOffer:', err);
      }
    };

    const handleAnswer = async payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        payload?.callId !== callIdRef.current ||
        closedRef.current ||
        !payload?.answer
      ) {
        return;
      }

      const senderId = normalizeId(payload.senderId);
      const peer = peersRef.current.get(senderId);
      if (!peer) return;

      try {
        await peer.setRemoteDescription(
          new RTCSessionDescription(payload.answer)
        );
        await addPendingCandidates(senderId, peer);
        setStatus('connected');
        startTimer(callStartedAtRef.current);
      } catch (err) {
        console.error('groupCallAnswer:', err);
      }
    };

    const handleIceCandidate = async payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        payload?.callId !== callIdRef.current ||
        closedRef.current ||
        !payload?.candidate
      ) {
        return;
      }

      const senderId = normalizeId(payload.senderId);
      const peer = peersRef.current.get(senderId);

      if (!peer) return;

      if (peer.remoteDescription) {
        try {
          await peer.addIceCandidate(
            new RTCIceCandidate(payload.candidate)
          );
        } catch (err) {
          console.error('groupCallIceCandidate:', err);
        }
      } else {
        const pending =
          pendingCandidatesRef.current.get(senderId) || [];
        pending.push(payload.candidate);
        pendingCandidatesRef.current.set(senderId, pending);
      }
    };

    const handleRestartOffer = async payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        payload?.callId !== callIdRef.current ||
        closedRef.current ||
        !payload?.offer
      ) {
        return;
      }

      const senderId = normalizeId(payload.senderId);
      const peer = await createPeer(senderId);

      try {
        await peer.setRemoteDescription(
          new RTCSessionDescription(payload.offer)
        );
        await addPendingCandidates(senderId, peer);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit('groupCallIceRestartAnswer', {
          groupId,
          callId: callIdRef.current,
          callerId: senderId,
          answer
        });
      } catch (err) {
        console.error('groupCallIceRestartOffer:', err);
      }
    };

    const handleRestartAnswer = async payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        payload?.callId !== callIdRef.current ||
        closedRef.current ||
        !payload?.answer
      ) {
        return;
      }

      const senderId = normalizeId(payload.senderId);
      const peer = peersRef.current.get(senderId);
      if (!peer) return;

      try {
        await peer.setRemoteDescription(
          new RTCSessionDescription(payload.answer)
        );
        await addPendingCandidates(senderId, peer);
      } catch (err) {
        console.error('groupCallIceRestartAnswer:', err);
      }
    };

    const handleMemberLeft = payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        payload?.callId !== callIdRef.current
      ) {
        return;
      }

      const id = normalizeId(payload.userId);
      if (!id) return;

      const peer = peersRef.current.get(id);
      if (peer) {
        try { peer.close(); } catch {}
        peersRef.current.delete(id);
      }

      const audio = remoteAudioRef.current.get(id);
      if (audio) {
        try { audio.pause(); } catch {}
        audio.srcObject = null;
        remoteAudioRef.current.delete(id);
      }

      setParticipants(prev =>
        prev.filter(item => normalizeId(item) !== id)
      );
    };

    const handleEnded = payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        payload?.callId !== callIdRef.current
      ) {
        return;
      }

      cleanup();
      onClose();
    };

    const handleError = payload => {
      if (
        normalizeId(payload?.groupId) !== groupId ||
        (payload?.callId && payload.callId !== callIdRef.current)
      ) {
        return;
      }

      setError(payload?.message || 'Appel de groupe impossible.');
      setStatus('error');
    };

    socket.on('groupCallStarted', handleStarted);
    socket.on('groupCallInvite', handleInvite);
    socket.on('groupCallParticipants', handleParticipants);
    socket.on('groupCallOffer', handleOffer);
    socket.on('groupCallAnswer', handleAnswer);
    socket.on('groupCallIceCandidate', handleIceCandidate);
    socket.on('groupCallIceRestartOffer', handleRestartOffer);
    socket.on('groupCallIceRestartAnswer', handleRestartAnswer);
    socket.on('groupCallMemberLeft', handleMemberLeft);
    socket.on('groupCallEnded', handleEnded);
    socket.on('groupCallError', handleError);

    /*
     * L'appelant est déjà ajouté au call par le serveur.
     * Il doit récupérer la liste des participants après l'ouverture.
     */
    if (!incomingCall) {
      acceptedRef.current = true;

      ensureLocalStream()
        .then(() => {
          localReadyRef.current = true;

          if (closedRef.current) return;

          socket.emit('groupCallStart', {
            groupId
          });
        })
        .catch(err => {
          console.error('Micro appel groupe:', err);
          setError(
            err?.name === 'NotAllowedError'
              ? 'Accès au microphone refusé.'
              : 'Impossible d’accéder au microphone.'
          );
          setStatus('error');
        });
    }

    return () => {
      socket.off('groupCallStarted', handleStarted);
      socket.off('groupCallInvite', handleInvite);
      socket.off('groupCallParticipants', handleParticipants);
      socket.off('groupCallOffer', handleOffer);
      socket.off('groupCallAnswer', handleAnswer);
      socket.off('groupCallIceCandidate', handleIceCandidate);
      socket.off('groupCallIceRestartOffer', handleRestartOffer);
      socket.off('groupCallIceRestartAnswer', handleRestartAnswer);
      socket.off('groupCallMemberLeft', handleMemberLeft);
      socket.off('groupCallEnded', handleEnded);
      socket.off('groupCallError', handleError);
      cleanup();
    };
  }, []);

  const participantIds = participants.filter(id => id !== myId);
  const visibleParticipants = participantIds.slice(0, 5);

  return (
    <div
      style={{
        ...styles.container,
        left: windowPosition?.x ?? 0,
        top: windowPosition?.y ?? 0
      }}
      ref={cardRef}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerCancel={handleDragEnd}
    >
      <div
        style={{
          ...styles.card,
          cursor: isDragging ? 'grabbing' : 'default',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        <div style={styles.identity}>
          <div style={styles.avatar}>
            {group?.avatar ? (
              <img
                src={group.avatar}
                alt=""
                style={styles.avatarImage}
                draggable="false"
              />
            ) : (
              groupName[0]?.toUpperCase() || '?'
            )}
          </div>

          <div style={styles.identityText}>
            <p style={styles.name}>{groupName}</p>
            <p style={styles.status}>
              {status === 'incoming' && '📲 Appel entrant'}
              {status === 'calling' && '📞 Appel de groupe...'}
              {status === 'connected' && `🔊 ${formatDuration(duration)}`}
              {status === 'error' && `❌ ${error || 'Appel échoué'}`}
            </p>
          </div>
        </div>

        <div style={styles.participants}>
          {visibleParticipants.length === 0 ? (
            <span style={styles.waiting}>
              En attente de participants...
            </span>
          ) : (
            visibleParticipants.map(id => (
              <div key={id} style={styles.participant}>
                <div style={styles.smallAvatar}>
                  {getMemberAvatar(id) ? (
                    <img
                      src={getMemberAvatar(id)}
                      alt=""
                      style={styles.avatarImage}
                      draggable="false"
                    />
                  ) : (
                    getMemberName(id)[0]?.toUpperCase() || '?'
                  )}
                </div>
                <span style={styles.participantName}>
                  {getMemberName(id)}
                </span>
              </div>
            ))
          )}

          {participantIds.length > 5 && (
            <span style={styles.more}>
              +{participantIds.length - 5}
            </span>
          )}
        </div>

        <div style={styles.buttons}>
          {status === 'incoming' ? (
            <>
              <button
                style={styles.acceptBtn}
                onClick={acceptCall}
                aria-label="Accepter"
              >
                📞
              </button>
              <button
                style={styles.hangupBtn}
                onClick={declineCall}
                aria-label="Refuser"
              >
                📵
              </button>
            </>
          ) : (
            <>
              {(status === 'connected' || status === 'calling') && (
                <button
                  style={{
                    ...styles.muteBtn,
                    background: muted
                      ? 'var(--danger)'
                      : 'var(--bg-hover)'
                  }}
                  onClick={toggleMute}
                  aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}
                >
                  {muted ? '🔇' : '🎤'}
                </button>
              )}

              <button
                style={styles.hangupBtn}
                onClick={hangUp}
                aria-label="Raccrocher"
              >
                📵
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    zIndex: 9999,
    pointerEvents: 'none',
    left: '0',
    top: '0'
  },

  card: {
    pointerEvents: 'auto',
    width: '330px',
    maxWidth: 'calc(100vw - 20px)',
    boxSizing: 'border-box',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '14px 16px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    position: 'relative'
  },

  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'grab',
    touchAction: 'none'
  },

  avatar: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: 'var(--accent-glow)',
    border: '2px solid var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--accent)',
    flexShrink: 0,
    overflow: 'hidden'
  },

  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
    userSelect: 'none',
    pointerEvents: 'none'
  },

  identityText: {
    minWidth: 0,
    flex: 1
  },

  name: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  status: {
    margin: '4px 0 0',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    pointerEvents: 'none'
  },

  participants: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    maxHeight: '150px',
    overflowY: 'auto',
    padding: '4px 0'
  },

  participant: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    minWidth: 0
  },

  smallAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent)',
    display: 'grid',
    placeItems: 'center',
    color: 'var(--accent)',
    fontSize: '12px',
    fontWeight: '700',
    flexShrink: 0,
    overflow: 'hidden'
  },

  participantName: {
    color: 'var(--text-primary)',
    fontSize: '13px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  waiting: {
    color: 'var(--text-muted)',
    fontSize: '12px',
    textAlign: 'center'
  },

  more: {
    color: 'var(--text-muted)',
    fontSize: '12px'
  },

  buttons: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px'
  },

  acceptBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background: 'var(--success)',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    touchAction: 'manipulation'
  },

  hangupBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background: 'var(--danger)',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    touchAction: 'manipulation'
  },

  muteBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    touchAction: 'manipulation'
  }
};
