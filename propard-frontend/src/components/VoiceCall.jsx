import { useEffect, useRef, useState } from 'react';
import socket from '../socket';

const getIceServers = async (token) => {
  const endpoint = '/api/turn-credentials';

  const stunServers = [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:stun1.l.google.com:19302'
    }
  ];

  try {
    const res = await fetch(endpoint, {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {}
    });

    const contentType =
      res.headers.get('content-type') || '';

    const raw = await res.text();

    if (!res.ok) {
      throw new Error(
        `turn-credentials fetch failed ` +
        `(status ${res.status})`
      );
    }

    if (!contentType.includes('application/json')) {
      throw new Error(
        `Réponse non-JSON reçue depuis ${endpoint}`
      );
    }

    const data = JSON.parse(raw);

    const iceServers =
      Array.isArray(data)
        ? data
        : (data.iceServers || data);

    if (!Array.isArray(iceServers)) {
      throw new Error(
        'Liste ICE servers invalide'
      );
    }

    return {
      iceServers: [
        ...stunServers,
        ...iceServers
      ]
    };

  } catch (err) {
    console.error(
      'Repli sur STUN seul:',
      err
    );

    return {
      iceServers: stunServers
    };
  }
};

export default function VoiceCall({
  friend,
  userId,
  token,
  onClose,
  incomingOffer
}) {
  const [status, setStatus] = useState(
    incomingOffer ? 'incoming' : 'calling'
  );

  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const timerRef = useRef(null);

  const hasInitiatedRef = useRef(false);
  const pendingCandidates = useRef([]);
  const timerStartedRef = useRef(false);

  /*
   * Liste complète des ICE servers reçus du backend.
   */
  const iceServersRef = useRef([]);

  /*
   * Index du serveur TURN actuellement privilégié
   * lors d'un failover.
   */
  const currentTurnIndexRef = useRef(0);

  /*
   * Empêche deux ICE restarts simultanés.
   */
  const restartingIceRef = useRef(false);

  /*
   * Nombre maximum de tentatives de failover pour
   * éviter une boucle infinie.
   */
  const restartAttemptsRef = useRef(0);

  /*
   * Permet de savoir si l'utilisateur est l'appelant.
   *
   * Seul l'appelant déclenche automatiquement le failover.
   * L'autre côté reçoit l'offre ICE restart et répond.
   */
  const isCallerRef = useRef(!incomingOffer);

  const friendName =
    friend?.nickname?.trim() ||
    friend?.displayName?.trim() ||
    friend?.username ||
    'Appel inconnu';

  const startTimer = () => {
    if (timerStartedRef.current) return;

    timerStartedRef.current = true;

    timerRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  };

  const formatDuration = s => {
    const m = Math.floor(s / 60);
    const sec = s % 60;

    return `${m}:${sec
      .toString()
      .padStart(2, '0')}`;
  };

  const cleanup = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    timerStartedRef.current = false;

    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach(track => track.stop());

      localStreamRef.current = null;
    }

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    pendingCandidates.current = [];

    iceServersRef.current = [];
    currentTurnIndexRef.current = 0;
    restartingIceRef.current = false;
    restartAttemptsRef.current = 0;
  };

  /*
   * Retourne uniquement les serveurs TURN.
   *
   * Les STUN ne servent pas au failover TURN.
   */
  const getTurnServers = () => {
    return iceServersRef.current.filter(
      server => {
        const urls = Array.isArray(server.urls)
          ? server.urls
          : [server.urls];

        return urls.some(
          url =>
            typeof url === 'string' &&
            (
              url.startsWith('turn:') ||
              url.startsWith('turns:')
            )
        );
      }
    );
  };

  /*
   * Change le serveur ICE utilisé pour le prochain
   * redémarrage ICE.
   */
  const switchToNextTurnServer = async () => {
    const peer = peerRef.current;

    if (!peer) return false;

    if (restartingIceRef.current) {
      return false;
    }

    const turnServers = getTurnServers();

    if (turnServers.length === 0) {
      console.error(
        'Aucun serveur TURN disponible pour le failover.'
      );

      return false;
    }

    if (
      restartAttemptsRef.current >=
      turnServers.length
    ) {
      console.error(
        'Tous les serveurs TURN disponibles ont ' +
        'déjà été essayés.'
      );

      return false;
    }

    restartingIceRef.current = true;

    const nextIndex =
      currentTurnIndexRef.current %
      turnServers.length;

    const nextTurn =
      turnServers[nextIndex];

    currentTurnIndexRef.current =
      (nextIndex + 1) %
      turnServers.length;

    restartAttemptsRef.current += 1;

    try {
      console.log(
        '🔄 ICE restart avec le serveur TURN suivant:',
        nextIndex + 1,
        '/',
        turnServers.length
      );

      /*
       * On conserve les STUN et on sélectionne le
       * serveur TURN suivant.
       */
      const stunServers =
        iceServersRef.current.filter(
          server => {
            const urls = Array.isArray(server.urls)
              ? server.urls
              : [server.urls];

            return urls.some(
              url =>
                typeof url === 'string' &&
                url.startsWith('stun:')
            );
          }
        );

      peer.setConfiguration({
        iceServers: [
          ...stunServers,
          nextTurn
        ]
      });

      /*
       * Demande à WebRTC de refaire ICE sans fermer
       * le RTCPeerConnection.
       */
      peer.restartIce();

      /*
       * Création d'une nouvelle offer.
       *
       * restartIce() fera en sorte que cette offer
       * contienne les nouveaux paramètres ICE.
       */
      const offer =
        await peer.createOffer();

      await peer.setLocalDescription(
        offer
      );

      socket.emit(
        'iceRestartOffer',
        {
          receiverId: friend._id,
          offer
        }
      );

      setStatus('calling');

      return true;

    } catch (err) {
      console.error(
        'ICE restart error:',
        err
      );

      return false;

    } finally {
      restartingIceRef.current = false;
    }
  };

  const createPeer = async () => {
    const config =
      await getIceServers(token);

    iceServersRef.current =
      config.iceServers;

    /*
     * On commence avec toute la liste.
     * WebRTC peut donc trouver un chemin valide.
     */
    const peer =
      new RTCPeerConnection(config);

    peer.onicecandidate = e => {
      if (!e.candidate) return;

      socket.emit('iceCandidate', {
        receiverId: friend._id,
        candidate: e.candidate
      });
    };

    peer.ontrack = e => {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current =
          new Audio();

        remoteAudioRef.current.autoplay =
          true;

        remoteAudioRef.current.playsInline =
          true;
      }

      remoteAudioRef.current.srcObject =
        e.streams[0];

      remoteAudioRef.current
        .play()
        .catch(err =>
          console.error(
            'Impossible de lire le flux audio:',
            err
          )
        );
    };

    peer.oniceconnectionstatechange = async () => {
      console.log(
        'ICE state:',
        peer.iceConnectionState
      );

      if (
        peer.iceConnectionState ===
          'connected' ||
        peer.iceConnectionState ===
          'completed'
      ) {
        setStatus('connected');

        startTimer();

        /*
         * Une connexion est revenue :
         * on remet le compteur de failover à zéro.
         */
        restartAttemptsRef.current = 0;

        return;
      }

      if (
        peer.iceConnectionState ===
        'disconnected'
      ) {
        /*
         * "disconnected" peut être temporaire.
         * On ne change donc pas immédiatement de TURN.
         */
        console.log(
          'Connexion WebRTC temporairement interrompue'
        );

        return;
      }

      if (
        peer.iceConnectionState ===
        'failed'
      ) {
        console.warn(
          '❌ ICE failed : tentative de failover TURN'
        );

        /*
         * Seul l'appelant déclenche automatiquement
         * la nouvelle négociation.
         */
        if (isCallerRef.current) {
          await switchToNextTurnServer();
        }
      }
    };

    return peer;
  };

  const addPendingCandidates = async peer => {
    for (
      const candidate of
      pendingCandidates.current
    ) {
      try {
        await peer.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (err) {
        console.error(
          'candidate error:',
          err
        );
      }
    }

    pendingCandidates.current = [];
  };

  const startCall = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true
          }
        );

      localStreamRef.current = stream;

      const peer =
        await createPeer();

      peerRef.current = peer;

      stream
        .getTracks()
        .forEach(track =>
          peer.addTrack(
            track,
            stream
          )
        );

      const offer =
        await peer.createOffer();

      await peer.setLocalDescription(
        offer
      );

      socket.emit('callUser', {
        receiverId: friend._id,
        offer
      });

    } catch (err) {
      console.error(
        'startCall error:',
        err
      );

      setStatus('error');
    }
  };

  const answerCall = async () => {
    try {
      isCallerRef.current = false;

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true
          }
        );

      localStreamRef.current = stream;

      const peer =
        await createPeer();

      peerRef.current = peer;

      stream
        .getTracks()
        .forEach(track =>
          peer.addTrack(
            track,
            stream
          )
        );

      await peer.setRemoteDescription(
        new RTCSessionDescription(
          incomingOffer
        )
      );

      await addPendingCandidates(peer);

      const answer =
        await peer.createAnswer();

      await peer.setLocalDescription(
        answer
      );

      socket.emit('answerCall', {
        callerId: friend._id,
        answer
      });

    } catch (err) {
      console.error(
        'answerCall error:',
        err
      );

      setStatus('error');
    }
  };

  const declineCall = () => {
    socket.emit('endCall', {
      receiverId: friend._id
    });

    cleanup();
    onClose();
  };

  const hangUp = () => {
    socket.emit('endCall', {
      receiverId: friend._id
    });

    cleanup();
    onClose();
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;

    localStreamRef.current
      .getAudioTracks()
      .forEach(track => {
        track.enabled = !track.enabled;
      });

    setMuted(prev => !prev);
  };

  useEffect(() => {
    if (
      !incomingOffer &&
      !hasInitiatedRef.current
    ) {
      hasInitiatedRef.current = true;

      isCallerRef.current = true;

      startCall();
    }

    /*
     * Réponse à l'offer initiale.
     */
    const handleCallAnswered =
      async ({ answer }) => {
        if (!peerRef.current) return;

        try {
          await peerRef.current
            .setRemoteDescription(
              new RTCSessionDescription(
                answer
              )
            );

          await addPendingCandidates(
            peerRef.current
          );

        } catch (err) {
          console.error(
            'callAnswered error:',
            err
          );
        }
      };

    /*
     * Réception d'une candidate ICE.
     */
    const handleIceCandidate =
      async ({ candidate }) => {
        if (!candidate) return;

        if (
          peerRef.current &&
          peerRef.current.remoteDescription
        ) {
          try {
            await peerRef.current
              .addIceCandidate(
                new RTCIceCandidate(
                  candidate
                )
              );

          } catch (err) {
            console.error(
              'iceCandidate error:',
              err
            );
          }

        } else {
          pendingCandidates.current.push(
            candidate
          );
        }
      };

    /*
     * L'autre utilisateur nous envoie une nouvelle
     * offer parce qu'il effectue un ICE restart.
     *
     * Cela arrive notamment lorsque l'appelant change
     * de TURN.
     */
    const handleIceRestartOffer =
      async ({ offer }) => {
        const peer =
          peerRef.current;

        if (!peer) return;

        try {
          console.log(
            '🔄 Réception d’une ICE restart offer'
          );

          await peer.setRemoteDescription(
            new RTCSessionDescription(
              offer
            )
          );

          const answer =
            await peer.createAnswer();

          await peer.setLocalDescription(
            answer
          );

          socket.emit(
            'iceRestartAnswer',
            {
              callerId: friend._id,
              answer
            }
          );

        } catch (err) {
          console.error(
            'iceRestartOffer error:',
            err
          );
        }
      };

    /*
     * Réception de la réponse à notre ICE restart.
     */
    const handleIceRestartAnswer =
      async ({ answer }) => {
        const peer =
          peerRef.current;

        if (!peer) return;

        try {
          console.log(
            '🔄 Réception de la réponse ICE restart'
          );

          await peer.setRemoteDescription(
            new RTCSessionDescription(
              answer
            )
          );

        } catch (err) {
          console.error(
            'iceRestartAnswer error:',
            err
          );
        }
      };

    const handleCallEnded = () => {
      cleanup();
      onClose();
    };

    const handleCallFailed = () => {
      setStatus('failed');
    };

    socket.on(
      'callAnswered',
      handleCallAnswered
    );

    socket.on(
      'iceCandidate',
      handleIceCandidate
    );

    socket.on(
      'iceRestartOffer',
      handleIceRestartOffer
    );

    socket.on(
      'iceRestartAnswer',
      handleIceRestartAnswer
    );

    socket.on(
      'callEnded',
      handleCallEnded
    );

    socket.on(
      'callFailed',
      handleCallFailed
    );

    return () => {
      socket.off(
        'callAnswered',
        handleCallAnswered
      );

      socket.off(
        'iceCandidate',
        handleIceCandidate
      );

      socket.off(
        'iceRestartOffer',
        handleIceRestartOffer
      );

      socket.off(
        'iceRestartAnswer',
        handleIceRestartAnswer
      );

      socket.off(
        'callEnded',
        handleCallEnded
      );

      socket.off(
        'callFailed',
        handleCallFailed
      );

      cleanup();
    };
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        <div style={styles.identity}>
          <div style={styles.avatar}>
            {friend?.avatar ? (
              <img
                src={friend.avatar}
                alt=""
                style={styles.avatarImage}
              />
            ) : (
              friendName[0]
                ? friendName[0].toUpperCase()
                : '?'
            )}
          </div>

          <div style={styles.identityText}>
            <p style={styles.name}>
              {friendName}
            </p>

            <p style={styles.status}>
              {status === 'calling' &&
                '📞 Appel en cours...'}

              {status === 'incoming' &&
                '📲 Appel entrant'}

              {status === 'connected' &&
                `🔊 ${formatDuration(
                  duration
                )}`}

              {status === 'failed' &&
                '❌ Appel échoué'}

              {status === 'error' &&
                '❌ Micro inaccessible'}
            </p>
          </div>
        </div>

        <div style={styles.buttons}>
          {status === 'incoming' ? (
            <>
              <button
                style={styles.acceptBtn}
                onClick={answerCall}
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
              {status === 'connected' && (
                <button
                  style={{
                    ...styles.muteBtn,
                    background: muted
                      ? 'var(--danger)'
                      : 'var(--bg-hover)'
                  }}
                  onClick={toggleMute}
                  aria-label={
                    muted
                      ? 'Réactiver le micro'
                      : 'Couper le micro'
                  }
                >
                  {muted
                    ? '🔇'
                    : '🎤'}
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
    right: '20px',
    bottom: '20px',
    zIndex: 9999,
    pointerEvents: 'none'
  },

  card: {
    pointerEvents: 'auto',
    width: '300px',
    background:
      'var(--bg-secondary)',
    border:
      '1px solid var(--border)',
    borderRadius: '16px',
    padding: '14px 16px',
    boxShadow:
      '0 12px 40px rgba(0,0,0,0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },

  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },

  avatar: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background:
      'var(--accent-glow)',
    border:
      '2px solid var(--accent)',
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
    display: 'block'
  },

  identityText: {
    minWidth: 0,
    flex: 1
  },

  name: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    color:
      'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  status: {
    margin: '4px 0 0',
    fontSize: '12px',
    color:
      'var(--text-secondary)'
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
    background:
      'var(--success)',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer'
  },

  hangupBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background:
      'var(--danger)',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer'
  },

  muteBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer'
  }
};