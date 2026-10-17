import { useEffect, useRef, useState } from 'react';
import socket from '../socket';
import { API_URL } from '../utils/api';

const POSITION_STORAGE_KEY = 'propard_voice_call_position';

const getIceServers = async (token) => {
  const endpoint = `${API_URL}/api/turn-credentials`;

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
  incomingOffer,
  videoCall = false
}) {
  const [status, setStatus] = useState(
    incomingOffer ? 'incoming' : 'calling'
  );

  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(videoCall);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareSettingsOpen, setScreenShareSettingsOpen] = useState(false);
  const [screenShareError, setScreenShareError] = useState('');
  const [screenShareSettings, setScreenShareSettings] = useState({ width: 2560, height: 1440, fps: 60, automatic: true, audio: true });
  const screenShareSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);
  const [remoteVideoAvailable, setRemoteVideoAvailable] = useState(false);

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
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const screenShareRef = useRef(null);
  const timerRef = useRef(null);

  const hasInitiatedRef = useRef(false);
  const pendingCandidates = useRef([]);

  const timerStartedRef = useRef(false);
  const callStartedAtRef = useRef(null);

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

    if (screenShareRef.current) {
      screenShareRef.current.stream.getTracks().forEach(track => track.stop());
      screenShareRef.current.audioContext?.close().catch(() => {});
      screenShareRef.current = null;
    }

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

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    remoteStreamRef.current = null;

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
          offer,
          videoCall
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

    if (!videoCall && typeof peer.addTransceiver === 'function') {
      peer.addTransceiver('video', { direction: 'sendrecv' });
    }

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

      let stream = e.streams?.[0] || remoteStreamRef.current;
      if (!stream) stream = new MediaStream();
      if (e.track && !stream.getTracks().some(track => track.id === e.track.id)) stream.addTrack(e.track);
      if (e.track?.kind === 'video') {
        const refreshVideoAvailability = () => {
          setRemoteVideoAvailable(
            Boolean(remoteStreamRef.current?.getVideoTracks().some(track => !track.muted && track.readyState === 'live')) ||
            Boolean(!remoteStreamRef.current && !e.track.muted && e.track.readyState === 'live')
          );
        };
        e.track.addEventListener('unmute', refreshVideoAvailability);
        e.track.addEventListener('mute', refreshVideoAvailability);
        e.track.addEventListener('ended', refreshVideoAvailability);
        refreshVideoAvailability();
      }

      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
        remoteAudioRef.current.playsInline = true;
      }

      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play().catch(err =>
        console.error('Impossible de lire le flux audio distant:', err)
      );

      remoteStreamRef.current = stream;

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(err =>
          console.error('Impossible de lire le flux vidéo distant:', err)
        );
      }
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

          startTimer(callStartedAtRef.current);

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

  useEffect(() => {
    if (!videoCall) {
      return;
    }

    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(err =>
        console.error('Impossible de lire le flux vidéo local:', err)
      );
    }

    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(err =>
        console.error('Impossible de lire le flux vidéo distant:', err)
      );
    }
  }, [videoCall, status]);

  const startCall = async () => {
    try {
      const stream =
        await navigator.mediaDevices
          .getUserMedia({
          audio: true,
          video: videoCall
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

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

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
          offer,
          videoCall
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
          audio: true,
          video: videoCall
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

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

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

      const storedIceCandidates = Array.isArray(
        incomingOffer?.iceCandidates
      )
        ? incomingOffer.iceCandidates
        : [];

      pendingCandidates.current.push(
        ...storedIceCandidates
      );

      await peer.setRemoteDescription(
        new RTCSessionDescription(
          incomingOffer?.offer || incomingOffer
        )
      );

      if (incomingOffer?.callStartedAt) {
        callStartedAtRef.current = Number(incomingOffer.callStartedAt);
      }

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

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const tracks = stream.getVideoTracks();
    if (!tracks.length) return;

    const nextEnabled = !cameraEnabled;
    tracks.forEach(track => {
      track.enabled = nextEnabled;
    });

    setCameraEnabled(nextEnabled);
  };

  const setScreenAudioEnabled = enabled => {
    setScreenShareSettings(previous => ({ ...previous, audio: enabled }));
    const share = screenShareRef.current;
    if (!share?.screenAudioSource || !share.audioDestination) return;
    try {
      if (enabled) share.screenAudioSource.connect(share.audioDestination);
      else share.screenAudioSource.disconnect();
    } catch (err) {
      console.error('Impossible de modifier l’audio du partage:', err);
    }
  };

  const stopScreenShare = async () => {
    const share = screenShareRef.current;
    if (!share) return;

    screenShareRef.current = null;
    share.stream.getTracks().forEach(track => track.stop());
    share.audioContext?.close().catch(() => {});

    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
    const microphoneTrack = localStreamRef.current?.getAudioTracks()[0] || null;
    const peer = peerRef.current;

    if (peer) {
      const videoSender = peer.getSenders().find(sender => sender.track?.kind === 'video') ||
        peer.getTransceivers().find(transceiver => transceiver.receiver?.track?.kind === 'video')?.sender;
      const audioSender = peer.getSenders().find(sender => sender.track?.kind === 'audio') ||
        peer.getTransceivers().find(transceiver => transceiver.receiver?.track?.kind === 'audio')?.sender;

      try { if (videoSender) await videoSender.replaceTrack(cameraTrack); } catch (err) { console.error('Restauration vidéo impossible:', err); }
      try { if (audioSender && microphoneTrack) await audioSender.replaceTrack(microphoneTrack); } catch (err) { console.error('Restauration audio impossible:', err); }
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play?.().catch(() => {});
    }

    setIsScreenSharing(false);
    setScreenShareError('');
  };

  const startScreenShare = async () => {
    setScreenShareError('');

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError('Le partage d’écran n’est pas pris en charge par ce navigateur ou cet appareil.');
      return;
    }

    const peer = peerRef.current;
    if (!peer || peer.connectionState === 'closed') {
      setScreenShareError('La connexion n’est pas prête pour le partage d’écran.');
      return;
    }

    let stream;
    let audioContext;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('Aucune vidéo capturée.');

      try {
        await videoTrack.applyConstraints({
          width: { ideal: Number(screenShareSettings.width) },
          height: { ideal: Number(screenShareSettings.height) },
          frameRate: screenShareSettings.automatic
            ? { ideal: Number(screenShareSettings.fps) }
            : { ideal: Number(screenShareSettings.fps), max: Number(screenShareSettings.fps) }
        });
      } catch (constraintError) {
        console.warn('Le navigateur n’a pas accepté tous les paramètres demandés:', constraintError);
      }

      const videoSender = peer.getSenders().find(sender => sender.track?.kind === 'video') ||
        peer.getTransceivers().find(transceiver => transceiver.receiver?.track?.kind === 'video')?.sender;
      if (!videoSender) throw new Error('Ce navigateur ne permet pas d’ajouter la vidéo à cet appel.');
      await videoSender.replaceTrack(videoTrack);

      const screenAudioTrack = stream.getAudioTracks()[0];
      const microphoneTrack = localStreamRef.current?.getAudioTracks()[0];
      let mixedAudioTrack = null;
      let screenAudioSource = null;
      let audioDestination = null;

      if (screenAudioTrack && microphoneTrack) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioContext = new AudioContextClass();
          await audioContext.resume();
          audioDestination = audioContext.createMediaStreamDestination();
          const micSource = audioContext.createMediaStreamSource(new MediaStream([microphoneTrack]));
          screenAudioSource = audioContext.createMediaStreamSource(new MediaStream([screenAudioTrack]));
          micSource.connect(audioDestination);
          if (screenShareSettings.audio) screenAudioSource.connect(audioDestination);
          mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];

          const audioSender = peer.getSenders().find(sender => sender.track?.kind === 'audio') ||
            peer.getTransceivers().find(transceiver => transceiver.receiver?.track?.kind === 'audio')?.sender;
          if (audioSender && mixedAudioTrack) await audioSender.replaceTrack(mixedAudioTrack);
        }
      }

      screenShareRef.current = { stream, audioContext, mixedAudioTrack, screenAudioSource, audioDestination };
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play?.().catch(() => {});
      }
      videoTrack.onended = () => { void stopScreenShare(); };
      setIsScreenSharing(true);
      setScreenShareSettingsOpen(false);
    } catch (err) {
      stream?.getTracks().forEach(track => track.stop());
      audioContext?.close().catch(() => {});
      console.error('Partage d’écran impossible:', err);
      setScreenShareError(
        err?.name === 'NotAllowedError'
          ? 'Partage annulé ou autorisation refusée.'
          : (err?.message || 'Impossible de démarrer le partage d’écran.')
      );
    }
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
      async ({ answer, callStartedAt }) => {
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

          if (callStartedAt) {
            callStartedAtRef.current = Number(callStartedAt);
          }

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
                '❌ Caméra ou micro inaccessible'}
            </p>
          </div>
        </div>

        {(videoCall || isScreenSharing || remoteVideoAvailable) && (status === 'connected' || status === 'calling') && (
          <div style={styles.videoArea}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={styles.localVideo}
            />
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={styles.remoteVideo}
            />
          </div>
        )}

        {screenShareSettingsOpen && status === 'connected' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px 0', color: 'var(--text-primary)', fontSize: '12px' }}>
            <label>Largeur (px)<input type="number" min="320" max="7680" step="1" value={screenShareSettings.width} onChange={event => setScreenShareSettings(prev => ({ ...prev, width: Math.max(320, Math.min(7680, Number(event.target.value) || 320)) }))} style={styles.settingInput} /></label>
            <label>Hauteur (px)<input type="number" min="240" max="4320" step="1" value={screenShareSettings.height} onChange={event => setScreenShareSettings(prev => ({ ...prev, height: Math.max(240, Math.min(4320, Number(event.target.value) || 240)) }))} style={styles.settingInput} /></label>
            <label>FPS<input type="number" min="1" max="120" value={screenShareSettings.fps} onChange={event => setScreenShareSettings(prev => ({ ...prev, fps: Math.max(1, Math.min(120, Number(event.target.value) || 1)) }))} style={styles.settingInput} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="checkbox" checked={screenShareSettings.automatic} onChange={event => setScreenShareSettings(prev => ({ ...prev, automatic: event.target.checked }))} /> Qualité automatique</label>
            <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '6px' }}><input type="checkbox" checked={screenShareSettings.audio} onChange={event => setScreenAudioEnabled(event.target.checked)} /> Inclure l’audio du partage (si disponible)</label>
            <span style={{ gridColumn: '1 / -1', color: 'var(--text-secondary)' }}>Les paramètres sont des objectifs : le navigateur, l’appareil et la connexion peuvent limiter la qualité réelle.</span>
          </div>
        )}
        {screenShareError && <p role="status" style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0' }}>{screenShareError}</p>}

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
                <>
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
                  <>
                      <button
                        style={{ ...styles.muteBtn, background: isScreenSharing ? 'var(--success)' : 'var(--bg-hover)' }}
                        onClick={() => isScreenSharing ? void stopScreenShare() : void startScreenShare()}
                        aria-label={isScreenSharing ? 'Arrêter le partage d’écran' : 'Partager l’écran'}
                        title={isScreenSharing ? 'Arrêter le partage d’écran' : 'Partager l’écran'}
                      >
                        {isScreenSharing ? '⏹️' : '🖥️'}
                      </button>
                      <button
                        style={{ ...styles.muteBtn, background: screenShareSettingsOpen ? 'var(--accent-glow)' : 'var(--bg-hover)' }}
                        onClick={() => setScreenShareSettingsOpen(value => !value)}
                        aria-label="Paramètres du partage d’écran"
                        title="Paramètres du partage d’écran"
                      >
                        ⚙️
                      </button>
                    </>
                  {videoCall && (
                    <button
                      style={{
                        ...styles.muteBtn,
                        background: cameraEnabled
                          ? 'var(--bg-hover)'
                          : 'var(--danger)'
                      }}
                      onClick={toggleCamera}
                      aria-label={cameraEnabled ? 'Couper la caméra' : 'Réactiver la caméra'}
                    >
                      {cameraEnabled ? '📹' : '🚫'}
                    </button>
                  )}
                </>
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

  videoArea: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#000'
  },

  localVideo: {
    position: 'absolute',
    right: '8px',
    bottom: '8px',
    width: '92px',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '2px solid rgba(255,255,255,0.75)',
    background: '#111',
    zIndex: 2
  },

  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: '#111'
  },

  settingInput: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    marginTop: '4px',
    padding: '6px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)'
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