import { useEffect, useRef, useState } from 'react';
import socket from '../socket';

const POSITION_STORAGE_KEY = 'propard_voice_call_position';

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

  /*
   * Position de la fenêtre flottante.
   *
   * left/top sont utilisés plutôt que right/bottom
   * afin que le déplacement soit simple à calculer.
   */
  const [windowPosition, setWindowPosition] = useState(null);

  const [isDragging, setIsDragging] = useState(false);

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const timerRef = useRef(null);

  const hasInitiatedRef = useRef(false);
  const pendingCandidates = useRef([]);

  const timerStartedRef = useRef(false);

  const iceServersRef = useRef([]);
  const turnServersRef = useRef([]);
  const currentTurnIndexRef = useRef(0);

  const restartingIceRef = useRef(false);
  const restartAttemptsRef = useRef(0);

  const isCallerRef = useRef(!incomingOffer);

  const closedRef = useRef(false);
  const disconnectedTimerRef = useRef(null);

  /*
   * Référence vers la fenêtre flottante.
   */
  const cardRef = useRef(null);

  /*
   * Informations utilisées pendant le drag.
   */
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0
  });

  const friendName =
    friend?.nickname?.trim() ||
    friend?.displayName?.trim() ||
    friend?.username ||
    'Appel inconnu';

  /*
   * --------------------------------------------------
   * POSITION DE LA FENÊTRE
   * --------------------------------------------------
   */

  const clampWindowPosition = (
    left,
    top
  ) => {
    const card =
      cardRef.current;

    const width =
      card?.offsetWidth || 300;

    const height =
      card?.offsetHeight || 150;

    const margin = 10;

    const maxLeft =
      Math.max(
        margin,
        window.innerWidth -
          width -
          margin
      );

    const maxTop =
      Math.max(
        margin,
        window.innerHeight -
          height -
          margin
      );

    return {
      x: Math.min(
        Math.max(left, margin),
        maxLeft
      ),
      y: Math.min(
        Math.max(top, margin),
        maxTop
      )
    };
  };

  const saveWindowPosition = position => {
    try {
      localStorage.setItem(
        POSITION_STORAGE_KEY,
        JSON.stringify(position)
      );
    } catch (err) {
      console.error(
        'Impossible de sauvegarder la position de la fenêtre:',
        err
      );
    }
  };

  const loadWindowPosition = () => {
    try {
      const saved =
        localStorage.getItem(
          POSITION_STORAGE_KEY
        );

      if (!saved) {
        return null;
      }

      const parsed =
        JSON.parse(saved);

      if (
        typeof parsed?.x !== 'number' ||
        typeof parsed?.y !== 'number'
      ) {
        return null;
      }

      return parsed;

    } catch (err) {
      console.error(
        'Impossible de charger la position de la fenêtre:',
        err
      );

      return null;
    }
  };

  /*
   * Initialise la fenêtre.
   *
   * Si une position précédente existe,
   * elle est restaurée.
   *
   * Sinon :
   * → en bas à droite.
   */
  useEffect(() => {
    const savedPosition =
      loadWindowPosition();

    if (savedPosition) {
      setWindowPosition(
        clampWindowPosition(
          savedPosition.x,
          savedPosition.y
        )
      );

      return;
    }

    const card =
      cardRef.current;

    const width =
      card?.offsetWidth || 300;

    const height =
      card?.offsetHeight || 150;

    const margin = 20;

    const defaultPosition = {
      x:
        window.innerWidth -
        width -
        margin,

      y:
        window.innerHeight -
        height -
        margin
    };

    setWindowPosition(
      clampWindowPosition(
        defaultPosition.x,
        defaultPosition.y
      )
    );
  }, []);

  /*
   * Si la fenêtre est redimensionnée,
   * on empêche la fenêtre de sortir de l'écran.
   */
  useEffect(() => {
    const handleResize = () => {
      setWindowPosition(prev => {
        if (!prev) {
          return prev;
        }

        const next =
          clampWindowPosition(
            prev.x,
            prev.y
          );

        saveWindowPosition(next);

        return next;
      });
    };

    window.addEventListener(
      'resize',
      handleResize
    );

    return () => {
      window.removeEventListener(
        'resize',
        handleResize
      );
    };
  }, []);

  /*
   * Début du déplacement.
   *
   * Pointer Events = souris + tactile.
   */
  const handleDragStart = event => {
    /*
     * On ne démarre pas le drag avec un bouton.
     */
    if (
      event.target.closest?.('button')
    ) {
      return;
    }

    if (!cardRef.current) {
      return;
    }

    if (!windowPosition) {
      return;
    }

    /*
     * On accepte :
     * - souris
     * - doigt
     * - stylet
     */
    if (
      event.pointerType !== 'mouse' &&
      event.pointerType !== 'touch' &&
      event.pointerType !== 'pen'
    ) {
      return;
    }

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
      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Certains navigateurs peuvent ne pas
      // supporter setPointerCapture.
    }
  };

  /*
   * Déplacement de la fenêtre.
   */
  const handleDragMove = event => {
    const drag =
      dragRef.current;

    if (
      !drag.active ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    const deltaX =
      event.clientX -
      drag.startX;

    const deltaY =
      event.clientY -
      drag.startY;

    const newPosition =
      clampWindowPosition(
        drag.startLeft + deltaX,
        drag.startTop + deltaY
      );

    setWindowPosition(
      newPosition
    );
  };

  /*
   * Fin du déplacement.
   */
  const handleDragEnd = event => {
    const drag =
      dragRef.current;

    if (
      !drag.active ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }

    dragRef.current.active =
      false;

    setIsDragging(false);

    /*
     * Sauvegarde immédiatement la nouvelle
     * position.
     */
    setWindowPosition(current => {
      if (current) {
        saveWindowPosition(current);
      }

      return current;
    });

    try {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // Rien à faire si le navigateur
      // ne permet pas releasePointerCapture.
    }
  };

  /*
   * --------------------------------------------------
   * WEBRTC
   * --------------------------------------------------
   */

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
        .forEach(track =>
          track.stop()
        );

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

    /*
     * IMPORTANT :
     * On ne supprime PAS windowPosition.
     *
     * Elle est volontairement conservée dans
     * localStorage pour le prochain appel.
     */
  };

  const getTurnServers = () => {
    return turnServersRef.current;
  };

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

      if (localCandidate.url) {
        return localCandidate.url;
      }

      return null;

    } catch (err) {
      console.error(
        'Impossible de déterminer le TURN actif:',
        err
      );

      return null;
    }
  };

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

          return url === turnUrl;
        });

      if (found) {
        return i;
      }
    }

    return -1;
  };

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

  const switchToNextTurnServer = async () => {
    const peer =
      peerRef.current;

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

      peer.restartIce();

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

          restartAttemptsRef.current = 0;

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

                if (
                  peer.iceConnectionState !==
                  'disconnected'
                ) {
                  return;
                }

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

  /*
   * Style dynamique de la fenêtre.
   */
  const containerStyle = {
    ...styles.container,

    ...(windowPosition
      ? {
          left: `${windowPosition.x}px`,
          top: `${windowPosition.y}px`,
          right: 'auto',
          bottom: 'auto'
        }
      : {
          right: '20px',
          bottom: '20px'
        })
  };

  return (
    <div style={containerStyle}>
      <div
        ref={cardRef}
        style={{
          ...styles.card,
          cursor: isDragging
            ? 'grabbing'
            : 'default',
          userSelect: isDragging
            ? 'none'
            : 'auto'
        }}
      >

        {/*
         * Zone de déplacement.
         *
         * Le header/identité peut être glissé
         * avec la souris ou le doigt.
         */}
        <div
          style={styles.identity}
          onPointerDown={
            handleDragStart
          }
          onPointerMove={
            handleDragMove
          }
          onPointerUp={
            handleDragEnd
          }
          onPointerCancel={
            handleDragEnd
          }
        >
          <div style={styles.avatar}>
            {friend?.avatar ? (
              <img
                src={friend.avatar}
                alt=""
                style={styles.avatarImage}
                draggable="false"
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

  /*
   * Zone de déplacement.
   *
   * touchAction: none empêche le navigateur
   * de faire défiler la page pendant qu'on
   * déplace la fenêtre avec le doigt.
   */
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
    background:
      'var(--accent-glow)',
    border:
      '2px solid var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: '700',
    color:
      'var(--accent)',
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
      'var(--text-secondary)',
    pointerEvents: 'none'
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
    cursor: 'pointer',
    touchAction: 'manipulation'
  },

  hangupBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background:
      'var(--danger)',
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