import { useEffect, useRef, useState } from 'react';
import socket from '../socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export default function VoiceCall({ friend, userId, onClose, incomingOffer }) {
  const [status, setStatus] = useState(incomingOffer ? 'incoming' : 'calling');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);

  // Démarre le timer quand l'appel est connecté
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  };

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const cleanup = () => {
    clearInterval(timerRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (peerRef.current) {
      peerRef.current.close();
    }
  };

  const hangUp = () => {
    socket.emit('endCall', { receiverId: friend._id });
    cleanup();
    onClose();
  };

  // ─── Initier un appel ────────────────────────────────────────────────────
  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peer = new RTCPeerConnection(ICE_SERVERS);
      peerRef.current = peer;

      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      peer.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('iceCandidate', { receiverId: friend._id, candidate: e.candidate });
        }
      };

      peer.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play();
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket.emit('callUser', { receiverId: friend._id, offer });
      setStatus('calling');

    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  // ─── Accepter un appel entrant ───────────────────────────────────────────
  const answerCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peer = new RTCPeerConnection(ICE_SERVERS);
      peerRef.current = peer;

      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      peer.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('iceCandidate', { receiverId: friend._id, candidate: e.candidate });
        }
      };

      peer.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play();
      };

      await peer.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit('answerCall', { callerId: friend._id, answer });
      setStatus('connected');
      startTimer();

    } catch (err) {
      console.error(err);
    }
  };

  const declineCall = () => {
    socket.emit('endCall', { receiverId: friend._id });
    onClose();
  };

  // ─── Écoute les événements Socket.io ────────────────────────────────────
  useEffect(() => {
    if (!incomingOffer) startCall();

    socket.on('callAnswered', async ({ answer }) => {
      await peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
      setStatus('connected');
      startTimer();
    });

    socket.on('iceCandidate', async ({ candidate }) => {
      try {
        await peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) { console.error(err); }
    });

    socket.on('callEnded', () => {
      cleanup();
      onClose();
    });

    socket.on('callFailed', () => {
      setStatus('failed');
      cleanup();
    });

    return () => {
      socket.off('callAnswered');
      socket.off('iceCandidate');
      socket.off('callEnded');
      socket.off('callFailed');
    };
  }, []);

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setMuted(!muted);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Avatar */}
        <div style={styles.avatar}>
          {friend.username[0].toUpperCase()}
        </div>

        <p style={styles.name}>{friend.username}</p>

        {/* Statut */}
        <p style={styles.status}>
          {status === 'calling' && '📞 Appel en cours...'}
          {status === 'incoming' && '📲 Appel entrant'}
          {status === 'connected' && `🔊 ${formatDuration(duration)}`}
          {status === 'failed' && '❌ Appel échoué'}
          {status === 'error' && '❌ Micro inaccessible'}
        </p>

        {/* Boutons */}
        <div style={styles.buttons}>
          {status === 'incoming' ? (
            <>
              <button style={styles.acceptBtn} onClick={answerCall}>📞</button>
              <button style={styles.hangupBtn} onClick={declineCall}>📵</button>
            </>
          ) : (
            <>
              {status === 'connected' && (
                <button
                  style={{ ...styles.muteBtn, background: muted ? 'var(--danger)' : 'var(--bg-hover)' }}
                  onClick={toggleMute}
                >
                  {muted ? '🔇' : '🎤'}
                </button>
              )}
              <button style={styles.hangupBtn} onClick={hangUp}>📵</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 },
  card: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '40px 32px', textAlign: 'center', width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' },
  avatar: { width: '72px', height: '72px', borderRadius: '50%', background: 'var(--accent-glow)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '700', color: 'var(--accent)' },
  name: { fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' },
  status: { fontSize: '14px', color: 'var(--text-secondary)' },
  buttons: { display: 'flex', gap: '16px', marginTop: '8px' },
  acceptBtn: { width: '56px', height: '56px', borderRadius: '50%', background: 'var(--success)', border: 'none', fontSize: '24px', cursor: 'pointer' },
  hangupBtn: { width: '56px', height: '56px', borderRadius: '50%', background: 'var(--danger)', border: 'none', fontSize: '24px', cursor: 'pointer' },
  muteBtn: { width: '56px', height: '56px', borderRadius: '50%', border: 'none', fontSize: '24px', cursor: 'pointer' }
};
