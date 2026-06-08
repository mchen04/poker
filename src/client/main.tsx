import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import {
  Ban,
  Check,
  CircleDollarSign,
  Clipboard,
  Crown,
  Download,
  Eye,
  Lock,
  LogOut,
  MessageSquare,
  Play,
  RefreshCcw,
  Settings,
  Shield,
  UserPlus,
  Zap
} from 'lucide-react';
import { cardLabel } from '../shared/cards';
import { modeLabel } from '../shared/modes';
import type {
  ClientToServerEvents,
  Card,
  CustomModeName,
  LegalActions,
  PlayerPublic,
  RoomPublicState,
  RoomSettings,
  ServerSnapshot,
  ServerToClientEvents,
} from '../shared/types';
import './styles.css';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Screen = 'landing' | 'create' | 'join' | 'room';

interface StoredSession {
  code: string;
  playerId: string;
  sessionToken: string;
}

const socket: AppSocket = io('/', { autoConnect: true, transports: ['websocket', 'polling'] });
const storageKey = 'feltline-session';

function App() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null);
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState(socket.connected ? 'online' : 'connecting');
  const [stored, setStored] = useState<StoredSession | null>(() => readStored());

  useEffect(() => {
    const onSnapshot = (next: ServerSnapshot) => {
      setSnapshot(next);
      setScreen('room');
      persist({
        code: next.publicState.code,
        playerId: next.privateState?.playerId ?? stored?.playerId ?? '',
        sessionToken: next.privateState?.sessionToken ?? stored?.sessionToken ?? ''
      });
    };
    const onConnect = () => setConnection('online');
    const onDisconnect = () => setConnection('reconnecting');
    socket.on('snapshot', onSnapshot);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('errorNotice', setNotice);
    return () => {
      socket.off('snapshot', onSnapshot);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('errorNotice', setNotice);
    };
  }, [stored?.playerId, stored?.sessionToken]);

  const reconnect = () => {
    if (!stored) return;
    send.joinRoom({ code: stored.code, name: 'Reconnecting', sessionToken: stored.sessionToken }, (result) => {
      if (!result.ok) setNotice(result.error);
    });
  };

  return (
    <main className="app-shell">
      <div className="noise" />
      {screen === 'landing' && <Landing onCreate={() => setScreen('create')} onJoin={() => setScreen('join')} stored={stored} reconnect={reconnect} />}
      {screen === 'create' && <CreateRoom back={() => setScreen('landing')} setNotice={setNotice} />}
      {screen === 'join' && <JoinRoom back={() => setScreen('landing')} setNotice={setNotice} stored={stored} />}
      {screen === 'room' && snapshot && <RoomView snapshot={snapshot} setNotice={setNotice} />}
      <div className={`connection ${connection}`}>{connection}</div>
      {notice && (
        <button className="notice" onClick={() => setNotice('')}>
          {notice}
        </button>
      )}
    </main>
  );
}

function Landing({ onCreate, onJoin, stored, reconnect }: { onCreate: () => void; onJoin: () => void; stored: StoredSession | null; reconnect: () => void }) {
  return (
    <section className="landing-screen">
      <div className="brand-mark">Feltline</div>
      <div className="landing-actions" aria-label="Poker lobby actions">
        <button className="choice create" onClick={onCreate}>
          <UserPlus size={34} />
          <span>Create Lobby</span>
        </button>
        <button className="choice join" onClick={onJoin}>
          <LogOut size={34} />
          <span>Join Lobby</span>
        </button>
      </div>
      {stored && (
        <button className="ghost reconnect" onClick={reconnect}>
          <RefreshCcw size={18} /> Reconnect to {stored.code}
        </button>
      )}
      <p className="boundary">Private social play-money only. No accounts, payments, deposits, withdrawals, rake, or real-money settlement.</p>
    </section>
  );
}

