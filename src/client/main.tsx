import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import { modeLabel } from '../shared/modes';
import type {
  Card as CardT,
  ClientToServerEvents,
  CustomModeName,
  HandPublic,
  LegalActions,
  PlayerPublic,
  PrivateState,
  RoomPublicState,
  RoomSettings,
  ServerSnapshot,
  ServerToClientEvents,
  Suit
} from '../shared/types';
import './styles.css';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Screen = 'landing' | 'create' | 'join' | 'room';
type Tab = 'table' | 'lobby' | 'settings' | 'audit';

interface StoredSession {
  code: string;
  playerId: string;
  sessionToken: string;
}

const socket: AppSocket = io('/', { autoConnect: true, transports: ['websocket', 'polling'] });
const storageKey = 'feltline-session';
const MODE_KEYS: CustomModeName[] = ['holdem', 'omaha4', 'bomb_pot', 'show_one', 'seven_two'];

/* ---------------- Icons ---------------- */
const ICON_PATHS: Record<string, string> = {
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  crown: '<path d="M2 6l4 4 6-7 6 7 4-4-2 13H4L2 6z"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9a2.7 2.7 0 0 0-2.8-1.8c-1.6 0-2.8.9-2.8 2.1 0 2.8 5.6 1.4 5.6 4.2 0 1.2-1.2 2.1-2.8 2.1A2.7 2.7 0 0 1 9 15.9M12 6v1.2M12 16.8V18"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  spade: '<path d="M12 2C9 6 4 9 4 13a4 4 0 0 0 6.5 3.1C10 18 9 19.5 8 21h8c-1-1.5-2-3-2.5-4.9A4 4 0 0 0 20 13c0-4-5-7-8-11z"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  swap: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'
};
function Icon({ name, size = 18, className = '', strokeWidth = 2 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ic ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] ?? '' }}
    />
  );
}

/* ---------------- Cards ---------------- */
const SUIT_SYM: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
function Card({ card, size = '', mine = false, dealIn = false }: { card: CardT | null; size?: string; mine?: boolean; dealIn?: boolean }) {
  if (!card) return <div className={`card empty ${size}`.trim()} />;
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1] as Suit;
  const red = suit === 'h' || suit === 'd';
  return (
    <div className={`card ${red ? 'red' : 'black'} ${size} ${mine ? 'mine' : ''} ${dealIn ? 'deal-in' : ''}`.replace(/\s+/g, ' ').trim()}>
      <span className="corner">{rank}{SUIT_SYM[suit]}</span>
      <span className="pip-suit">{SUIT_SYM[suit]}</span>
    </div>
  );
}
function CardBack({ size = '' }: { size?: string }) {
  return <div className={`card back ${size}`.trim()} />;
}

/* ---------------- Seat pod ---------------- */
function seatEllipsePos(seat: number, seats: number): { left: string; top: string } {
  const theta = Math.PI / 2 + (seat * 2 * Math.PI) / Math.max(seats, 2);
  const left = 50 + 42 * Math.cos(theta);
  const top = 50 + 37 * Math.sin(theta);
  return { left: `${left}%`, top: `${top}%` };
}

function SeatPod({
  player,
  hand,
  meId,
  myHoleCards,
  maxSeats
}: {
  player: PlayerPublic;
  hand: HandPublic | null;
  meId?: string;
  myHoleCards: CardT[];
  maxSeats: number;
}) {
  const active = Boolean(hand) && hand!.currentTurnSeat === player.seat;
  const isMe = player.id === meId;
  const tags: Array<{ t: string; c: string }> = [];
  if (hand) {
    if (hand.buttonSeat === player.seat) tags.push({ t: 'BTN', c: 'btn' });
    if (hand.smallBlindSeat === player.seat) tags.push({ t: 'SB', c: '' });
    if (hand.bigBlindSeat === player.seat) tags.push({ t: 'BB', c: '' });
    if (hand.straddleSeat === player.seat) tags.push({ t: 'STR', c: '' });
    if (hand.lastAggressorSeat === player.seat && hand.currentBet > 0) tags.push({ t: 'BET', c: 'last' });
  }
  // Privacy: opponents' hole cards are never sent by the server — show backs.
  const handLive = Boolean(hand) && hand!.phase !== 'complete';
  const dealtIn = Boolean(hand) && !player.folded && player.status !== 'sitting_out' && player.status !== 'busted' && (handLive || player.allIn);
  const showMine = isMe && myHoleCards.length > 0;
  const cardCount = hand?.variant === 'omaha4' ? 4 : 2;
  const extraBadges = player.badges.filter((b) => b !== 'Host');

  return (
    <div
      className={`seat-pod ${active ? 'active' : ''} ${isMe ? 'me' : ''} ${player.folded ? 'folded' : ''} ${player.status === 'busted' ? 'busted' : ''}`.replace(/\s+/g, ' ').trim()}
      style={seatEllipsePos(player.seat ?? 0, maxSeats)}
    >
      {active && <span className="turn-ring" />}
      <div className="seat-pod-top">
        <span className="seat-name">
          {player.isHost && <Icon name="crown" size={13} className="host-ic" />}
          {player.name}{isMe ? ' (you)' : ''}
        </span>
        <span className="seat-status">{player.status === 'busted' ? 'busted' : player.folded ? 'folded' : player.allIn ? 'all-in' : player.status}</span>
      </div>
      <div className="seat-stack-row">
        <b>{player.stack.toLocaleString()}</b>
        <span className={`ud ${player.upDown >= 0 ? 'pos' : 'neg'}`}>{player.upDown >= 0 ? '+' : ''}{player.upDown}</span>
      </div>
      {(showMine || dealtIn) && (
        <div className="seat-cards">
          {showMine
            ? myHoleCards.map((c, i) => <Card key={c + i} card={c} size="sm" mine />)
            : Array.from({ length: cardCount }).map((_, i) => <CardBack key={i} size="sm" />)}
        </div>
      )}
      {(tags.length > 0 || extraBadges.length > 0) && (
        <div className="badge-row">
          {tags.map((t, i) => <span key={i} className={`seat-tag ${t.c}`.trim()}>{t.t}</span>)}
          {extraBadges.map((b) => <span key={b} className={`badge ${b === 'Chip request' ? 'req' : ''}`.trim()}>{b}</span>)}
        </div>
      )}
      {player.currentBet > 0 && <span className="seat-bet">{player.currentBet}</span>}
    </div>
  );
}

