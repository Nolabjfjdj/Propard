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
   * Liste complète des serveurs ICE récupérés
   * depuis le backend.
   */
  const iceServersRef = useRef([]);

  /*
   * Liste uniquement des serveurs TURN.
   */
  const turnServersRef = useRef([]);

  /*
   * Index du prochain serveur TURN à essayer.
   */
  const currentTurnIndexRef = useRef(0);

  /*
   * Empêche plusieurs ICE restarts simultanés.
   */
  const restartingIceRef = useRef(false);

  /*
   * Nombre de serveurs TURN déjà essayés
   * depuis la dernière connexion stable.
   */
  const restartAttemptsRef = useRef(0);

  /*
   * Permet de savoir si l'utilisateur est l'appelant.
   *
   * Seul l'appelant lance automatiquement
   * les ICE restarts.
   */
  const isCallerRef = useRef(!incomingOffer);

  /*
   * Évite de lancer un failover après fermeture
   * du composant.
   */
  const closedRef = useRef(false);

  /*
   * Timer utilisé lorsqu'on passe par disconnected.
   *
   * disconnected peut être temporaire, donc on
   * attend quelques secondes avant d'envisager
   * un failover.
   */
  const disconnectedTimerRef = useRef(null);

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

  const clearDisconnectedTimer = () => {
    if (disconnectedTimerRef.current) {
      clearTimeout(
        disconnectedTimerRef.current
      );

      disconnectedTimerRef.current = null;
    }
  };

  const cleanup = () => {
    closedRef.current = true;

    clearInterval(timerRef.current);
    timerRef.current = null;

    clearDisconnectedTimer();

    timerStartedRef.current = false;

    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach(track => track.stop());

      localStreamRef.current = null;
    }

    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.oniceconnectionstatechange = null;

      peerRef.current.close();
      peerRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    pendingCandidates.current = [];

    iceServersRef.current = [];
    turnServersRef.current = [];

    currentTurnIndexRef.current = 0;
    restartingIceRef.current = false;
    restartAttemptsRef.current = 0;
  };

  /*
   * Retourne uniquement les serveurs TURN.
   */
  const getTurnServers = () => {
    return turnServersRef.current;
  };

  /*
   * Essaie de déterminer quel serveur TURN est
   * réellement utilisé actuellement.
   *
   * On regarde le selected candidate pair puis
   * le local candidate. Si son type est "relay",
   * c'est un candidat TURN.
   */
  const getActiveTurnServer = async peer => {
    try {
      const stats =
        await peer.getStats();

      let selectedPair = null;

      stats.forEach(report => {
        if (
          report.type === 'candidate-pair' &&
          (
            report.selected === true ||
            report.state === 'succeeded' &&
            report.nominated === true
          )
        ) {
          selectedPair = report;
        }
      });

      if (!selectedPair) {
        stats.forEach(report => {
          if (
            !selectedPair &&
            report.type === 'candidate-pair' &&
            report.state === 'succeeded'
          ) {
            selectedPair = report;
          }
        });
      }

      if (!selectedPair) {
        return null;
      }

      const localCandidate =
        stats.get(
          selectedPair.localCandidateId
        );

      if (!localCandidate) {
        return null;
      }

      if (
        localCandidate.candidateType !==
        'relay'
      ) {
        return null;
      }

      /*
       * Selon le navigateur, "url" peut être
       * disponible directement sur le candidate.
       */
      if (localCandidate.url) {
        return localCandidate.url;
      }

      /*
       * Fallback : certaines implémentations
       * peuvent fournir une adresse mais pas l'URL
       * TURN complète.
       */
      return null;

    } catch (err) {
      console.error(
        'Impossible de déterminer le TURN actif:',
        err
      );

      return null;
    }
  };

  /*
   * Trouve l'index d'un serveur TURN à partir
   * de son URL.
   */
  const findTurnIndexByUrl = turnUrl => {
    if (!turnUrl) return -1;

    const turnServers =
      getTurnServers();

    for (
      let i = 0;
      i < turnServers.length;
      i++
    ) {
      const server =
        turnServers[i];

      const urls =
        Array.isArray(server.urls)
          ? server.urls
          : [server.urls];

      const found =
        urls.some(url => {
          if (
            typeof url !== 'string'
          ) {
            return false;
          }

          /*
           * On compare principalement le
           * serveur/hôte/port.
           */
          return url === turnUrl;
        });

      if (found) {
        return i;
      }
    }

    return -1;
  };

  /*
   * Définit le prochain TURN à utiliser.
   *
   * Si le TURN actif est connu :
   *
   * TURN 1 actif
   * → TURN 2
   *
   * TURN 2 actif
   * → TURN 3
   *
   * TURN 3 actif
   * → TURN 1
   *
   * Si le TURN actif n'est pas identifiable,
   * on commence avec le premier TURN.
   */
  const prepareNextTurnServer = async peer => {
    const turnServers =
      getTurnServers();

    if (turnServers.length === 0) {
      console.error(
        'Aucun serveur TURN disponible pour le failover.'
      );

      return null;
    }

    const activeTurnUrl =
      await getActiveTurnServer(peer);

    const activeIndex =
      findTurnIndexByUrl(
        activeTurnUrl
      );

    let nextIndex;

    if (activeIndex >= 0) {
      nextIndex =
        (activeIndex + 1) %
        turnServers.length;
    } else {
      nextIndex =
        currentTurnIndexRef.current %
        turnServers.length;
    }

    currentTurnIndexRef.current =
      (nextIndex + 1) %
      turnServers.length;

    return {
      server: turnServers[nextIndex],
      index: nextIndex
    };
  };

  /*
   * Effectue un ICE restart avec le prochain
   * serveur TURN.
   */
  const switchToNextTurnServer = async () => {
    const peer = peerRef.current;

    if (!peer) {
      return false;
    }

    if (closedRef.current) {
      return false;
    }

    if (restartingIceRef.current) {
      console.log(
        'ICE restart déjà en cours.'
      );

      return false;
    }

    const turnServers =
      getTurnServers();

    if (turnServers.length === 0) {
      console.error(
        'Aucun serveur TURN disponible pour le failover.'
      );

      return false;
    }

    /*
     * Empêche de faire une boucle infinie
     * sans limite.
     */
    if (
      restartAttemptsRef.current >=
      turnServers.length
    ) {
      console.error(
        'Tous les serveurs TURN disponibles ' +
        'ont déjà été essayés.'
      );

      setStatus('failed');

      return false;
    }

    restartingIceRef.current = true;

    try {
      const next =
        await prepareNextTurnServer(
          peer
        );

      if (!next) {
        return false;
      }

      const nextTurn =
        next.server;

      restartAttemptsRef.current += 1;

      console.log(
        '🔄 ICE restart avec TURN:',
        next.index + 1,
        '/',
        turnServers.length
      );

      /*
       * On conserve les STUN et on utilise
       * uniquement le TURN sélectionné.
       */
      const stunServers =
        iceServersRef.current.filter(
          server => {
            const urls =
              Array.isArray(server.urls)
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
       * Demande un nouvel ICE generation.
       */
      peer.restartIce();

      /*
       * Création de la nouvelle offer.
       */
      const offer =
        await peer.createOffer();

      if (closedRef.current) {
        return false;
      }

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

      console.log(
        '✅ ICE restart offer envoyée.'
      );

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

    if (closedRef.current) {
      throw new Error(
        'Appel fermé pendant la récupération ICE.'
      );
    }

    iceServersRef.current =
      config.iceServers;

    turnServersRef.current =
      config.iceServers.filter(
        server => {
          const urls =
            Array.isArray(server.urls)
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

    console.log(
      'ICE servers:',
      iceServersRef.current
    );

    console.log(
      'TURN servers disponibles:',
      turnServersRef.current.length
    );

    const peer =
      new RTCPeerConnection(
        config
      );

    peer.onicecandidate = e => {
      if (!e.candidate) return;

      if (closedRef.current) {
        return;
      }

      socket.emit(
        'iceCandidate',
        {
          receiverId: friend._id,
          candidate: e.candidate
        }
      );
    };

    peer.ontrack = e => {
      if (closedRef.current) {
        return;
      }

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

    peer.oniceconnectionstatechange =
      async () => {
        if (closedRef.current) {
          return;
        }

        const state =
          peer.iceConnectionState;

        console.log(
          'ICE state:',
          state
        );

        if (
          state === 'connected' ||
          state === 'completed'
        ) {
          clearDisconnectedTimer();

          setStatus('connected');

          startTimer();

          /*
           * Une connexion est revenue.
           * On peut autoriser un nouveau cycle
           * de failover si une panne survient
           * beaucoup plus tard.
           */
          restartAttemptsRef.current = 0;

          /*
           * On essaie de mémoriser le TURN actif
           * pour que le prochain failover parte
           * réellement au serveur suivant.
           */
          const activeTurnUrl =
            await getActiveTurnServer(
              peer
            );

          const activeIndex =
            findTurnIndexByUrl(
              activeTurnUrl
            );

          if (activeIndex >= 0) {
            currentTurnIndexRef.current =
              (activeIndex + 1) %
              getTurnServers().length;
          }

          return;
        }

        if (
          state === 'disconnected'
        ) {
          /*
           * Ne pas basculer immédiatement :
           * disconnected peut être temporaire.
           */
          console.log(
            '⚠️ Connexion WebRTC temporairement interrompue.'
          );

          clearDisconnectedTimer();

          disconnectedTimerRef.current =
            setTimeout(
              async () => {
                disconnectedTimerRef.current =
                  null;

                if (
                  closedRef.current ||
                  !peerRef.current
                ) {
                  return;
                }

                /*
                 * Si la connexion est revenue entre
                 * temps, aucun failover.
                 */
                if (
                  peer.iceConnectionState !==
                  'disconnected'
                ) {
                  return;
                }

                /*
                 * On laisse WebRTC décider si elle
                 * passe naturellement à failed.
                 */
                console.log(
                  '⚠️ ICE toujours disconnected après délai.'
                );
              },
              8000
            );

          return;
        }

        if (
          state === 'failed'
        ) {
          clearDisconnectedTimer();

          console.warn(
            '❌ ICE failed.'
          );

          /*
           * Seul l'appelant effectue le
           * changement de TURN.
           */
          if (
            isCallerRef.current
          ) {
            await switchToNextTurnServer();
          }

          return;
        }
      };

    return peer;
  };

  const addPendingCandidates = async peer => {
    if (
      !peer ||
      closedRef.current
    ) {
      return;
    }

    if (
      !peer.remoteDescription
    ) {
      return;
    }

    const candidates =
      [...pendingCandidates.current];

    pendingCandidates.current = [];

    for (
      const candidate of candidates
    ) {
      try {
        await peer.addIceCandidate(
          new RTCIceCandidate(
            candidate
          )
        );

      } catch (err) {
        console.error(
          'candidate error:',
          err
        );
      }
    }
  };

  const startCall = async () => {
    try {
      const stream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: true
          });

      if (closedRef.current) {
        stream
          .getTracks()
          .forEach(track =>
            track.stop()
          );

        return;
      }

      localStreamRef.current =
        stream;

      const peer =
        await createPeer();

      if (closedRef.current) {
        peer.close();

        stream
          .getTracks()
          .forEach(track =>
            track.stop()
          );

        return;
      }

      peerRef.current =
        peer;

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

      if (closedRef.current) {
        return;
      }

      socket.emit(
        'callUser',
        {
          receiverId: friend._id,
          offer
        }
      );

    } catch (err) {
      console.error(
        'startCall error:',
        err
      );

      if (!closedRef.current) {
        setStatus('error');
      }
    }
  };

  const answerCall = async () => {
    try {
      isCallerRef.current = false;

      const stream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: true
          });

      if (closedRef.current) {
        stream
          .getTracks()
          .forEach(track =>
            track.stop()
          );

        return;
      }

      localStreamRef.current =
        stream;

      const peer =
        await createPeer();

      if (closedRef.current) {
        peer.close();

        stream
          .getTracks()
          .forEach(track =>
            track.stop()
          );

        return;
      }

      peerRef.current =
        peer;

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

      /*
       * Les candidates reçues avant l'offer
       * peuvent maintenant être ajoutées.
       */
      await addPendingCandidates(
        peer
      );

      const answer =
        await peer.createAnswer();

      await peer.setLocalDescription(
        answer
      );

      if (closedRef.current) {
        return;
      }

      socket.emit(
        'answerCall',
        {
          callerId: friend._id,
          answer
        }
      );

      setStatus('calling');

    } catch (err) {
      console.error(
        'answerCall error:',
        err
      );

      if (!closedRef.current) {
        setStatus('error');
      }
    }
  };

  const declineCall = () => {
    socket.emit(
      'endCall',
      {
        receiverId: friend._id
      }
    );

    cleanup();
    onClose();
  };

  const hangUp = () => {
    socket.emit(
      'endCall',
      {
        receiverId: friend._id
      }
    );

    cleanup();
    onClose();
  };

  const toggleMute = () => {
    if (
      !localStreamRef.current
    ) {
      return;
    }

    localStreamRef.current
      .getAudioTracks()
      .forEach(track => {
        track.enabled =
          !track.enabled;
      });

    setMuted(prev => !prev);
  };

  useEffect(() => {
    closedRef.current = false;

    /*
     * Réponse à l'offer initiale.
     */
    const handleCallAnswered =
      async ({ answer }) => {
        const peer =
          peerRef.current;

        if (
          !peer ||
          closedRef.current
        ) {
          return;
        }

        try {
          await peer.setRemoteDescription(
            new RTCSessionDescription(
              answer
            )
          );

          /*
           * Les candidates reçues avant
           * l'answer sont maintenant valides.
           */
          await addPendingCandidates(
            peer
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
        if (
          !candidate ||
          closedRef.current
        ) {
          return;
        }

        const peer =
          peerRef.current;

        if (
          peer &&
          peer.remoteDescription
        ) {
          try {
            await peer.addIceCandidate(
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
     * Réception d'une nouvelle offer
     * déclenchée par un ICE restart.
     */
    const handleIceRestartOffer =
      async ({ offer }) => {
        const peer =
          peerRef.current;

        if (
          !peer ||
          closedRef.current
        ) {
          return;
        }

        try {
          console.log(
            '🔄 Réception d’une ICE restart offer'
          );

          await peer.setRemoteDescription(
            new RTCSessionDescription(
              offer
            )
          );

          /*
           * IMPORTANT :
           * les candidates reçues avant cette
           * nouvelle offer sont maintenant
           * ajoutées.
           */
          await addPendingCandidates(
            peer
          );

          const answer =
            await peer.createAnswer();

          await peer.setLocalDescription(
            answer
          );

          if (closedRef.current) {
            return;
          }

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
     * Réception de la réponse à notre
     * ICE restart.
     */
    const handleIceRestartAnswer =
      async ({ answer }) => {
        const peer =
          peerRef.current;

        if (
          !peer ||
          closedRef.current
        ) {
          return;
        }

        try {
          console.log(
            '🔄 Réception de la réponse ICE restart'
          );

          await peer.setRemoteDescription(
            new RTCSessionDescription(
              answer
            )
          );

          /*
           * Les candidates éventuellement
           * reçues avant la réponse peuvent
           * maintenant être appliquées.
           */
          await addPendingCandidates(
            peer
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
      if (!closedRef.current) {
        setStatus('failed');
      }
    };

    /*
     * IMPORTANT :
     * On installe les listeners AVANT de
     * lancer startCall().
     */
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

    /*
     * Appel sortant.
     */
    if (
      !incomingOffer &&
      !hasInitiatedRef.current
    ) {
      hasInitiatedRef.current = true;

      isCallerRef.current = true;

      startCall();
    }

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