function CreateRoom({ back, setNotice }: { back: () => void; setNotice: (message: string) => void }) {
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('Friday Home Game');
  return (
    <section className="entry-panel">
      <button className="ghost" onClick={back}>Back</button>
      <h1>Create Lobby</h1>
      <label>
        Display name
        <input autoFocus value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="Maya" />
      </label>
      <label>
        Room name
        <input value={roomName} maxLength={24} onChange={(event) => setRoomName(event.target.value)} />
      </label>
      <button
        className="primary"
        onClick={() =>
          send.createRoom({ name, roomName }, (result) => {
            if (!result.ok) setNotice(result.error);
          })
        }
      >
        <Play size={18} /> Open Lobby
      </button>
    </section>
  );
}

function JoinRoom({ back, setNotice, stored }: { back: () => void; setNotice: (message: string) => void; stored: StoredSession | null }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(stored?.code ?? '');
  const [spectator, setSpectator] = useState(false);
  return (
    <section className="entry-panel">
      <button className="ghost" onClick={back}>Back</button>
      <h1>Join Lobby</h1>
      <label>
        Room code or link
        <input autoFocus value={code} maxLength={48} onChange={(event) => setCode(event.target.value)} placeholder="Q7K2A" />
      </label>
      <label>
        Display name
        <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="Sam" />
      </label>
      <label className="toggle-line">
        <input type="checkbox" checked={spectator} onChange={(event) => setSpectator(event.target.checked)} />
        Join as spectator
      </label>
      <button
        className="primary"
        onClick={() =>
          send.joinRoom({ code: extractCode(code), name, spectator, sessionToken: stored?.code === extractCode(code) ? stored.sessionToken : undefined }, (result) => {
            if (!result.ok) setNotice(result.error);
          })
        }
      >
        <UserPlus size={18} /> Join Table
      </button>
    </section>
  );
}