/* ---------------- Small fields ---------------- */
function NumberField({ label, value, onChange, min = 0, step = 1, disabled }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number; disabled?: boolean }) {
  return (
    <label>
      {label}
      <input type="number" value={value} min={min} step={step} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle-line">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* ---------------- App shell ---------------- */
function App() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null);
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState<'online' | 'reconnecting' | 'connecting'>(socket.connected ? 'online' : 'connecting');
  const [stored, setStored] = useState<StoredSession | null>(() => readStored());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4200);
  };

  useEffect(() => {
    const onSnapshot = (next: ServerSnapshot) => {
      setSnapshot(next);
      setScreen('room');
      const session = {
        code: next.publicState.code,
        playerId: next.privateState?.playerId ?? stored?.playerId ?? '',
        sessionToken: next.privateState?.sessionToken ?? stored?.sessionToken ?? ''
      };
      setStored(session);
      persist(session);
      if (session.code && new URLSearchParams(location.search).get('room') !== session.code) {
        history.replaceState(null, '', `?room=${session.code}`);
      }
    };
    const onConnect = () => setConnection('online');
    const onDisconnect = () => setConnection('reconnecting');
    socket.on('snapshot', onSnapshot);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('errorNotice', notify);
    return () => {
      socket.off('snapshot', onSnapshot);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('errorNotice', notify);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.playerId, stored?.sessionToken]);

  const reconnect = () => {
    if (!stored) return;
    send.joinRoom({ code: stored.code, name: 'Reconnecting', sessionToken: stored.sessionToken }, (result) => {
      if (!result.ok) notify(result.error);
    });
  };

  return (
    <main className="app-shell">
      <div className="noise" />
      {screen === 'landing' && <Landing onCreate={() => setScreen('create')} onJoin={() => setScreen('join')} stored={stored} reconnect={reconnect} />}
      {screen === 'create' && <CreateRoom back={() => setScreen('landing')} notify={notify} />}
      {screen === 'join' && <JoinRoom back={() => setScreen('landing')} notify={notify} stored={stored} />}
      {screen === 'room' && snapshot && <RoomView snapshot={snapshot} notify={notify} />}

      <div className={`connection ${connection}`}><span className="led" />{connection}</div>
      {notice && (
        <button className="notice" onClick={() => setNotice('')}>
          <Icon name="zap" size={15} /> {notice}
        </button>
      )}
    </main>
  );
}

/* ---------------- Entry screens ---------------- */
function Landing({ onCreate, onJoin, stored, reconnect }: { onCreate: () => void; onJoin: () => void; stored: StoredSession | null; reconnect: () => void }) {
  return (
    <section className="landing-screen">
      <div className="brand-wrap">
        <span className="brand-chip">Private Home Game · Play-Money</span>
        <h1 className="brand-mark">Feltline<span className="dot">.</span></h1>
        <p className="brand-tag">Spin up a felt for your friends in seconds. No accounts, no money — just the game.</p>
      </div>
      <div className="landing-actions" aria-label="Lobby actions">
        <button className="choice create" onClick={onCreate}>
          <Icon name="userPlus" size={36} />
          <span>Create Lobby</span>
        </button>
        <button className="choice join" onClick={onJoin}>
          <Icon name="login" size={36} />
          <span>Join Lobby</span>
        </button>
      </div>
      {stored && (
        <button className="ghost pill reconnect" onClick={reconnect}>
          <Icon name="refresh" size={17} /> Reconnect to {stored.code}
        </button>
      )}
      <p className="boundary">
        Feltline is for private, social, play-money poker only. There are no accounts, deposits, withdrawals,
        rake, marketplace chips, or real-money settlement. Rooms live in memory and disappear when the host ends the session.
      </p>
    </section>
  );
}

function CreateRoom({ back, notify }: { back: () => void; notify: (message: string) => void }) {
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('Friday Home Game');
  return (
    <section className="entry-panel">
      <button className="ghost back-btn" onClick={back}><Icon name="arrowLeft" size={16} /> Back</button>
      <div className="entry-head">
        <span className="eyebrow">New table</span>
        <h1>Create a lobby</h1>
      </div>
      <label>
        Your display name
        <input autoFocus value={name} maxLength={24} placeholder="Maya" onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Room name
        <input value={roomName} maxLength={24} placeholder="Friday Home Game" onChange={(e) => setRoomName(e.target.value)} />
      </label>
      <span className="field-hint">A short shareable room code is generated for you.</span>
      <button
        className="primary"
        onClick={() => send.createRoom({ name: name.trim() || 'You', roomName: roomName.trim() || 'Home Game' }, (result) => { if (!result.ok) notify(result.error); })}
      >
        <Icon name="play" size={17} /> Open lobby
      </button>
    </section>
  );
}

