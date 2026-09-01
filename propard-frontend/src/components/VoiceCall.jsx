import { useEffect, useRef, useState } from 'react';
import socket from '../socket';

const getIceServers = async (token) => {
  const endpoint = '/api/turn-credentials';

  try {
    const res = await fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const contentType = res.headers.get('content-type') || '';
    const raw = await res.text();

    if (!res.ok) {
      throw new Error(`turn-credentials fetch failed (status ${res.status}): ${raw.slice(0, 200)}`);
    }

    if (!contentType.includes('application/json')) {
      throw new Error(`Réponse non-JSON reçue depuis ${endpoint} (content-type: ${contentType}). Début du corps: ${raw.slice(0, 200)}`);
    }

    const data = JSON.parse(raw);
    // Metered retourne directement un tableau d'iceServers
    const iceServers = Array.isArray(data) ? data : (data.iceServers || data);
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        ...iceServers
      ]
    };
  } catch (err) {
    console.error(`Repli sur STUN seul (endpoint appelé: ${endpoint}):`, err);
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }
};

export default function VoiceCall({ friend, userId, token, onClose, incomingOffer }) {
  const [status, setStatus] = useState(incomingOffer ? 'incoming' : 'calling');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const timerRef = useRef(null);
  const hasInitiatedRef = useRef(false);
  const pendingCandidates = useRef([]);

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
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  const createPeer = async () => {
    const config = await getIceServers(token);
    const peer = new RTCPeerConnection(config);

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('iceCandidate', { receiverId: friend._id, candidate: e.candidate });
      }
    };

    peer.ontrack = (e) => {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
      }
      remoteAudioRef.current.srcObject = e.streams[0];
      remoteAudioRef.current.play().catch(console.error);
    };

    peer.oniceconnectionstatechange = () => {
      console.log('ICE state:', peer.iceConnectionState);
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
        setStatus('connected');
        startTimer();
      }
      if (peer.iceConnectionState === 'failed') {
        setStatus('failed');
      }
    };

    return peer;
  };

  const addPendingCandidates = async (peer) => {
    for (const candidate of pendingCandidates.current) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) { console.error('candidate error:', err); }
    }
    pendingCandidates.current = [];
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peer = await createPeer();
      peerRef.current = peer;

      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket.emit('callUser', { receiverId: friend._id, offer });

    } catch (err) {
      console.error('startCall error:', err);
      setStatus('error');
    }
  };

  const answerCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peer = await createPeer();
      peerRef.current = peer;

      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      await peer.setRemoteDescription(new RTCSessionDescription(incomingOffer));

      // Ajoute les candidates reçus avant la remote description
      await addPendingCandidates(peer);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit('answerCall', { callerId: friend._id, answer });

    } catch (err) {
      console.error('answerCall error:', err);
      setStatus('error');
    }
  };

  const declineCall = () => {
    socket.emit('endCall', { receiverId: friend._id });
    cleanup();
    onClose();
  };

  const hangUp = () => {
    socket.emit('endCall', { receiverId: friend._id });
    cleanup();
    onClose();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setMuted(prev => !prev);
    }
  };

  useEffect(() => {
    if (!incomingOffer && !hasInitiatedRef.current) {
      hasInitiatedRef.current = true;
      startCall();
    }

    const handleCallAnswered = async ({ answer }) => {
      if (!peerRef.current) return;
      try {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        await addPendingCandidates(peerRef.current);
      } catch (err) { console.error('callAnswered error:', err); }
    };

    const handleIceCandidate = async ({ candidate }) => {
      if (!candidate) return;
      if (peerRef.current && peerRef.current.remoteDescription) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) { console.error('iceCandidate error:', err); }
      } else {
        // Remote description pas encore set, on met en attente
        pendingCandidates.current.push(candidate);
      }
    };

    const handleCallEnded = () => {
      cleanup();
      onClose();
    };

    const handleCallFailed = () => {
      setStatus('failed');
      cleanup();
    };

    socket.on('callAnswered', handleCallAnswered);
    socket.on('iceCandidate', handleIceCandidate);
    socket.on('callEnded', handleCallEnded);
    socket.on('callFailed', handleCallFailed);

    return () => {
      socket.off('callAnswered', handleCallAnswered);
      socket.off('iceCandidate', handleIceCandidate);
      socket.off('callEnded', handleCallEnded);
      socket.off('callFailed', handleCallFailed);
      cleanup();
    };
  }, []);

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.avatar}>
          {friend?.username ? friend.username[0].toUpperCase() : '?'}
        </div>

        <p style={styles.name}>{friend?.username || 'Appel inconnu'}</p>

        <p style={styles.status}>
          {status === 'calling' && '📞 Appel en cours...'}
          {status === 'incoming' && '📲 Appel entrant'}
          {status === 'connected' && `🔊 ${formatDuration(duration)}`}
          {status === 'failed' && '❌ Appel échoué'}
          {status === 'error' && '❌ Micro inaccessible'}
        </p>

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
