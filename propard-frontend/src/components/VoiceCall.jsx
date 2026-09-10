import { useEffect, useRef, useState } from 'react';
import socket from '../socket';

const getIceServers = async (token) => {
  const endpoint = '/api/turn-credentials';

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
        `turn-credentials fetch failed (status ${res.status}): ${raw.slice(0, 200)}`
      );
    }

    if (!contentType.includes('application/json')) {
      throw new Error(
        `Réponse non-JSON reçue depuis ${endpoint}`
      );
    }

    const data = JSON.parse(raw);

    const iceServers = Array.isArray(data)
      ? data
      : (data.iceServers || data);

    return {
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302'
        },
        {
          urls: 'stun:stun1.l.google.com:19302'
        },
        ...iceServers
      ]
    };
  } catch (err) {
    console.error(
      'Repli sur STUN seul:',
      err
    );

    return {
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302'
        },
        {
          urls: 'stun:stun1.l.google.com:19302'
        }
      ]
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
  };

  const createPeer = async () => {
    const config = await getIceServers(token);

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

    peer.oniceconnectionstatechange = () => {
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
      }

      if (
        peer.iceConnectionState ===
        'failed'
      ) {
        setStatus('failed');
      }

      if (
        peer.iceConnectionState ===
        'disconnected'
      ) {
        console.log(
          'Connexion WebRTC temporairement interrompue'
        );
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
      startCall();
    }

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