function JoinRoom({ back, notify, stored }: { back: () => void; notify: (message: string) => void; stored: StoredSession | null }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(stored?.code ?? '');
  const [spectator, setSpectator] = useState(false);
  return (
    <section className="entry-panel">
      <button className="ghost back-btn" onClick={back}><Icon name="arrowLeft" size={16} /> Back</button>
      <div className="entry-head">
        <span className="eyebrow">Existing table</span>
        <h1>Join a lobby</h1>
      </div>
      <label>
        Room code or invite link
        <input autoFocus value={code} maxLength={48} placeholder="Q7K2A9" onChange={(e) => setCode(e.target.value)} />
      </label>
      <label>
        Your display name
        <input value={name} maxLength={24} placeholder="Sam" onChange={(e) => setName(e.target.value)} />
      </label>
      <Toggle label="Join as spectator (watch, no seat)" checked={spectator} onChange={setSpectator} />
      <button
        className="primary"
        onClick={() => {
          const resolved = extractCode(code);
          send.joinRoom(
            { code: resolved, name: name.trim() || 'You', spectator, sessionToken: stored?.code === resolved ? stored.sessionToken : undefined },
            (result) => { if (!result.ok) notify(result.error); }
          );
        }}
      >
        <Icon name="login" size={17} /> Join table
      </button>
    </section>
  );
}