function RoomView({ snapshot, setNotice }: { snapshot: ServerSnapshot; setNotice: (message: string) => void }) {
  const room = snapshot.publicState;
  const me = room.players.find((player) => player.id === snapshot.privateState?.playerId);
  const isHost = Boolean(me?.isHost);
  const [tab, setTab] = useState<'table' | 'lobby' | 'settings' | 'audit'>('table');

  return (
    <section className="room-grid">
      <header className="room-header">
        <div>
          <div className="eyebrow">Room {room.code}</div>
          <h1>{room.settings.roomName}</h1>
        </div>
        <div className="header-actions">
          <CopyInvite code={room.code} setNotice={setNotice} />
          <button className="ghost" onClick={() => setTab('audit')}>
            <Shield size={17} /> Audit
          </button>
          {isHost && <EndSession setNotice={setNotice} />}
        </div>
      </header>

      <nav className="tabs">
        {(['table', 'lobby', 'settings', 'audit'] as const).map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      <div className="play-money-banner">{room.exportWarning}</div>
      {room.queuedMode && <div className="mode-banner"><Zap size={18} /> Next hand: {room.queuedMode.label}, queued by {room.queuedMode.queuedByName}</div>}

      {tab === 'table' && <TableView room={room} privateState={snapshot.privateState} me={me} setNotice={setNotice} />}
      {tab === 'lobby' && <LobbyView room={room} me={me} setNotice={setNotice} />}
      {tab === 'settings' && <SettingsView room={room} isHost={isHost} setNotice={setNotice} />}
      {tab === 'audit' && <AuditView room={room} />}
    </section>
  );
}

function CopyInvite({ code, setNotice }: { code: string; setNotice: (message: string) => void }) {
  return (
    <button
      className="ghost"
      onClick={() => {
        navigator.clipboard?.writeText(`${location.origin}?room=${code}`).catch(() => undefined);
        setNotice(`Invite copied: ${code}`);
      }}
    >
      <Clipboard size={17} /> Invite
    </button>
  );
}

function TableView({
  room,
  privateState,
  me,
  setNotice
}: {
  room: RoomPublicState;
  privateState: ServerSnapshot['privateState'];
  me?: PlayerPublic;
  setNotice: (message: string) => void;
}) {
  const hand = room.hand;
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [confirm, setConfirm] = useState<{ action: 'bet' | 'raise' | 'all_in'; amount: number } | null>(null);
  const legal = privateState?.legalActions ?? emptyLegal();
  const myTurn = hand?.currentTurnSeat !== null && me?.seat === hand?.currentTurnSeat;
  const pot = legal.potSize || hand?.pots.reduce((sum, item) => sum + item.amount, 0) || 0;

  useEffect(() => {
    setRaiseAmount(Math.max(legal.minBet || legal.minRaiseTo || 0, legal.callAmount || 0));
  }, [legal.minBet, legal.minRaiseTo, legal.callAmount, hand?.actionNonce]);

  if (!hand) {
    return (
      <div className="table-empty">
        <Crown size={44} />
        <p>Lobby is open. Seat at least two play-money stacks, then the host can start.</p>
        <LobbyStart room={room} me={me} setNotice={setNotice} />
      </div>
    );
  }

  const submit = (action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in', amount?: number) => {
    send.act({ action, amount, nonce: hand.actionNonce }, (result) => {
      if (!result.ok) setNotice(result.error);
    });
  };
  const guardedSubmit = (action: 'bet' | 'raise' | 'all_in', amount: number) => {
    const stack = me?.stack ?? 0;
    const large = stack > 0 && amount >= stack * (room.settings.largeBetThresholdPct / 100) && action !== 'all_in';
    if (large || action === 'all_in') setConfirm({ action, amount });
    else submit(action, amount);
  };

  return (
    <div className="table-layout">
      <div className="felt">
        <div className="pot-stack">
          <span>{variantTitle(hand.variant)}</span>
          <strong>{hand.pots.reduce((sum, item) => sum + item.amount, 0)} pot</strong>
          <small>{hand.phase} · hand {hand.number}</small>
        </div>
        <Board cards={hand.board} label={hand.modifiers.doubleBoard ? 'Board 1' : 'Board'} />
        {hand.modifiers.doubleBoard && <Board cards={hand.board2} label="Board 2" />}
        <div className="seat-ring">
          {room.players.filter((player) => player.seat !== null).map((player) => (
            <SeatPanel key={player.id} player={player} active={hand.currentTurnSeat === player.seat} me={player.id === me?.id} />
          ))}
        </div>
      </div>

      <aside className="action-rail">
        <div className="hole-cards">
          <span>Your cards</span>
          <div>{privateState?.holeCards.length ? privateState.holeCards.map((card) => <CardPip key={card} card={card} privateCard />) : <em>Sit in to get dealt.</em>}</div>
        </div>
        <div className="action-state">
          {myTurn ? <strong>Your action</strong> : <span>Waiting for {room.players.find((player) => player.seat === hand.currentTurnSeat)?.name ?? 'table'}</span>}
          <small>Nonce {hand.actionNonce}; stale duplicate actions are rejected.</small>
        </div>
        <div className="buttons-grid">
          <button disabled={!legal.canFold} onClick={() => submit('fold')}>Fold</button>
          <button disabled={!legal.canCheck} onClick={() => submit('check')}>Check</button>
          <button disabled={!legal.canCall} onClick={() => submit('call')}>Call {legal.callAmount}</button>
          <button disabled={!legal.allInAmount} onClick={() => guardedSubmit('all_in', legal.allInAmount)}>All-in {legal.allInAmount}</button>
        </div>
        <div className="bet-box">
          <input type="range" min="0" max={Math.max(legal.maxBet, 1)} value={Math.min(raiseAmount, Math.max(legal.maxBet, 1))} onChange={(event) => setRaiseAmount(Number(event.target.value))} />
          <input type="number" value={raiseAmount} onChange={(event) => setRaiseAmount(Number(event.target.value))} />
          <div className="preset-row">
            {[1 / 3, 1 / 2, 2 / 3, 1].map((fraction) => (
              <button key={fraction} disabled={!myTurn} onClick={() => setRaiseAmount(Math.min(legal.maxBet, Math.max(legal.minBet, Math.round(pot * fraction))))}>
                {fraction === 1 ? 'Pot' : `${Math.round(fraction * 100)}%`}
              </button>
            ))}
            <button disabled={!myTurn} onClick={() => setRaiseAmount(Math.min(legal.maxBet, room.settings.bigBlind * 3))}>3xBB</button>
          </div>
          <button disabled={!legal.canBet} onClick={() => guardedSubmit('bet', raiseAmount)}>Bet</button>
          <button disabled={!legal.canRaise} onClick={() => guardedSubmit('raise', raiseAmount)}>Raise</button>
        </div>
        <QueueModes room={room} setNotice={setNotice} />
        {hand.summary && <div className="hand-summary">{hand.summary}</div>}
      </aside>

      {confirm && (
        <div className="modal-backdrop">
          <div className="confirm-dialog">
            <h2>Confirm {confirm.action.replace('_', '-')}</h2>
            <p>Commit {confirm.amount} chips. Remaining stack: {Math.max(0, (me?.stack ?? 0) - confirm.amount)}.</p>
            <button className="danger" onClick={() => { submit(confirm.action, confirm.amount); setConfirm(null); }}>Confirm</button>
            <button className="ghost" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Board({ cards, label }: { cards: Card[]; label: string }) {
  return (
    <div className="board-row" aria-label={label}>
      <span>{label}</span>
      {Array.from({ length: 5 }).map((_, index) => (cards[index] ? <CardPip key={cards[index]} card={cards[index]} /> : <div className="card empty" key={index} />))}
    </div>
  );
}

function CardPip({ card, privateCard = false }: { card: Card; privateCard?: boolean }) {
  const red = card.endsWith('h') || card.endsWith('d');
  return <div className={`card ${red ? 'red' : 'black'} ${privateCard ? 'private' : ''}`}>{cardLabel(card)}</div>;
}

function SeatPanel({ player, active, me }: { player: PlayerPublic; active: boolean; me: boolean }) {
  return (
    <div className={`seat-panel ${active ? 'active' : ''} ${me ? 'me' : ''}`}>
      <div>
        <strong>{player.name}</strong>
        <span>{player.status}</span>
      </div>
      <div className="seat-stack">
        <b>{player.stack}</b>
        <small>{player.upDown >= 0 ? '+' : ''}{player.upDown}</small>
      </div>
      <div className="badges">{player.badges.map((badge) => <span key={badge}>{badge}</span>)}</div>
      {player.currentBet > 0 && <em>bet {player.currentBet}</em>}
    </div>
  );
}

function LobbyView({ room, me, setNotice }: { room: RoomPublicState; me?: PlayerPublic; setNotice: (message: string) => void }) {
  return (
    <div className="lobby-grid">
      <section className="seat-map">
        {room.seats.map((playerId, seat) => {
          const player = room.players.find((candidate) => candidate.id === playerId);
          return (
            <button
              key={seat}
              className={`seat-choice ${player ? 'occupied' : ''}`}
              disabled={Boolean(player)}
              onClick={() => send.sit({ seat }, (result) => !result.ok && setNotice(result.error))}
            >
              <span>Seat {seat + 1}</span>
              <strong>{player?.name ?? 'Open'}</strong>
            </button>
          );
        })}
      </section>
      <aside className="lobby-side">
        <LobbyStart room={room} me={me} setNotice={setNotice} />
        <ChipControls room={room} me={me} setNotice={setNotice} />
        <Scoreboard room={room} />
        {me?.isHost && <HostControls room={room} setNotice={setNotice} />}
      </aside>
    </div>
  );
}

function LobbyStart({ room, me, setNotice }: { room: RoomPublicState; me?: PlayerPublic; setNotice: (message: string) => void }) {
  return (
    <div className="control-strip">
      <button disabled={!me?.isHost} className="primary" onClick={() => send.startGame({}, (result) => !result.ok && setNotice(result.error))}>
        <Play size={18} /> Start hand
      </button>
      <button onClick={() => send.ready({ ready: !me?.ready }, (result) => !result.ok && setNotice(result.error))}>
        <Check size={18} /> {me?.ready ? 'Ready' : 'Mark ready'}
      </button>
      <span>{room.players.filter((player) => player.seat !== null && player.stack > 0).length}/{room.settings.minSeats} seated</span>
    </div>
  );
}

function ChipControls({ room, me, setNotice }: { room: RoomPublicState; me?: PlayerPublic; setNotice: (message: string) => void }) {
  const [amount, setAmount] = useState(room.settings.buyIn);
  const [reason, setReason] = useState('rebuy/top-up');
  return (
    <div className="panel-block">
      <h2><CircleDollarSign size={18} /> Chips</h2>
      <div className="inline-form">
        <input type="number" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        <input value={reason} onChange={(event) => setReason(event.target.value)} />
        <button onClick={() => send.requestChips({ amount, reason }, (result) => !result.ok && setNotice(result.error))}>Request</button>
      </div>
      {me?.isHost &&
        room.players
          .filter((player) => player.badges.includes('Chip request'))
          .map((player) => (
            <button key={player.id} onClick={() => send.approveChips({ playerId: player.id, amount, reason: 'host approved' }, (result) => !result.ok && setNotice(result.error))}>
              Approve {player.name}
            </button>
          ))}
    </div>
  );
}

function Scoreboard({ room }: { room: RoomPublicState }) {
  return (
    <div className="panel-block">
      <h2>Scoreboard</h2>
      {room.players.filter((player) => !player.banned).map((player) => (
        <div className="score-row" key={player.id}>
          <span>{player.name}</span>
          <b>{player.stack}</b>
          <em>{player.upDown >= 0 ? '+' : ''}{player.upDown}</em>
        </div>
      ))}
    </div>
  );
}

function HostControls({ room, setNotice }: { room: RoomPublicState; setNotice: (message: string) => void }) {
  return (
    <div className="panel-block">
      <h2><Crown size={18} /> Host</h2>
      <div className="control-strip wrap">
        <button onClick={() => send.hostAction({ action: 'lock', value: !room.settings.locked }, (result) => !result.ok && setNotice(result.error))}>
          <Lock size={16} /> {room.settings.locked ? 'Unlock' : 'Lock'}
        </button>
        <button onClick={() => send.hostAction({ action: 'spectators', value: !room.settings.spectatorsAllowed }, (result) => !result.ok && setNotice(result.error))}>
          <Eye size={16} /> Spectators {room.settings.spectatorsAllowed ? 'on' : 'off'}
        </button>
      </div>
      {room.players.filter((player) => !player.isHost).map((player) => (
        <div className="moderation-row" key={player.id}>
          <span>{player.name}</span>
          <button onClick={() => send.hostAction({ action: 'mute', playerId: player.id, value: !player.muted }, (result) => !result.ok && setNotice(result.error))}>Mute</button>
          <button onClick={() => send.hostAction({ action: 'forceSitOut', playerId: player.id }, (result) => !result.ok && setNotice(result.error))}>Sit out</button>
          <button onClick={() => send.hostAction({ action: 'transferHost', playerId: player.id }, (result) => !result.ok && setNotice(result.error))}>Host</button>
          <button className="danger" onClick={() => send.hostAction({ action: 'kick', playerId: player.id }, (result) => !result.ok && setNotice(result.error))}>
            <Ban size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function QueueModes({ room, setNotice }: { room: RoomPublicState; setNotice: (message: string) => void }) {
  const modes: CustomModeName[] = ['holdem', 'omaha4', 'bomb_pot', 'show_one', 'seven_two'];
  return (
    <div className="panel-block custom-queue">
      <h2><Zap size={18} /> Custom queue</h2>
      <div className="mode-buttons">
        {modes.map((mode) => (
          <button key={mode} disabled={!room.settings.custom.enabled || Boolean(room.queuedMode)} onClick={() => send.queueMode({ mode }, (result) => !result.ok && setNotice(result.error))}>
            {modeLabel(mode)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsView({ room, isHost, setNotice }: { room: RoomPublicState; isHost: boolean; setNotice: (message: string) => void }) {
  const [settings, setSettings] = useState(room.settings);
  useEffect(() => setSettings(room.settings), [room.settings]);
  const setNumber = (key: keyof RoomSettings, value: number) => setSettings((current) => ({ ...current, [key]: value }));
  return (
    <div className="settings-grid">
      <NumberField label="Small blind" value={settings.smallBlind} onChange={(value) => setNumber('smallBlind', value)} />
      <NumberField label="Big blind" value={settings.bigBlind} onChange={(value) => setNumber('bigBlind', value)} />
      <NumberField label="Buy-in" value={settings.buyIn} onChange={(value) => setNumber('buyIn', value)} />
      <NumberField label="Starting stack" value={settings.startingStack} onChange={(value) => setNumber('startingStack', value)} />
      <NumberField label="Min seats" value={settings.minSeats} onChange={(value) => setNumber('minSeats', value)} />
      <label className="toggle-line"><input type="checkbox" checked={settings.selfServiceChips} onChange={(event) => setSettings({ ...settings, selfServiceChips: event.target.checked })} /> Self-service play-money chips</label>
      <label className="toggle-line"><input type="checkbox" checked={settings.straddle.enabled} onChange={(event) => setSettings({ ...settings, straddle: { ...settings.straddle, enabled: event.target.checked } })} /> UTG straddle</label>
      <label className="toggle-line"><input type="checkbox" checked={settings.custom.enabled} onChange={(event) => setSettings({ ...settings, custom: { ...settings.custom, enabled: event.target.checked } })} /> Custom queue on</label>
      <label className="toggle-line"><input type="checkbox" checked={settings.sevenTwo.enabled} onChange={(event) => setSettings({ ...settings, sevenTwo: { ...settings.sevenTwo, enabled: event.target.checked } })} /> 7-2 bounty</label>
      <button disabled={!isHost} className="primary" onClick={() => send.updateSettings(settings, (result) => !result.ok && setNotice(result.error))}>
        <Settings size={18} /> Apply settings
      </button>
      <p className="boundary wide">Major setting changes are rejected during active hands and audit logged. Chip mode defaults to strict table-stakes accounting.</p>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function AuditView({ room }: { room: RoomPublicState }) {
  const [chat, setChat] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [room.audit.length, room.chat.length]);
  return (
    <div className="audit-grid">
      <section className="log-panel">
        <h2><Shield size={18} /> Audit log</h2>
        {room.audit.map((entry) => (
          <div className="log-row" key={entry.id}>
            <time>{new Date(entry.at).toLocaleTimeString()}</time>
            <span>{entry.type}</span>
            <p>{entry.message}</p>
          </div>
        ))}
        <div ref={bottom} />
      </section>
      <section className="log-panel">
        <h2><MessageSquare size={18} /> Chat</h2>
        {room.chat.map((entry) => (
          <div className={`chat-row ${entry.system ? 'system' : ''}`} key={entry.id}>
            <b>{entry.playerName}</b>
            <p>{entry.message}</p>
          </div>
        ))}
        <div className="inline-form">
          <input value={chat} onChange={(event) => setChat(event.target.value)} maxLength={240} />
          <button onClick={() => send.chat({ message: chat }, (result) => { if (!result.ok) return; setChat(''); })}>Send</button>
        </div>
      </section>
    </div>
  );
}

function EndSession({ setNotice }: { setNotice: (message: string) => void }) {
  return (
    <button
      className="ghost"
      onClick={() =>
        send.endSession({}, (result) => {
          if (!result.ok) return setNotice(result.error);
          download('feltline-session.txt', result.exportText, 'text/plain');
          download('feltline-session.json', result.exportJson, 'application/json');
          setNotice('Session export downloaded.');
        })
      }
    >
      <Download size={17} /> End
    </button>
  );
}

function emptyLegal(): LegalActions {
  return {
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canBet: false,
    canRaise: false,
    minBet: 0,
    minRaiseTo: 0,
    maxBet: 0,
    allInAmount: 0,
    potSize: 0
  };
}

function variantTitle(variant: string): string {
  return variant === 'holdem' ? "NL Hold'em" : variant === 'omaha4' ? 'PLO' : '5-card Omaha';
}

const send = {
  createRoom(payload: Parameters<ClientToServerEvents['createRoom']>[0], ack: Parameters<ClientToServerEvents['createRoom']>[1]) {
    socket.emit('createRoom', payload, ack);
  },
  joinRoom(payload: Parameters<ClientToServerEvents['joinRoom']>[0], ack: Parameters<ClientToServerEvents['joinRoom']>[1]) {
    socket.emit('joinRoom', payload, ack);
  },
  updateSettings(payload: Parameters<ClientToServerEvents['updateSettings']>[0], ack: Parameters<ClientToServerEvents['updateSettings']>[1]) {
    socket.emit('updateSettings', payload, ack);
  },
  sit(payload: Parameters<ClientToServerEvents['sit']>[0], ack: Parameters<ClientToServerEvents['sit']>[1]) {
    socket.emit('sit', payload, ack);
  },
  ready(payload: Parameters<ClientToServerEvents['ready']>[0], ack: Parameters<ClientToServerEvents['ready']>[1]) {
    socket.emit('ready', payload, ack);
  },
  startGame(payload: Parameters<ClientToServerEvents['startGame']>[0], ack: Parameters<ClientToServerEvents['startGame']>[1]) {
    socket.emit('startGame', payload, ack);
  },
  act(payload: Parameters<ClientToServerEvents['act']>[0], ack: Parameters<ClientToServerEvents['act']>[1]) {
    socket.emit('act', payload, ack);
  },
  requestChips(payload: Parameters<ClientToServerEvents['requestChips']>[0], ack: Parameters<ClientToServerEvents['requestChips']>[1]) {
    socket.emit('requestChips', payload, ack);
  },
  approveChips(payload: Parameters<ClientToServerEvents['approveChips']>[0], ack: Parameters<ClientToServerEvents['approveChips']>[1]) {
    socket.emit('approveChips', payload, ack);
  },
  queueMode(payload: Parameters<ClientToServerEvents['queueMode']>[0], ack: Parameters<ClientToServerEvents['queueMode']>[1]) {
    socket.emit('queueMode', payload, ack);
  },
  hostAction(payload: Parameters<ClientToServerEvents['hostAction']>[0], ack: Parameters<ClientToServerEvents['hostAction']>[1]) {
    socket.emit('hostAction', payload, ack);
  },
  chat(payload: Parameters<ClientToServerEvents['chat']>[0], ack: Parameters<ClientToServerEvents['chat']>[1]) {
    socket.emit('chat', payload, ack);
  },
  endSession(payload: Parameters<ClientToServerEvents['endSession']>[0], ack: Parameters<ClientToServerEvents['endSession']>[1]) {
    socket.emit('endSession', payload, ack);
  }
};

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
    if (roomFromUrl && parsed) return { ...parsed, code: roomFromUrl };
    if (roomFromUrl) return { code: roomFromUrl, playerId: '', sessionToken: '' };
    return parsed;
  } catch {
    return roomFromUrl ? { code: roomFromUrl, playerId: '', sessionToken: '' } : null;
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