/* ---------------- Room shell ---------------- */
function RoomView({ snapshot, notify }: { snapshot: ServerSnapshot; notify: (message: string) => void }) {
  const room = snapshot.publicState;
  const me = room.players.find((p) => p.id === snapshot.privateState?.playerId);
  const isHost = Boolean(me?.isHost);
  const ended = room.lifecycle === 'ended';
  const [tab, setTab] = useState<Tab>('table');
  const chipReqs = room.players.filter((p) => p.badges.includes('Chip request')).length;
  const seated = room.players.filter((p) => p.seat !== null).length;

  const copyInvite = () => {
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${room.code}`).catch(() => undefined);
    notify(`Invite link copied · code ${room.code}`);
  };
  const endSession = () => {
    send.endSession({}, (result) => {
      if (!result.ok) return notify(result.error);
      download('feltline-session.txt', result.exportText, 'text/plain');
      download('feltline-session.json', result.exportJson, 'application/json');
      notify('Session ended — TXT + JSON export downloaded.');
    });
  };

  const tabs: Array<[Tab, string]> = [['table', 'Table'], ['lobby', 'Lobby'], ['settings', 'Settings'], ['audit', 'Audit & Chat']];

  return (
    <section className="room-grid">
      <header className="room-header">
        <div>
          <span className="eyebrow">Room {room.code} · {seated} seated</span>
          <h1>{room.settings.roomName}</h1>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={copyInvite}><Icon name="clipboard" size={16} /> Invite</button>
          <button className="ghost" onClick={() => setTab('audit')}><Icon name="shield" size={16} /> Audit</button>
          {isHost && !ended && <button className="danger" onClick={endSession}><Icon name="power" size={16} /> End &amp; export</button>}
          {ended && isHost && <button className="ghost" onClick={endSession}><Icon name="download" size={16} /> Re-export</button>}
        </div>
      </header>

      <nav className="tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
            {key === 'lobby' && chipReqs > 0 && isHost && <span className="tab-badge">{chipReqs}</span>}
          </button>
        ))}
      </nav>

      <div className="banner"><Icon name="spade" size={16} /> {room.exportWarning}</div>
      {ended && <div className="banner ended"><Icon name="lock" size={16} /> Session ended. Commands are locked; the export remains available to the host.</div>}
      {room.queuedMode && <div className="banner mode"><Icon name="zap" size={16} /> Next hand: <strong>&nbsp;{room.queuedMode.label}</strong>, queued by {room.queuedMode.queuedByName}</div>}
      {room.settings.locked && !ended && <div className="banner"><Icon name="lock" size={16} /> Room is locked — no new players can join.</div>}

      {tab === 'table' && <TableView room={room} privateState={snapshot.privateState} me={me} notify={notify} />}
      {tab === 'lobby' && <LobbyView room={room} me={me} notify={notify} />}
      {tab === 'settings' && <SettingsView room={room} isHost={isHost} notify={notify} />}
      {tab === 'audit' && <AuditView room={room} me={me} notify={notify} />}
    </section>
  );
}

/* ---------------- Table ---------------- */
function TableView({ room, privateState, me, notify }: { room: RoomPublicState; privateState: PrivateState | null; me?: PlayerPublic; notify: (message: string) => void }) {
  const hand = room.hand;
  const ended = room.lifecycle === 'ended';
  const legal = privateState?.legalActions ?? emptyLegal();
  const myHoleCards = privateState?.holeCards ?? [];
  const myTurn = Boolean(hand) && me?.seat != null && hand!.currentTurnSeat === me.seat;
  const [raise, setRaise] = useState(0);
  const [confirm, setConfirm] = useState<{ action: 'bet' | 'raise' | 'all_in'; amount: number } | null>(null);

  const minAction = legal.canRaise ? legal.minRaiseTo : legal.minBet;
  const livePot = hand ? hand.pots.reduce((s, p) => s + p.amount, 0) + room.players.reduce((s, p) => s + p.currentBet, 0) : 0;

  useEffect(() => {
    setRaise(Math.max(minAction || 0, legal.callAmount || 0));
  }, [minAction, legal.callAmount, hand?.actionNonce, hand?.phase]);

  const submit = (action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in', amount?: number) => {
    if (!hand) return;
    send.act({ action, amount, nonce: hand.actionNonce }, (result) => { if (!result.ok) notify(result.error); });
  };
  const guarded = (action: 'bet' | 'raise' | 'all_in', amount: number) => {
    const stack = me?.stack ?? 0;
    const threshold = stack * (room.settings.largeBetThresholdPct / 100);
    if (action === 'all_in' || (stack > 0 && amount >= threshold)) setConfirm({ action, amount });
    else submit(action, amount);
  };

  const seatedPlayers = room.players.filter((p) => p.seat !== null);
  const noHand = !hand || hand.phase === 'complete';
  const maxBet = Math.max(legal.maxBet || 1, 1);

  return (
    <div className="table-layout">
      <div className="felt-wrap">
        <div className="felt">
          <div className="felt-center">
            {hand ? (
              <>
                <div className="pot-stack">
                  <span className="variant">{hand.variant === 'omaha4' ? 'PLO 4-CARD' : "NL HOLD'EM"}{hand.modifiers.bombPot ? ' · BOMB' : ''}</span>
                  <div className="pot-chips"><i className="chip-dot" /><i className="chip-dot" /><i className="chip-dot" /></div>
                  <strong>{hand.pots.reduce((s, p) => s + p.amount, 0).toLocaleString()}</strong>
                  <small>{hand.phase} · hand #{hand.number}{hand.pots.length > 1 ? ` · ${hand.pots.length} pots` : ''}</small>
                </div>
                <div className="board-row">
                  {Array.from({ length: 5 }).map((_, i) => (i < hand.board.length ? <Card key={hand.board[i] + String(i)} card={hand.board[i]} dealIn /> : <Card key={'e' + i} card={null} />))}
                </div>
                {hand.board2.length > 0 && (
                  <div className="board-row second">
                    {Array.from({ length: 5 }).map((_, i) => (i < hand.board2.length ? <Card key={hand.board2[i] + '2' + String(i)} card={hand.board2[i]} dealIn /> : <Card key={'e2' + i} card={null} />))}
                  </div>
                )}
              </>
            ) : (
              <div className="pot-stack">
                <span className="variant">FELTLINE</span>
                <strong>Ready</strong>
                <small>seat up &amp; deal</small>
              </div>
            )}
          </div>
          <div className="seat-ring">
            {seatedPlayers.map((p) => <SeatPod key={p.id} player={p} hand={hand} meId={me?.id} myHoleCards={myHoleCards} maxSeats={room.settings.maxSeats} />)}
          </div>
        </div>
      </div>

      <aside className="action-rail">
        <div className="hole-cards">
          <h3 className="panel-title"><Icon name="spade" size={13} /> Your hand</h3>
          <div className="cards">
            {myHoleCards.length ? myHoleCards.map((c, i) => <Card key={c + i} card={c} mine dealIn />)
              : <em>{me?.seat == null ? 'Take a seat in the Lobby to get dealt in.' : 'Waiting for the next deal.'}</em>}
          </div>
        </div>

        {noHand ? (
          <div className="between-hands">
            <div className="action-state">
              <strong>{hand ? 'Hand complete' : 'Table is open'}</strong>
              <small>{room.players.filter((p) => p.seat !== null && p.stack > 0).length} funded seats · min {room.settings.minSeats}</small>
            </div>
            {hand?.summary && (
              <div className="hand-summary">
                <span className="ttl">Hand #{hand.number} result</span>
                {hand.summary}
              </div>
            )}
            <button className="primary" disabled={!me?.isHost || ended} onClick={() => send.startGame({}, (r) => { if (!r.ok) notify(r.error); })}>
              <Icon name="play" size={17} /> {hand ? 'Deal next hand' : 'Deal first hand'}
            </button>
            {!me?.isHost && <small style={{ color: 'var(--muted-2)', fontFamily: 'var(--mono)', fontSize: '0.72rem' }}>Only the host can start the hand.</small>}
          </div>
        ) : (
          <>
            <div className="action-state">
              {myTurn ? <strong>Your action</strong> : <span className="wait">Waiting on {room.players.find((p) => p.seat === hand!.currentTurnSeat)?.name ?? 'the table'}…</span>}
              <small>action #{hand!.actionNonce} · stale duplicates rejected</small>
            </div>
            <div className="buttons-grid">
              <button className="btn-fold" disabled={!legal.canFold} onClick={() => submit('fold')}>Fold</button>
              <button disabled={!legal.canCheck} onClick={() => submit('check')}>Check</button>
              <button className="btn-call" disabled={!legal.canCall} onClick={() => submit('call')}>Call {legal.callAmount || ''}</button>
              <button className="btn-allin" disabled={!legal.allInAmount} onClick={() => guarded('all_in', legal.allInAmount)}>All-in {legal.allInAmount || ''}</button>
            </div>
            <div className="bet-box">
              <div className="bet-readout">
                <span className="amt">{raise.toLocaleString()}</span>
                <span className="lbl">{legal.canRaise ? 'raise to' : 'bet'}</span>
              </div>
              <input
                type="range"
                min="0"
                max={maxBet}
                style={{ ['--fill' as string]: `${Math.min(100, (raise / maxBet) * 100)}%` }}
                value={Math.min(raise, maxBet)}
                onChange={(e) => setRaise(Number(e.target.value))}
              />
              <div className="preset-row">
                {([[1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [1, 'Pot']] as Array<[number, string]>).map(([f, lbl]) => (
                  <button key={lbl} disabled={!myTurn} onClick={() => setRaise(Math.min(legal.maxBet, Math.max(minAction, Math.round(livePot * f))))}>{lbl}</button>
                ))}
                <button disabled={!myTurn} onClick={() => setRaise(Math.min(legal.maxBet, Math.max(minAction, room.settings.bigBlind * 3)))}>3×BB</button>
                <button disabled={!myTurn} onClick={() => setRaise(legal.maxBet)}>Max</button>
              </div>
              <div className="bet-actions">
                <button disabled={!legal.canBet} onClick={() => guarded('bet', raise)}>Bet</button>
                <button className="primary" disabled={!legal.canRaise} onClick={() => guarded('raise', raise)}>Raise</button>
              </div>
            </div>
          </>
        )}

        <QueueModes room={room} notify={notify} />
      </aside>

      {confirm && <ConfirmModal confirm={confirm} me={me} onCancel={() => setConfirm(null)} onConfirm={() => { submit(confirm.action, confirm.amount); setConfirm(null); }} />}
    </div>
  );
}

function ConfirmModal({ confirm, me, onConfirm, onCancel }: { confirm: { action: 'bet' | 'raise' | 'all_in'; amount: number }; me?: PlayerPublic; onConfirm: () => void; onCancel: () => void }) {
  const stack = me?.stack ?? 0;
  const moved = confirm.action === 'all_in' ? stack : confirm.action === 'raise' ? Math.max(0, confirm.amount - (me?.currentBet ?? 0)) : confirm.amount;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Confirm {confirm.action.replace('_', '-')}</h2>
        <div className="big-num">{moved.toLocaleString()} chips</div>
        <p>
          You&apos;ll move <strong>{moved.toLocaleString()}</strong> chips{confirm.action === 'raise' ? ` to reach ${confirm.amount.toLocaleString()} total this street` : ''}.
          {' '}Remaining stack: <strong>{Math.max(0, stack - moved).toLocaleString()}</strong>. This is a large commitment relative to your stack.
        </p>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button className="danger" onClick={onConfirm}>Confirm {confirm.action === 'all_in' ? 'all-in' : ''}</button>
        </div>
      </div>
    </div>
  );
}

function QueueModes({ room, notify }: { room: RoomPublicState; notify: (message: string) => void }) {
  const ended = room.lifecycle === 'ended';
  const allowed = room.settings.custom.allowedModes;
  return (
    <div>
      <h3 className="panel-title"><Icon name="zap" size={13} /> Queue next hand</h3>
      <div className="mode-buttons" style={{ marginTop: 9 }}>
        {MODE_KEYS.map((m) => (
          <button
            key={m}
            className={`mode-chip ${room.queuedMode && room.queuedMode.label === modeLabel(m) ? 'queued' : ''}`.trim()}
            disabled={ended || !room.settings.custom.enabled || !allowed.includes(m) || Boolean(room.queuedMode)}
            onClick={() => send.queueMode({ mode: m }, (r) => { if (!r.ok) notify(r.error); })}
          >
            {modeLabel(m)}
          </button>
        ))}
      </div>
      {!room.settings.custom.enabled && <small style={{ color: 'var(--muted-2)', fontFamily: 'var(--mono)', fontSize: '0.72rem' }}>Custom queue is off in Settings.</small>}
    </div>
  );
}

/* ---------------- Lobby ---------------- */
function LobbyView({ room, me, notify }: { room: RoomPublicState; me?: PlayerPublic; notify: (message: string) => void }) {
  const ended = room.lifecycle === 'ended';
  const maxSeats = room.settings.maxSeats;
  return (
    <div className="lobby-grid">
      <section className="panel">
        <h2><Icon name="users" size={17} /> Seat map</h2>
        <div className="seat-map">
          {Array.from({ length: maxSeats }).map((_, seat) => {
            const pid = room.seats[seat];
            const p = room.players.find((x) => x.id === pid);
            const mine = Boolean(p && me && p.id === me.id);
            return (
              <button
                key={seat}
                className={`seat-choice ${p ? 'occupied' : ''} ${mine ? 'mine' : ''}`.replace(/\s+/g, ' ').trim()}
                disabled={Boolean(p) || ended}
                onClick={() => send.sit({ seat }, (r) => { if (!r.ok) notify(r.error); })}
              >
                <span className="s-no">Seat {seat + 1}</span>
                <span className="s-name">{p ? p.name : 'Open'}</span>
                {p ? <span className="s-meta">{p.stack.toLocaleString()} chips · {p.upDown >= 0 ? '+' : ''}{p.upDown}</span> : <span className="s-meta">tap to sit</span>}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="lobby-side">
        <div className="panel">
          <h2><Icon name="play" size={16} /> Get started</h2>
          <div className="control-strip">
            <button className="primary" disabled={!me?.isHost || ended} onClick={() => send.startGame({}, (r) => { if (!r.ok) notify(r.error); })}>
              <Icon name="play" size={16} /> Start hand
            </button>
            <button className={me?.ready ? 'on' : ''} disabled={ended} onClick={() => send.ready({ ready: !me?.ready }, (r) => { if (!r.ok) notify(r.error); })}>
              <Icon name="check" size={16} /> {me?.ready ? 'Ready ✓' : 'Mark ready'}
            </button>
            <span className="seated-count">{room.players.filter((p) => p.seat !== null && p.stack > 0).length}/{room.settings.minSeats} min</span>
          </div>
        </div>

        <ChipControls room={room} me={me} notify={notify} />
        <Scoreboard room={room} />
        {me?.isHost && <HostControls room={room} notify={notify} />}
      </aside>
    </div>
  );
}

function ChipControls({ room, me, notify }: { room: RoomPublicState; me?: PlayerPublic; notify: (message: string) => void }) {
  const ended = room.lifecycle === 'ended';
  const [amount, setAmount] = useState(room.settings.buyIn);
  const [reason, setReason] = useState('rebuy / top-up');
  const reqs = room.players.filter((p) => p.badges.includes('Chip request'));
  return (
    <div className="panel">
      <h2><Icon name="coin" size={17} /> Chips</h2>
      <div className="inline-form stack">
        <div className="inline-form">
          <NumberField label="" value={amount} onChange={setAmount} disabled={ended} />
          <input value={reason} disabled={ended} onChange={(e) => setReason(e.target.value)} placeholder="reason" />
        </div>
        <button
          disabled={ended}
          onClick={() => send.requestChips({ amount, reason }, (r) => { if (!r.ok) notify(r.error); else notify(room.settings.selfServiceChips ? 'Self-served chips added.' : 'Chip request sent to host.'); })}
        >
          <Icon name="coin" size={15} /> {room.settings.selfServiceChips ? 'Add chips' : 'Request chips'}
        </button>
      </div>
      {me?.isHost && reqs.length > 0 && (
        <div className="req-list">
          {reqs.map((p) => (
            <div className="req-row" key={p.id}>
              <div className="r-meta">
                <b>{p.name}</b>
                <small>awaiting host approval</small>
              </div>
              <button className="primary" disabled={ended} onClick={() => send.approveChips({ playerId: p.id, amount, reason: 'host approved' }, (r) => { if (!r.ok) notify(r.error); })}>Approve {amount}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Scoreboard({ room }: { room: RoomPublicState }) {
  const players = room.players.filter((p) => !p.banned && p.buyInTotal > 0).slice().sort((a, b) => b.upDown - a.upDown);
  return (
    <div className="panel">
      <h2><Icon name="layers" size={16} /> Scoreboard</h2>
      <div className="score-table">
        {players.length === 0 && <span style={{ color: 'var(--muted)' }}>No buy-ins yet.</span>}
        {players.map((p, i) => (
          <div className="score-row" key={p.id}>
            <span className="nm"><i className={`rank-dot ${i === 0 ? 'lead' : ''}`.trim()} /> {p.name}{p.isHost ? ' ·host' : ''}</span>
            <span className="stk">{p.stack.toLocaleString()}</span>
            <span className={`ud ${p.upDown >= 0 ? 'pos' : 'neg'}`}>{p.upDown >= 0 ? '+' : ''}{p.upDown}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HostControls({ room, notify }: { room: RoomPublicState; notify: (message: string) => void }) {
  const ended = room.lifecycle === 'ended';
  const others = room.players.filter((p) => !p.isHost && !p.banned);
  const act = (action: 'kick' | 'mute' | 'forceSitOut' | 'transferHost' | 'lock' | 'spectators', playerId?: string, value?: boolean) =>
    send.hostAction({ action, playerId, value }, (r) => { if (!r.ok) notify(r.error); });
  return (
    <div className="panel">
      <h2><Icon name="crown" size={16} /> Host controls</h2>
      <div className="host-toggles">
        <button className={room.settings.locked ? 'on' : ''} disabled={ended} onClick={() => act('lock', undefined, !room.settings.locked)}>
          <Icon name={room.settings.locked ? 'lock' : 'unlock'} size={15} /> {room.settings.locked ? 'Locked' : 'Lock room'}
        </button>
        <button className={room.settings.spectatorsAllowed ? 'on' : ''} disabled={ended} onClick={() => act('spectators', undefined, !room.settings.spectatorsAllowed)}>
          <Icon name={room.settings.spectatorsAllowed ? 'eye' : 'eyeOff'} size={15} /> Spectators {room.settings.spectatorsAllowed ? 'on' : 'off'}
        </button>
      </div>
      <div className="mod-list">
        {others.map((p) => (
          <div className="mod-row" key={p.id}>
            <span className="m-name">{p.name} {p.forcedSitOut && <span className="seat-tag">SIT-OUT</span>} {p.muted && <span className="seat-tag last">MUTED</span>}</span>
            <div className="mod-actions">
              <button disabled={ended} onClick={() => act('mute', p.id, !p.muted)}>{p.muted ? 'Unmute' : 'Mute'}</button>
              <button disabled={ended} onClick={() => act('forceSitOut', p.id, !p.forcedSitOut)}>{p.forcedSitOut ? 'Restore' : 'Sit out'}</button>
              <button disabled={ended} title="Transfer host" onClick={() => act('transferHost', p.id)}><Icon name="swap" size={14} /></button>
              <button className="danger" disabled={ended} title={`Kick ${p.name}`} onClick={() => act('kick', p.id)}><Icon name="ban" size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Settings ---------------- */
function SettingsView({ room, isHost, notify }: { room: RoomPublicState; isHost: boolean; notify: (message: string) => void }) {
  const ended = room.lifecycle === 'ended';
  const [s, setS] = useState<RoomSettings>(() => clone(room.settings));
  useEffect(() => setS(clone(room.settings)), [room.settings]);
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => setS((c) => ({ ...c, [k]: v }));
  const setStraddle = <K extends keyof RoomSettings['straddle']>(k: K, v: RoomSettings['straddle'][K]) => setS((c) => ({ ...c, straddle: { ...c.straddle, [k]: v } }));
  const setCustom = <K extends keyof RoomSettings['custom']>(k: K, v: RoomSettings['custom'][K]) => setS((c) => ({ ...c, custom: { ...c.custom, [k]: v } }));
  const setSeven = <K extends keyof RoomSettings['sevenTwo']>(k: K, v: RoomSettings['sevenTwo'][K]) => setS((c) => ({ ...c, sevenTwo: { ...c.sevenTwo, [k]: v } }));
  const toggleMode = (m: CustomModeName) => setS((c) => ({ ...c, custom: { ...c.custom, allowedModes: c.custom.allowedModes.includes(m) ? c.custom.allowedModes.filter((x) => x !== m) : [...c.custom.allowedModes, m] } }));
  const apply = () => send.updateSettings(s, (r) => { if (!r.ok) notify(r.error); else notify('Table settings applied.'); });
  const live = Boolean(room.hand) && room.hand!.phase !== 'complete';

  return (
    <div className="settings-wrap">
      <div className="settings-section">
        <h2><Icon name="coin" size={17} /> Stakes &amp; stacks</h2>
        <div className="settings-grid">
          <NumberField label="Small blind" value={s.smallBlind} onChange={(v) => set('smallBlind', v)} min={0} />
          <NumberField label="Big blind" value={s.bigBlind} onChange={(v) => set('bigBlind', v)} min={1} />
          <NumberField label="Ante" value={s.ante} onChange={(v) => set('ante', v)} min={0} />
          <NumberField label="Buy-in" value={s.buyIn} onChange={(v) => set('buyIn', v)} min={0} />
          <NumberField label="Starting stack" value={s.startingStack} onChange={(v) => set('startingStack', v)} min={0} />
          <NumberField label="Min seats" value={s.minSeats} onChange={(v) => set('minSeats', v)} min={2} />
          <NumberField label="Max seats" value={s.maxSeats} onChange={(v) => set('maxSeats', v)} min={2} />
          <NumberField label="Large-bet confirm %" value={s.largeBetThresholdPct} onChange={(v) => set('largeBetThresholdPct', v)} min={10} step={5} />
        </div>
      </div>

      <div className="settings-section">
        <h2><Icon name="settings" size={16} /> Table rules</h2>
        <div className="toggles-grid">
          <Toggle label="Self-service play-money chips" checked={s.selfServiceChips} onChange={(v) => set('selfServiceChips', v)} />
          <Toggle label="Auto-approve chip requests" checked={s.autoApproveChips} onChange={(v) => set('autoApproveChips', v)} />
          <Toggle label="Spectators allowed" checked={s.spectatorsAllowed} onChange={(v) => set('spectatorsAllowed', v)} />
          <Toggle label="Room locked" checked={s.locked} onChange={(v) => set('locked', v)} />
          <Toggle label="UTG straddle" checked={s.straddle.enabled} onChange={(v) => setStraddle('enabled', v)} />
          <Toggle label="Custom queue on" checked={s.custom.enabled} onChange={(v) => setCustom('enabled', v)} />
          <Toggle label="7-2 bounty (every hand)" checked={s.sevenTwo.enabled} onChange={(v) => setSeven('enabled', v)} />
        </div>
        <div className="settings-grid" style={{ marginTop: 14 }}>
          <NumberField label="Straddle amount" value={s.straddle.amount} onChange={(v) => setStraddle('amount', v)} disabled={!s.straddle.enabled} />
          <NumberField label="7-2 bounty" value={s.sevenTwo.bounty} onChange={(v) => setSeven('bounty', v)} disabled={!s.sevenTwo.enabled} />
          <NumberField label="7-2 suited bonus" value={s.sevenTwo.suitedBonus} onChange={(v) => setSeven('suitedBonus', v)} disabled={!s.sevenTwo.enabled} />
          <NumberField label="Custom cooldown (hands)" value={s.custom.cooldownHands} onChange={(v) => setCustom('cooldownHands', v)} disabled={!s.custom.enabled} />
        </div>
      </div>

      <div className="settings-section">
        <h2><Icon name="zap" size={16} /> Allowed custom modes</h2>
        <div className="mode-buttons">
          {MODE_KEYS.map((m) => (
            <button key={m} className={`mode-chip ${s.custom.allowedModes.includes(m) ? 'queued' : ''}`.trim()} disabled={!s.custom.enabled} onClick={() => toggleMode(m)}>
              {s.custom.allowedModes.includes(m) ? '✓ ' : ''}{modeLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section settings-footer">
        <p>Major setting changes are rejected during an active hand and written to the audit log. Chip mode is strict table-stakes accounting. {live && <strong style={{ color: 'var(--coral)' }}>A hand is live — finish it before applying.</strong>}</p>
        <button className="primary" disabled={!isHost || ended || live} onClick={apply}><Icon name="check" size={16} /> Apply settings</button>
      </div>
    </div>
  );
}

/* ---------------- Audit & Chat ---------------- */
function AuditView({ room, me, notify }: { room: RoomPublicState; me?: PlayerPublic; notify: (message: string) => void }) {
  const [msg, setMsg] = useState('');
  const logEnd = useRef<HTMLDivElement | null>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  useEffect(() => { const el = logEnd.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, [room.audit.length]);
  useEffect(() => { const el = chatEnd.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, [room.chat.length]);
  const ended = room.lifecycle === 'ended';
  const send_ = () => { if (!msg.trim()) return; send.chat({ message: msg.trim() }, (r) => { if (!r.ok) notify(r.error); else setMsg(''); }); };

  return (
    <div className="audit-grid">
      <section className="log-panel">
        <h2><Icon name="shield" size={16} /> Audit log <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--muted-2)' }}>{room.audit.length} entries</span></h2>
        <div className="log-scroll">
          {room.audit.map((a) => (
            <div className="log-row" key={a.id}>
              <time>{new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
              <span className="type">{a.type}</span>
              <p>{a.message}</p>
            </div>
          ))}
          <div ref={logEnd} />
        </div>
      </section>

      <section className="log-panel chat-panel">
        <h2><Icon name="message" size={16} /> Table chat {me?.muted && <span className="seat-tag last" style={{ marginLeft: 8 }}>YOU ARE MUTED</span>}</h2>
        <div className="chat-scroll">
          {room.chat.map((c) => (
            <div className={`chat-row ${c.system ? 'system' : ''} ${c.playerId === me?.id ? 'mine' : ''}`.replace(/\s+/g, ' ').trim()} key={c.id}>
              <b>{c.playerName}</b>
              <p>{c.message}</p>
            </div>
          ))}
          <div ref={chatEnd} />
        </div>
        <div className="chat-input">
          <input value={msg} maxLength={240} placeholder={me?.muted ? 'You are muted' : 'Say something…'} disabled={Boolean(me?.muted) || ended} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send_()} />
          <button className="primary" disabled={Boolean(me?.muted) || ended} onClick={send_}><Icon name="send" size={15} /></button>
        </div>
      </section>
    </div>
  );
}

/* ---------------- socket send helpers ---------------- */
const send = {
  createRoom(payload: Parameters<ClientToServerEvents['createRoom']>[0], ack: Parameters<ClientToServerEvents['createRoom']>[1]) { socket.emit('createRoom', payload, ack); },
  joinRoom(payload: Parameters<ClientToServerEvents['joinRoom']>[0], ack: Parameters<ClientToServerEvents['joinRoom']>[1]) { socket.emit('joinRoom', payload, ack); },
  updateSettings(payload: Parameters<ClientToServerEvents['updateSettings']>[0], ack: Parameters<ClientToServerEvents['updateSettings']>[1]) { socket.emit('updateSettings', payload, ack); },
  sit(payload: Parameters<ClientToServerEvents['sit']>[0], ack: Parameters<ClientToServerEvents['sit']>[1]) { socket.emit('sit', payload, ack); },
  ready(payload: Parameters<ClientToServerEvents['ready']>[0], ack: Parameters<ClientToServerEvents['ready']>[1]) { socket.emit('ready', payload, ack); },
  startGame(payload: Parameters<ClientToServerEvents['startGame']>[0], ack: Parameters<ClientToServerEvents['startGame']>[1]) { socket.emit('startGame', payload, ack); },
  act(payload: Parameters<ClientToServerEvents['act']>[0], ack: Parameters<ClientToServerEvents['act']>[1]) { socket.emit('act', payload, ack); },
  requestChips(payload: Parameters<ClientToServerEvents['requestChips']>[0], ack: Parameters<ClientToServerEvents['requestChips']>[1]) { socket.emit('requestChips', payload, ack); },
  approveChips(payload: Parameters<ClientToServerEvents['approveChips']>[0], ack: Parameters<ClientToServerEvents['approveChips']>[1]) { socket.emit('approveChips', payload, ack); },
  queueMode(payload: Parameters<ClientToServerEvents['queueMode']>[0], ack: Parameters<ClientToServerEvents['queueMode']>[1]) { socket.emit('queueMode', payload, ack); },
  hostAction(payload: Parameters<ClientToServerEvents['hostAction']>[0], ack: Parameters<ClientToServerEvents['hostAction']>[1]) { socket.emit('hostAction', payload, ack); },
  chat(payload: Parameters<ClientToServerEvents['chat']>[0], ack: Parameters<ClientToServerEvents['chat']>[1]) { socket.emit('chat', payload, ack); },
  endSession(payload: Parameters<ClientToServerEvents['endSession']>[0], ack: Parameters<ClientToServerEvents['endSession']>[1]) { socket.emit('endSession', payload, ack); }
};

/* ---------------- utilities ---------------- */
function emptyLegal(): LegalActions {
  return { canFold: false, canCheck: false, canCall: false, callAmount: 0, canBet: false, canRaise: false, minBet: 0, minRaiseTo: 0, maxBet: 0, allInAmount: 0, potSize: 0 };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function extractCode(input: string): string {
  try {
    const parsed = new URL(input);
    return (parsed.searchParams.get('room') ?? parsed.pathname.split('/').pop() ?? input).toUpperCase().replace(/[^A-Z0-9]/g, '');
  } catch {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}

function readStored(): StoredSession | null {
  const roomFromUrl = new URLSearchParams(location.search).get('room');
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as StoredSession | null;
    if (roomFromUrl && parsed) return { ...parsed, code: roomFromUrl.toUpperCase() };
    if (roomFromUrl) return { code: roomFromUrl.toUpperCase(), playerId: '', sessionToken: '' };
    return parsed;
  } catch {
    return roomFromUrl ? { code: roomFromUrl.toUpperCase(), playerId: '', sessionToken: '' } : null;
  }
}

function persist(session: StoredSession): void {
  if (!session.sessionToken) return;
  localStorage.setItem(storageKey, JSON.stringify(session));
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
